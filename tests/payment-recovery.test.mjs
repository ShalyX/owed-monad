import test from "node:test";
import assert from "node:assert/strict";
import { CHAIN, transferData, microUsdc } from "../public/payments.js";
import { validHash, transferClaimed, beginWalletSubmission, walletBroadcast, undoRejectedSubmission, attachRecoveryHash, classifyChainReceipt } from "../public/payment-recovery.js";
import { makeReceiptProof } from "../public/receipt.js";
const payer="0x"+"1".repeat(40), recipient="0x"+"2".repeat(40), other="0x"+"3".repeat(40);
const hash="0x"+"a".repeat(64), alternative="0x"+"b".repeat(64);
const topic=(address)=>"0x"+address.slice(2).padStart(64,"0");
const TRANSFER="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const fresh=(id="coffee")=>({id,kind:"money",status:"open",amount:0.01,title:"Coffee"});
const mock=(txHash=hash)=>({
  chainId:"0x279f",
  transaction:{hash:txHash,from:payer,to:CHAIN.usdc,input:transferData(recipient,0.01),blockHash:alternative},
  receipt:{transactionHash:txHash,from:payer,to:CHAIN.usdc,blockHash:alternative,status:"0x1",blockNumber:"0x2710",
    logs:[{address:CHAIN.usdc,topics:[TRANSFER,topic(payer),topic(recipient)],data:"0x"+microUsdc("0.01").toString(16)}]}
});
test("pre-sign transaction journal survives reload and prevents a second send",()=>{
 const original=fresh();
 assert.equal(beginWalletSubmission(original,payer,recipient),true);
 const persisted=JSON.parse(JSON.stringify(original));
 assert.equal(persisted.status,"submitting");
 assert.equal(persisted.txHash,"");
 assert.equal(beginWalletSubmission(persisted,payer,recipient),false);
 assert.equal(attachRecoveryHash(persisted,hash,[{obligations:[persisted]}]),true);
 assert.equal(persisted.status,"pending");
 assert.equal(classifyChainReceipt(mock(),persisted),"settled");
 assert.ok(makeReceiptProof(mock(),{...persisted,status:"settled"}));
});
test("wallet rejects signature: no submitted hash and safe return to unpaid",()=>{
 const x=fresh();beginWalletSubmission(x,payer,recipient);
 assert.equal(undoRejectedSubmission(x),true);
 assert.equal(x.status,"open");
 assert.equal(undoRejectedSubmission(x),false);
});
test("wallet broadcast records tx before polling and remains pending across reload",()=>{
 const x=fresh();beginWalletSubmission(x,payer,recipient);
 assert.equal(walletBroadcast(x,hash),true);
 const copy=JSON.parse(JSON.stringify(x));
 assert.equal(copy.status,"pending");
 assert.equal(copy.txHash,hash);
 assert.equal(classifyChainReceipt({...mock(),receipt:null,transaction:null},copy),"pending");
 assert.equal(beginWalletSubmission(copy,payer,recipient),false);
});
test("failed transaction never counts as settled or verified",()=>{
 const x=fresh();beginWalletSubmission(x,payer,recipient);walletBroadcast(x,hash);
 assert.equal(classifyChainReceipt({...mock(),receipt:{...mock().receipt,status:"0x0",logs:[]}},x),"failed");
 assert.equal(makeReceiptProof({...mock(),receipt:{...mock().receipt,status:"0x0",logs:[]}}, {...x,status:"settled"}),null);
});
test("wrong chain, recipient, amount, payer, contract or calldata cannot settle",()=>{
 const x=fresh();beginWalletSubmission(x,payer,recipient);walletBroadcast(x,hash);
 const valid=mock();
 for(const [label,data] of [
  ["chain",{...valid,chainId:"0x1"}],
  ["to",{...valid,transaction:{...valid.transaction,to:other}}],
  ["data",{...valid,transaction:{...valid.transaction,input:transferData(other,0.01)}}],
  ["payer",{...valid,transaction:{...valid.transaction,from:other}}],
  ["log",{...valid,receipt:{...valid.receipt,logs:[]}}],
  ["token",{...valid,receipt:{...valid.receipt,to:other}}],
  ["hash",{...valid,transaction:{...valid.transaction,hash:alternative}}],
  ["amount",{...valid,transaction:{...valid.transaction,input:transferData(recipient,0.02)}}]
 ]) assert.equal(classifyChainReceipt(data,x),"mismatch",label);
});
test("transaction hash cannot satisfy two local debts",()=>{
 const a=fresh("first"),b=fresh("second");beginWalletSubmission(a,payer,recipient);walletBroadcast(a,hash);
 beginWalletSubmission(b,payer,recipient);
 const groups=[{obligations:[a,b]}];
 assert.equal(transferClaimed(groups,hash,b.id),true);
 assert.equal(attachRecoveryHash(b,hash,groups),false);
 assert.equal(attachRecoveryHash(b,alternative,groups),true);
 assert.equal(transferClaimed(groups,alternative,a.id),true);
});
test("hash cannot be attached to a different recipient or from an unrelated sender",()=>{
 const x=fresh();beginWalletSubmission(x,payer,recipient);
 assert.equal(attachRecoveryHash(x,"0x1234",[{obligations:[x]}]),false);
 assert.equal(attachRecoveryHash(x,hash,[{obligations:[x]}]),true);
 assert.equal(classifyChainReceipt(mock(),{...x,recipientAddress:other}),"mismatch");
 assert.equal(classifyChainReceipt(mock(),{...x,payer:other}),"mismatch");
});
test("a settled item and suspicious review item cannot start a second payment",()=>{
 for(const status of ["pending","submitting","review","settled"]){
  const x={...fresh(),status};
  assert.equal(beginWalletSubmission(x,payer,recipient),false,status);
 }
});
