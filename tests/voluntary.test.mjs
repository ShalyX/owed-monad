import test from "node:test";
import assert from "node:assert/strict";
import { findVoluntaryRequests } from "../public/voluntary-request.js";
import { cleanAnalysis } from "../lib/obligations.mjs";
const message="Hey, could I please get a dollar from you? I need some help with expenses.";
const empty=()=>({title:"Friend's message",obligations:[]});
test("spoken-style request for a dollar becomes one voluntary money item, not debt",()=>{
 const recovered=cleanAnalysis(empty(),message,"text","incoming");
 assert.equal(recovered.obligations.length,1);
 const item=recovered.obligations[0];
 assert.equal(item.kind,"money");
 assert.equal(item.intent,"voluntary_request");
 assert.equal(item.direction,"i_owe");
 assert.equal(item.amount,1);
 assert.equal(item.status,"open");
 assert.equal(item.recipientAddress,"");
 assert.equal(item.txHash,"");
 assert.match(item.contextNote,/not money already owed/i);
 assert.ok(message.includes(item.evidence));
});
test("amounts from voluntary asks can be dollar words or numeric, but never guessed",()=>{
 const cases=[
  ["Can I please get a dollar from you?",1],
  ["Could I get $1 from you to help with rent?",1],
  ["Can you spare me $5 for lunch?",5],
  ["Can you please give me two dollars?",2],
  ["Could you lend me 3 USD?",3],
  ["Can I borrow a few dollars from you?",null]
 ];
 for(const [source,expected] of cases){
  const results=findVoluntaryRequests(source);
  assert.equal(results.length, expected===null?0:1,source);
  if(expected!==null)assert.equal(results[0].amount,expected);
 }
});
test("a voluntarily requested dollar from self-speaker isn't money already owed by them",()=>{
 const results=cleanAnalysis(empty(),"Could I get a dollar from you?","recording","recording");
 assert.equal(results.obligations.length,1);
 assert.equal(results.obligations[0].direction,"owed_to_me");
 assert.equal(results.obligations[0].intent,"voluntary_request");
});
test("reject hypothetical requests, advice, quotations and non-money asks",()=>{
 for(const source of [
  "If I could get a dollar from you, I might ask tomorrow.",
  "Imagine I asked: can I get a dollar from you?",
  "You should budget a dollar for each snack.",
  "Can I get a ride from you?",
  "Can I get a receipt from you?",
  "I spent a dollar on lunch.",
  "Can I get $1 if you win the match?",
  "I just wanted to say thanks.",
 ]){
  const results=findVoluntaryRequests(source);
  assert.equal(results.length,0,source);
 }
});
test("model mislabeling of the same request doesn't create duplicate to-do or fake debt",()=>{
 const transcript="Can I please get a dollar from you?";
 const original={
  title:"A favor",obligations:[
   {title:"Pay the sender",kind:"money",direction:"i_owe",amount:1,evidence:transcript},
   {title:"Send a dollar",kind:"task",direction:"i_owe",amount:null,evidence:transcript}
  ]
 };
 const analyzed=cleanAnalysis(original,transcript);
 assert.equal(analyzed.obligations.length,1);
 assert.equal(analyzed.obligations[0].intent,"voluntary_request");
 assert.equal(analyzed.obligations[0].amount,1);
});
test("independent to-do remains independent of a monetary favor",()=>{
 const transcript="Could I get a dollar from you? Also send me the meetup address.";
 const raw={title:"Friend",obligations:[
  {title:"Send address",kind:"task",direction:"i_owe",evidence:"send me the meetup address."}
 ]};
 const result=cleanAnalysis(raw,transcript);
 assert.equal(result.obligations.length,2);
 assert.deepEqual(result.obligations.map(x=>x.kind),["task","money"]);
});
test("requests without model JSON are still recoverable through source-grounded analysis",()=>{
 const text="Can I get a dollar from you?";
 const result=cleanAnalysis(empty(),text);
 assert.equal(result.obligations[0].intent,"voluntary_request");
});

test("HTTP API recovers an explicit voluntary request even when model returns no items or unusable JSON",async()=>{
 const {createServer}=await import("node:http");
 const {makeServer}=await import("../server.mjs");
 let mode="empty";
 const mock=createServer(async(req,res)=>{
  for await(const _ of req){}
  res.writeHead(200,{"content-type":"application/json"});
  res.end(JSON.stringify({choices:[{message:{content:mode==="empty"?
   JSON.stringify({title:"No obligations",obligations:[]}):
   JSON.stringify({title:"Missing list",tasks:[]})}}]}));
 });
 await new Promise(ok=>mock.listen(0,"127.0.0.1",ok));
 const previous={HF_TOKEN:process.env.HF_TOKEN,HF_CHAT_ENDPOINT:process.env.HF_CHAT_ENDPOINT,
  LOCAL_INFERENCE_URL:process.env.LOCAL_INFERENCE_URL};
 process.env.HF_TOKEN="test-only";
 process.env.HF_CHAT_ENDPOINT="http://127.0.0.1:"+mock.address().port+"/chat";
 delete process.env.LOCAL_INFERENCE_URL;
 const app=makeServer();
 await new Promise(ok=>app.listen(0,"127.0.0.1",ok));
 try {
  for(const state of ["empty","invalid"]){
   mode=state;
   const response=await fetch("http://127.0.0.1:"+app.address().port+"/api/analyze-text",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({text:message})
   });
   const result=await response.json();
   assert.equal(response.status,200,state);
   assert.equal(result.obligations.length,1,state);
   assert.equal(result.obligations[0].intent,"voluntary_request",state);
   assert.equal(result.obligations[0].amount,1,state);
   assert.equal(result.obligations[0].recipientAddress,"",state);
  }
 }finally{
  await new Promise(ok=>app.close(ok));
  await new Promise(ok=>mock.close(ok));
  for(const [k,v] of Object.entries(previous)){
   if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
 }
});

test("small-model money hallucination in background explanation is not another debt",()=>{
 const text="Could I please get a dollar from you? I'm short on grocery money.";
 const raw={title:"Help request",obligations:[
  {title:"Grocery money",kind:"money",direction:"unclear",amount:null,evidence:"I'm short on grocery money."}
 ]};
 const group=cleanAnalysis(raw,text);
 assert.equal(group.obligations.length,1);
 assert.equal(group.obligations[0].intent,"voluntary_request");
 assert.equal(group.obligations[0].amount,1);
});
