import test from "node:test";
import assert from "node:assert/strict";
import { getChainReceipt, isReceiptHash } from "../lib/chain-receipts.mjs";
import { makeServer } from "../server.mjs";
import { makeReceiptProof } from "../public/receipt.js";
import { CHAIN, microUsdc, transferData } from "../public/payments.js";

const hash = "0x" + "a".repeat(64);
const sender = "0x" + "1".repeat(40);
const recipient = "0x" + "2".repeat(40);
const topic = (address) => "0x" + address.slice(2).padStart(64, "0");
const transfer = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const receipt = {
  transactionHash: hash, blockHash: "0x" + "b".repeat(64), blockNumber: "0x2710",
  from: sender, to: CHAIN.usdc, status: "0x1", gasUsed: "0x5208",
  logs: [{address: CHAIN.usdc, topics: [transfer, topic(sender), topic(recipient)], data: "0x"+microUsdc("0.01").toString(16)}]
};
const item = {status:"settled",kind:"money",amount:0.01,txHash:hash,payer:sender,recipientAddress:recipient};
const transaction = {hash,from:sender,to:CHAIN.usdc,input:transferData(recipient,0.01),blockHash:receipt.blockHash};
const response = (result) => ({ok:true,json:async() => ({jsonrpc:"2.0",id:1,result})});
const stubRpc = async (url,req) => {
  assert.equal(url, "https://rpc.example.test");
  const body = JSON.parse(req.body);
  if (body.method==="eth_chainId") return response("0x279f");
  if (body.method==="eth_getTransactionReceipt") { assert.equal(body.params[0],hash); return response(receipt); }
  if (body.method==="eth_getTransactionByHash") { assert.equal(body.params[0],hash); return response(transaction); }
  if (body.method==="eth_getBlockByNumber") { assert.equal(body.params[0],receipt.blockNumber); return response({hash:receipt.blockHash,timestamp:"0x67900000"}); }
  throw Error("Unexpected RPC "+body.method);
};
test("receipt RPC adapter retrieves Monad chain, mined receipt and matching block timestamp", async()=>{
  const data=await getChainReceipt(hash,stubRpc,"https://rpc.example.test");
  assert.equal(data.chainId,"0x279f");
  assert.equal(data.receipt.transactionHash,hash);
  assert.equal(data.blockTimestamp,"0x67900000");
  const proof=makeReceiptProof(data,item);
  assert.equal(proof.amount,0.01);
  assert.equal(proof.from,sender);
  assert.equal(proof.to,recipient);
  assert.equal(proof.block,"10000");
  assert.equal(proof.timestamp,Number(BigInt("0x67900000"))*1000);
});
test("receipt cannot be shown verified for wrong chain, wrong token or wrong Transfer",async()=>{
  const result={chainId:"0x279f",receipt,transaction,blockTimestamp:"0x67900000"};
  assert.equal(makeReceiptProof({...result,chainId:"0x1"},item),null);
  assert.equal(makeReceiptProof(result,{...item,status:"dismissed"}),null);
  assert.equal(makeReceiptProof(result,{...item,amount:12}),null);
  assert.equal(makeReceiptProof(result,{...item,payer:recipient}),null);
  assert.equal(makeReceiptProof(result,{...item,recipientAddress:sender}),null);
  assert.equal(makeReceiptProof(result,{...item,txHash:"0x"+"c".repeat(64)}),null);
  assert.equal(makeReceiptProof({...result,receipt:{...receipt,status:"0x0"}},item),null);
  assert.equal(makeReceiptProof({...result,receipt:{...receipt,to:sender}},item),null);
  assert.equal(makeReceiptProof({...result,receipt:{...receipt,logs:[]}},item),null);
  assert.equal(makeReceiptProof({...result,transaction:null},item),null);
  assert.equal(makeReceiptProof({...result,transaction:{...transaction,to:sender}},item),null);
  assert.equal(makeReceiptProof({...result,transaction:{...transaction,input:transferData(sender,0.01)}},item),null);
});
test("RPC receipt lookup refuses invalid hashes and fake receipts",async()=>{
  assert.equal(isReceiptHash(hash),true);
  assert.equal(isReceiptHash("0x1234"),false);
  await assert.rejects(()=>getChainReceipt("garbage",()=>{throw Error("RPC should not be called")}),/Invalid transaction hash/);
  const fake = async (url,req) => {
    const method=JSON.parse(req.body).method;
    return response(method==="eth_chainId"?"0x279f":method==="eth_getTransactionReceipt"?{...receipt,transactionHash:"0x"+"c".repeat(64)}:transaction);
  };
  await assert.rejects(()=>getChainReceipt(hash,fake),/mismatched transaction receipt/);
});
test("public receipt route validates hashes before contacting RPC", async()=>{
  const app=makeServer();
  await new Promise(ok=>app.listen(0,"127.0.0.1",ok));
  try {
    const res=await fetch("http://127.0.0.1:"+app.address().port+"/api/receipt?tx=not-a-hash");
    assert.equal(res.status,400);
    assert.match((await res.json()).error,/Invalid transaction hash/);
  } finally { await new Promise(ok=>app.close(ok)); }
});
test("missing transactions, wrong network and mismatched block hashes cannot forge proof",async()=>{
  const missing = await getChainReceipt(hash,async (url,req) => response(JSON.parse(req.body).method==="eth_chainId"?"0x279f":null));
  assert.equal(missing.receipt,null);
  assert.equal(makeReceiptProof(missing,item),null);
  await assert.rejects(()=>getChainReceipt(hash,async()=>response("0x1")),/chain mismatch/);
  const wrongBlock = await getChainReceipt(hash,async(url,req)=>{
    const method=JSON.parse(req.body).method;
    return response(method==="eth_chainId"?"0x279f":method==="eth_getTransactionReceipt"?receipt:method==="eth_getTransactionByHash"?transaction:{hash:"0x"+"d".repeat(64),timestamp:"0x67900000"});
  });
  assert.equal(wrongBlock.blockTimestamp,null);
});
