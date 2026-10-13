import test from "node:test";
import assert from "node:assert/strict";
import {reverifyEditedMoney} from "../lib/source-reverify.mjs";
import {makeServer} from "../server.mjs";
const pay=(text,amount,direction="i_owe",evidence=text)=>({text,perspective:"incoming",amount,direction,evidence});
test("directly grounded money can pass independent source-only validation",()=>{
 const text="Hey, you still owe me $0.01 for coffee. Send when you get a chance.";
 const result=reverifyEditedMoney(pay(text,0.01,"i_owe","you still owe me $0.01 for coffee."));
 assert.equal(result.supported,true,JSON.stringify(result));
 assert.equal(result.receiptVerified,false);
 assert.equal(result.basis,"source_text_only");
 assert.match(result.sourceKey,/^[a-f0-9]{64}$/);
});
test("invented amount, invented quote and changed payer direction fail closed",()=>{
 const source="Hey, you still owe me $9 for printing.";
 for(const payload of [
  pay(source,15,"i_owe","you still owe me $9 for printing."),
  pay(source,9,"owed_to_me","you still owe me $9 for printing."),
  pay(source,9,"i_owe","you owe me $9 for lunch."),
 ])assert.equal(reverifyEditedMoney(payload).supported,false,JSON.stringify(payload));
});
test("withdrawals, conditional payments, acknowledged transfers and ambiguous groups never pass",()=>{
 const cases=[
  "You owe me $13 for dinner. Never mind, my treat.",
  "You owe me $13 only if you come to the party.",
  "You owe me $13 for dinner. Already paid, we're settled.",
  "Kemi: Nia, you owe me $13.\nNia: Okay.",
 ];
 for(const text of cases)assert.equal(reverifyEditedMoney(pay(text,13)).supported,false,text);
});
test("outstanding exact source amount is not a blockchain receipt",()=>{
 const source="You still owe me $7 for the return ticket.";
 const result=reverifyEditedMoney(pay(source,7));
 assert.equal(result.receiptVerified,false);
 assert.match(result.reason,/does not verify.*blockchain/i);
});
test("endpoint declines group source and altered amounts without making a payment",async()=>{
 const server=makeServer({publicDemo:false});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const url="http://127.0.0.1:"+server.address().port+"/api/reverify-item";
 try{
  let resp=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(pay("You still owe me $5 for coffee.",5))});
  assert.equal(resp.status,200);assert.equal((await resp.json()).supported,true);
  resp=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(pay("You still owe me $5 for coffee.",12))});
  assert.equal(resp.status,200);assert.equal((await resp.json()).supported,false);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test("source-only endpoint requires same-origin and enforces bounded public check quota",async()=>{
 const {createPublicGate}=await import("../lib/public-gate.mjs");
 const gate=createPublicGate({publicDemo:true,sourceRechecksPerMinute:1});
 const mock=(origin)=>({method:"POST",socket:{remoteAddress:"198.51.100.17"},
  headers:{host:"owed.example",origin,"sec-fetch-site":"same-origin"}});
 assert.equal(gate.admit(mock("https://elsewhere.example"),"/api/reverify-item").status,403);
 assert.equal(gate.admit(mock("https://owed.example"),"/api/reverify-item").ok,true);
 assert.equal(gate.admit(mock("https://owed.example"),"/api/reverify-item").status,429);
 const receipt={method:"GET",socket:{remoteAddress:"198.51.100.17"},headers:{host:"owed.example"}};
 assert.equal(gate.admit(receipt,"/api/receipt").ok,true);
});
