import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { makeServer } from "../server.mjs";
import { cleanAnalysis } from "../lib/obligations.mjs";
import { CHAIN, microUsdc, transferData, receiptMatches, getWalletBalances } from "../public/payments.js";

const FROM = "0x" + "1".repeat(40);
const TO = "0x" + "2".repeat(40);
const TEXT = "Hey, you owe me $12 for the cab and $6 for lunch. Please send the address.";
const fixture = () => ({
  title: "Dinner", summary: "Two reimbursements and an address.",
  obligations: [
    { title: "Cab", kind: "money", direction: "i_owe", amount: 12, recipientAddress: TO, evidence: "you owe me $12 for the cab" },
    { title: "Lunch", kind: "money", direction: "i_owe", amount: 6, evidence: "$6 for lunch" },
    { title: "Address", kind: "task", direction: "i_owe", amount: null, evidence: "Please send the address." }
  ]
});
test("source evidence and wallet authority are enforced", () => {
  const x = cleanAnalysis(fixture(), TEXT);
  assert.equal(x.obligations.length, 3);
  assert.deepEqual(x.obligations.map((y) => y.amount), [12, 6, null]);
  assert.equal(x.obligations[0].recipientAddress, "");
  const f = fixture(); f.obligations[0].amount = 1200; f.obligations[1].evidence = "invented";
  const bad = cleanAnalysis(f, TEXT);
  assert.equal(bad.obligations.length, 2);
  assert.equal(bad.obligations[0].amount, null);
});
test("money direction is derived from the exact quote, not a small model guess", () => {
  const item = (evidence) => ({obligations:[{title:"Payment",kind:"money",direction:"i_owe",amount:8,evidence}]});
  const incoming = cleanAnalysis(item("I owe you $8"), "I owe you $8");
  assert.equal(incoming.obligations[0].direction, "owed_to_me");
  const vague = cleanAnalysis(item("The cab cost $8"), "The cab cost $8");
  assert.equal(vague.obligations[0].direction, "unclear");
  const certain = cleanAnalysis(item("you owe me $8"), "you owe me $8");
  assert.equal(certain.obligations[0].direction, "i_owe");
  const recording = cleanAnalysis(item("I owe you $8"), "I owe you $8", "text", "recording");
  assert.equal(recording.obligations[0].direction, "i_owe");
});
test("transfer amount, calldata and recipient match expected USDC encoding", () => {
  assert.equal(microUsdc("12.50"), 12500000n);
  assert.equal(transferData(TO, "12.50"), "0xa9059cbb" + TO.slice(2).padStart(64, "0") + 12500000n.toString(16).padStart(64, "0"));
  assert.throws(() => microUsdc("0"));
  assert.throws(() => microUsdc("1.1234567"));
});
test("balance preflight reads native gas and exact ERC20 balance", async () => {
  const calls = [];
  const provider = { request: async ({ method, params }) => {
    calls.push({method,params});
    return method === "eth_getBalance" ? "0x2386f26fc10000" : "0xf4240";
  }};
  const balance = await getWalletBalances(provider, FROM);
  assert.equal(balance.usdc, 1000000n);
  assert.ok(balance.mon > 0n);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].params[0].to.toLowerCase(), CHAIN.usdc.toLowerCase());
});
test("onchain evidence must match token, sender, destination, amount and status", () => {
  const topic = (x) => "0x" + x.slice(2).padStart(64, "0");
  const receipt = {
    status: "0x1", from: FROM, to: CHAIN.usdc,
    logs: [{ address: CHAIN.usdc,
      topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", topic(FROM), topic(TO)],
      data: "0x"+microUsdc("12").toString(16) }]
  };
  assert.equal(receiptMatches(receipt, FROM, TO, 12), true);
  assert.equal(receiptMatches(receipt, FROM, TO, 13), false);
  assert.equal(receiptMatches({...receipt, status:"0x0"}, FROM, TO, 12), false);
  assert.equal(receiptMatches({...receipt, to:TO}, FROM, TO, 12), false);
});
test("text and audio both run through provider-backed inference; no fabricated receipts", async () => {
  const mock = createServer(async (req, res) => {
    for await (const _ of req) {}
    res.writeHead(200, {"content-type":"application/json"});
    res.end(JSON.stringify(req.url === "/asr" ? { text:TEXT } : { choices:[{message:{content:JSON.stringify(fixture())}}] }));
  });
  await new Promise((resolve) => mock.listen(0, "127.0.0.1", resolve));
  const old = {HF_TOKEN:process.env.HF_TOKEN, HF_CHAT_ENDPOINT:process.env.HF_CHAT_ENDPOINT, HF_WHISPER_ENDPOINT:process.env.HF_WHISPER_ENDPOINT};
  process.env.HF_TOKEN = "test-token";
  process.env.HF_CHAT_ENDPOINT = "http://127.0.0.1:" + mock.address().port + "/chat";
  process.env.HF_WHISPER_ENDPOINT = "http://127.0.0.1:" + mock.address().port + "/asr";
  const app = makeServer();
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + app.address().port;
  try {
    const home = await fetch(origin+"/");
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Owed/);
    const resp = await fetch(origin+"/api/analyze-text", {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({text:TEXT})});
    assert.equal(resp.status, 200);
    const obj = await resp.json();
    assert.equal(obj.obligations.length, 3);
    assert.equal(obj.obligations[0].txHash, "");
    const form = new FormData();
    form.append("audio", new File([new Uint8Array([82,73,70,70])], "sample.wav", {type:"audio/wav"}));
    const audio = await fetch(origin+"/api/analyze-audio", {method:"POST",body:form});
    assert.equal(audio.status, 200, JSON.stringify(await audio.clone().json()));
    assert.equal((await audio.json()).source, "audio");
    const cfg = await (await fetch(origin+"/api/config")).json();
    assert.equal(cfg.chainId, 10143);
    assert.equal(cfg.usdc, CHAIN.usdc);
  } finally {
    await new Promise((resolve) => app.close(resolve));
    await new Promise((resolve) => mock.close(resolve));
    for (const [key,val] of Object.entries(old)) if (val === undefined) delete process.env[key]; else process.env[key] = val;
  }
});