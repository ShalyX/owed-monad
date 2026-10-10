// Headless-browser check for wallet connection UX. Wallet is mocked; NEVER signs or sends.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const base = process.env.OWED_TEST_URL || "http://127.0.0.1:3034/";
const chrome = process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const dir = await mkdtemp(join(tmpdir(), "owed-recovery-ux-"));
const port = 19944;
const child = spawn(chrome, [
  "--headless=new", "--no-first-run", "--disable-extensions", "--disable-gpu",
  "--remote-allow-origins=*", "--window-size=1400,900",
  "--remote-debugging-port=" + port, "--user-data-dir=" + dir, "about:blank"
], { stdio: "ignore" });
let ws, server;
try {
  // Local app serves the same frontend without making inference or wallet calls.
  if (base.startsWith("http://127.0.0.1:3034/")) {
    server = spawn(process.execPath, ["server.mjs"], { env: { ...process.env, HOST: "127.0.0.1", PORT: "3034" }, stdio: "ignore" });
  }
  let page;
  for (let i = 0; i < 90; i++) {
    try {
      const tabs = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
      page = tabs.find((tab) => tab.type === "page");
      if (page) break;
    } catch {}
    await sleep(200);
  }
  if (!page) throw Error("Chrome debugging tab not ready");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.addEventListener("open", ok, { once: true }); ws.addEventListener("error", fail, { once: true }); });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(String(event.data));
    const p = pending.get(msg.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(msg.id);
    if (msg.error || msg.result?.exceptionDetails) p.reject(Error(JSON.stringify(msg.error || msg.result.exceptionDetails)));
    else p.resolve(msg.result?.result?.value ?? msg.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error(method + " timeout")); }, 15000);
    pending.set(n, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const js = (expression) => call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  await call("Page.enable");
  await call("Runtime.enable");
  const injected = `(() => {
    const account = "0x1111111111111111111111111111111111111111";
    window.__walletTest = { sent: 0, account, chain: "0x279f", listeners: {} };
    window.ethereum = {
      isMetaMask: true,
      on(name, cb) { window.__walletTest.listeners[name] = cb; },
      async request({method}) {
        if (method === "eth_accounts" || method === "eth_requestAccounts") return [account];
        if (method === "eth_chainId") return window.__walletTest.chain;
        if (method === "eth_getBalance") return "0xde0b6b3a7640000";
        if (method === "eth_call") return "0xf4240";
        if (method === "eth_sendTransaction") { window.__walletTest.sent++; throw Error("Browser test cannot sign"); }
        throw Error("Unexpected method " + method);
      }
    };
  })();`;
  await call("Page.addScriptToEvaluateOnNewDocument", { source: injected });
  await call("Page.addScriptToEvaluateOnNewDocument",{source:"(() => {\n  const native=window.fetch.bind(window);\n  window.fetch=(input,init)=>{\n    const url=typeof input===\"string\"?input:(input?.url||\"\");\n    if(!url.startsWith(\"/api/receipt?\"))return native(input,init);\n    const hash=new URL(url,location.href).searchParams.get(\"tx\");\n    const payer=\"0x1111111111111111111111111111111111111111\";\n    const recipient=\"0x2222222222222222222222222222222222222222\";\n    const token=\"0x534b2f3A21130d7a60830c2Df862319e593943A3\";\n    const data=\"0xa9059cbb\"+recipient.slice(2).padStart(64,\"0\")+\"2710\".padStart(64,\"0\");\n    const topic=address=>\"0x\"+address.slice(2).padStart(64,\"0\");\n    const result={chainId:\"0x279f\",transaction:{hash,from:payer,to:token,input:data,blockHash:\"0x\"+\"b\".repeat(64)},\n      receipt:{transactionHash:hash,blockHash:\"0x\"+\"b\".repeat(64),blockNumber:\"0x300\",from:payer,to:token,status:\"0x1\",\n        logs:[{address:token,topics:[\"0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef\",topic(payer),topic(recipient)],data:\"0x2710\"}]}};\n    return Promise.resolve(new Response(JSON.stringify(result),{status:200,headers:{\"content-type\":\"application/json\"}}));\n  };\n  const old=window.ethereum.request.bind(window.ethereum);\n  window.ethereum.request=async(args)=>args.method===\"eth_accounts\"&&localStorage.getItem(\"test_wallet_disconnected\")===\"yes\"?[]:old(args);\n})()"});
  let ready = false;
  for (let i = 0; i < 55; i++) {
    try {
      await call("Page.navigate", { url: base });
      for (let n = 0; n < 8; n++) {
        const state = await js("({url:location.href, ready:!!document.querySelector('#walletStatus')})");
        if (state.ready && state.url.startsWith(base)) { ready = true; break; }
        await sleep(250);
      }
      if (ready) break;
    } catch {}
    await sleep(250);
  }
  if (!ready) throw Error("Local Owed page failed to load");
  // An interrupted browser tab must not show another payment action.
  const sender="0x1111111111111111111111111111111111111111";
  const recipient="0x2222222222222222222222222222222222222222";
  const hash="0x"+"a".repeat(64);
  const sample={id:"recover-chat",fingerprint:"recover-chat",source:"text",title:"Coffee test",isSample:false,
    transcript:"You still owe me 0.01 USDC for coffee.",obligations:[{
      id:"recover-1",kind:"money",direction:"i_owe",title:"Coffee",amount:0.01,
      evidence:"You still owe me 0.01 USDC for coffee.",payer:sender,recipientAddress:recipient,
      status:"submitting",startedAt:new Date().toISOString(),txHash:""
    }]};
  await js("localStorage.setItem('owed-v1-inbox',JSON.stringify("+JSON.stringify([sample])+"))");
  await js("localStorage.setItem('test_wallet_disconnected','yes')");
  await call("Page.reload",{ignoreCache:true});
  await sleep(900);
  let state=await js("({visible:document.querySelector('#inbox').textContent,pay:document.querySelector('[data-action=pay]')?.textContent||'',review:!!document.querySelector('[data-action=recover]'),notice:document.querySelector('#notice').textContent,sent:window.__walletTest.sent})");
  if(!state.review||state.pay||!state.notice.includes("authorization")||state.sent)throw Error("Interrupted signing is not blocked: "+JSON.stringify(state));
  console.log("PASS_INTERRUPTED_WALLET_JOURNAL "+JSON.stringify({review:state.review,noPay:!state.pay,notice:state.notice}));
  await js("document.querySelector('[data-action=recover]').click()");
  state=await js("({open:document.querySelector('#recoveryDialog').open,noSend:!document.querySelector('#recoveryNoSend').classList.contains('hidden'),info:document.querySelector('#recoveryDetails').textContent})");
  if(!state.open||!state.noSend||!state.info.includes("0.01")||!state.info.includes(sender))throw Error("Recovery details missing: "+JSON.stringify(state));
  await js("document.querySelector('#recoveryHash').value="+JSON.stringify(hash)+";document.querySelector('#recoveryVerify').click()");
  let ok=false;
  for(let i=0;i<70;i++){
    const details=await js("({items:JSON.parse(localStorage.getItem('owed-v1-inbox')),verified:document.querySelector('#inbox').textContent.includes('Verified onchain'),sent:window.__walletTest.sent})");
    if(details.items?.[0]?.obligations?.[0]?.status==='settled'&&details.verified&&!details.sent){ok=true;break}
    await sleep(140);
  }
  if(!ok)throw Error("Recovery did not verify mocked transaction with wallet disconnected");
  console.log("PASS_RECOVERED_NO_WALLET_AND_NO_NEW_TRANSFER");
  await call("Page.reload",{ignoreCache:true});
  await sleep(900);
  ok=false;
  for(let i=0;i<70;i++){
    const status=await js("({verified:document.querySelector('#inbox').textContent.includes('Verified onchain'),sent:window.__walletTest.sent})");
    if(status.verified&&!status.sent){ok=true;break}
    await sleep(120);
  }
  if(!ok)throw Error("Recovered settlement did not survive reload and independent verification");
  console.log("PASS_SETTLEMENT_SURVIVES_RELOAD");
  await js("(() => {const list=JSON.parse(localStorage.getItem('owed-v1-inbox'));list[0].obligations.push({id:'recover-2',kind:'money',direction:'i_owe',amount:0.01,status:'submitting',title:'Second coffee',evidence:'You still owe me 0.01 USDC for coffee.',payer:"+JSON.stringify(sender)+",recipientAddress:"+JSON.stringify(recipient)+",txHash:''});localStorage.setItem('owed-v1-inbox',JSON.stringify(list))})()");
  await call("Page.reload",{ignoreCache:true});
  await sleep(900);
  await js("document.querySelector('[data-id=recover-2][data-action=recover]').click()");
  await js("document.querySelector('#recoveryHash').value="+JSON.stringify(hash)+";document.querySelector('#recoveryVerify').click()");
  state=await js("({warning:document.querySelector('#recoveryNotice').textContent,items:JSON.parse(localStorage.getItem('owed-v1-inbox'))[0].obligations,sent:window.__walletTest.sent})");
  if(!state.warning.includes("already assigned")||state.items.find(x=>x.id==='recover-2').status!=='submitting'||state.sent)throw Error("Hash reused across debts: "+JSON.stringify(state));
  console.log("PASS_NO_DUPLICATE_RECEIPT_CLAIMS");
} finally {
  if (ws?.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify({ id: 99999, method: "Browser.close" })); } catch {}
  }
  try { ws?.close(); } catch {}
  try { child.kill(); } catch {}
  try { server?.kill(); } catch {}
  await sleep(450);
  // Chrome on Windows sometimes holds its lockfile briefly after process shutdown.
  try { await rm(dir, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 }); }
  catch (error) { console.warn("Chrome profile cleanup deferred: " + error.code); }
}
