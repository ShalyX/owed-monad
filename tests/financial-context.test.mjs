import test from "node:test";
import assert from "node:assert/strict";
import {cleanAnalysis} from "../lib/obligations.mjs";
import {legacyPaymentWarning,inspectFinancialContext} from "../public/financial-context.js";

const empty=()=>({title:"Conversation",obligations:[]});
const modelMoney=(text,amount,kind="money")=>({title:"Conversation",obligations:[
  {title:"Money mentioned",kind,direction:"i_owe",amount,evidence:text}
]});
function analyze(text,raw=empty(),perspective="incoming"){
  return cleanAnalysis(raw,text,"text",perspective);
}
test("conditional debt cannot become payable from model or source fallback",()=>{
 for(const text of [
  "You owe me $20 if you get the tickets.",
  "If you get the tickets, you owe me $20.",
  "Once you collect the parcel, send me $20.",
  "I'll pay you $20 when I get my salary.",
  "You owe me $20 unless the event gets cancelled."
 ]){
  const group=analyze(text,modelMoney(text,20));
  assert.equal(group.obligations.filter(x=>x.kind==="money").length,0,text);
  assert.match(group.analysisNote,/conditional payment/i);
 }
});
test("unconditional debt in another sentence survives a separate condition",()=>{
 const text="You owe me $12 for coffee. If you get the tickets, send me $20 later.";
 const group=analyze(text);
 assert.deepEqual(group.obligations.filter(x=>x.kind==="money").map(x=>x.amount),[12]);
 assert.equal(group.obligations[0].direction,"i_owe");
});
test("a simple amount correction supersedes the earlier amount, never creates two debts",()=>{
 for(const text of [
  "You owe me $20. Actually make that $15 instead.",
  "You owe me $20, sorry make it $15 instead.",
  "Send me $20 for the tickets. Change that to $15."
 ]){
  const group=analyze(text,modelMoney(text,20));
  const money=group.obligations.filter(x=>x.kind==="money");
  assert.equal(money.length,1,text);
  assert.equal(money[0].amount,15,text);
  assert.equal(money[0].direction,"i_owe");
  assert.match(money[0].contextNote,/Revised from \$20 to \$15/);
  assert.ok(text.includes(money[0].evidence));
  assert.ok(!money.some(x=>x.amount===20));
  assert.equal(money[0].recipientAddress,"");
  assert.equal(money[0].txHash,"");
 }
});
test("corrected amount can be recovered even if the small model misses all items",()=>{
 const text="You owe me $20. Actually make it $15 instead.";
 const group=analyze(text);
 assert.equal(group.obligations.length,1);
 assert.equal(group.obligations[0].amount,15);
 assert.equal(group.obligations[0].direction,"i_owe");
});
test("the first amount isn't payable when several debts make a correction ambiguous",()=>{
 const text="You owe me $20 for lunch, plus $5 for parking. Actually make that $15.";
 const group=analyze(text,modelMoney(text,20));
 assert.equal(group.obligations.filter(x=>x.kind==="money"&&x.direction==="i_owe").length,0);
 assert.match(group.analysisNote,/clarification/i);
});
test("splitting a bill without a request is not a personal payment",()=>{
 for(const text of [
  "We split the $60 bill three ways.",
  "We split $60 between me and James.",
  "The bill is $60, we might split it with two other people.",
  "We split $60 three ways, no one owes anyone yet."
 ]){
  const group=analyze(text,modelMoney(text,60));
  assert.equal(group.obligations.some(x=>x.kind==="money"&&x.direction==="i_owe"),false,text);
 }
});
test("equal split plus explicit request derives individual share not full bill",()=>{
 for(const text of [
  "We split the $60 bill three ways. You owe me your share.",
  "Split $60 evenly between three people, send me your share."
 ]){
  const group=analyze(text,modelMoney(text,60));
  assert.equal(group.obligations.length,1,text);
  assert.equal(group.obligations[0].amount,20,text);
  assert.equal(group.obligations[0].direction,"i_owe",text);
  assert.match(group.obligations[0].contextNote,/Calculated as \$60/);
  assert.equal(group.obligations[0].recipientAddress,"");
 }
});
test("matching explicit share and group total produce a single $20, not $60",()=>{
 const text="We split $60 three ways, so send me $20 for your share.";
 const group=analyze(text,modelMoney(text,60));
 assert.deepEqual(group.obligations.filter(x=>x.kind==="money").map(x=>x.amount),[20]);
});
test("non-divisible amount never silently rounds a user's payment",()=>{
 const text="We split $100 three ways, you owe me your share.";
 const group=analyze(text,modelMoney(text,100));
 assert.equal(group.obligations.some(x=>x.kind==="money"&&x.direction==="i_owe"),false);
 assert.match(group.analysisNote,/exact payable share/i);
});
test("wrong explicit share in split is not silently corrected or payable",()=>{
 const text="We split $60 three ways. Send me $25 for your share.";
 const group=analyze(text,modelMoney(text,60));
 assert.equal(group.obligations.filter(x=>x.kind==="money"&&x.direction==="i_owe").length,0);
 assert.match(group.analysisNote,/share/);
});
test("money estimate alone still never becomes payable",()=>{
 const text="For those soccer boots you should need around $250.";
 assert.equal(analyze(text).obligations.length,0);
});
test("legacy stored conditional, revised, and split money are blocked at pay time",()=>{
 const cases=[
  ["You owe me $20 if you get the tickets.",20],
  ["You owe me $20. Actually make that $15 instead.",20],
  ["We split the $60 bill three ways. You owe me your share.",60]
 ];
 for(const [text,amount] of cases) {
  const blocked=legacyPaymentWarning({kind:"money",amount,evidence:text},text);
  assert.equal(typeof blocked,"string",text);
 }
 const direct="You owe me $20.";
 assert.equal(legacyPaymentWarning({kind:"money",amount:20,evidence:direct},direct),null);
});
test("newly reconciled split and corrected amounts remain actionable only with supporting context",()=>{
 const corrected=analyze("You owe me $20. Actually make that $15 instead.").obligations[0];
 assert.equal(legacyPaymentWarning(corrected,"You owe me $20. Actually make that $15 instead."),null);
 const split=analyze("We split $60 three ways. You owe me your share.").obligations[0];
 assert.equal(legacyPaymentWarning(split,"We split $60 three ways. You owe me your share."),null);
});
test("speaker perspective is preserved for conditional and revised commitments",()=>{
 const note="I owe you $20. Actually make that $15 instead.";
 assert.equal(analyze(note,empty(),"recording").obligations[0].direction,"i_owe");
 assert.equal(analyze(note,empty(),"incoming").obligations[0].direction,"owed_to_me");
 const conditional="I owe you $20 if we win.";
 assert.equal(analyze(conditional,modelMoney(conditional,20),"recording").obligations.length,0);
});


test("small-model conflicting split amount cannot survive the final money guard",()=>{
 const text="We split $60 three ways. Send me $25 for your share.";
 const raw={title:"Bill",obligations:[
  {kind:"money",title:"Share",amount:25,direction:"i_owe",evidence:"Send me $25 for your share."},
  {kind:"money",title:"Total",amount:60,direction:"i_owe",evidence:"We split $60 three ways."}
 ]};
 const group=analyze(text,raw);
 assert.equal(group.obligations.filter(x=>x.kind==="money").length,0);
 assert.match(group.analysisNote,/share/i);
});
test("even a model-generated amount is blocked when a correction is unparseable",()=>{
 const text="You owe me $20 for dinner. Wait, no, $15 instead.";
 const raw=modelMoney(text,20);
 const group=analyze(text,raw);
 assert.equal(group.obligations.filter(x=>x.kind==="money").length,0);
 assert.match(group.analysisNote,/correction/i);
});
test("conditions in an adjacent sentence and payment after a future event are unpayable",()=>{
 for(const text of [
  "You owe me $20. Only if you get tickets.",
  "If you get tickets. You owe me $20.",
  "You owe me $20 after the concert ends."
 ]){
  const group=analyze(text,modelMoney(text,20));
  assert.equal(group.obligations.filter(x=>x.kind==="money").length,0,text);
 }
});
test("preexisting corrected card with wrong amount cannot bypass payment guard",()=>{
 const text="You owe me $20. Actually make that $15 instead.";
 assert.match(legacyPaymentWarning({kind:"money",amount:20,contextNote:"Revised from $20 to $15"},text),/Re-analyze/);
 const split="We split $60 three ways. You owe me your share.";
 assert.match(legacyPaymentWarning({kind:"money",amount:60,contextNote:"Calculated as $60 ÷ 3"},split),/Re-analyze/);
});

test("HTTP analysis fails safely through the private-model fallback on complex money context",async()=>{
 const {createServer}=await import("node:http");
 const {makeServer}=await import("../server.mjs");
 let textOutput='{"unexpected":"schema"}';
 const mock=createServer(async(req,res)=>{
   for await(const _ of req){}
   res.writeHead(200,{"content-type":"application/json"});
   res.end(JSON.stringify({choices:[{message:{content:textOutput}}]}));
 });
 await new Promise(ok=>mock.listen(0,"127.0.0.1",ok));
 const prev={HF_TOKEN:process.env.HF_TOKEN,HF_CHAT_ENDPOINT:process.env.HF_CHAT_ENDPOINT,LOCAL_INFERENCE_URL:process.env.LOCAL_INFERENCE_URL};
 process.env.HF_TOKEN="mocked-financial-model";
 process.env.HF_CHAT_ENDPOINT="http://127.0.0.1:"+mock.address().port+"/chat";
 delete process.env.LOCAL_INFERENCE_URL;
 const app=makeServer();
 await new Promise(ok=>app.listen(0,"127.0.0.1",ok));
 const analyze=async(text)=>{
  const r=await fetch("http://127.0.0.1:"+app.address().port+"/api/analyze-text",
    {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text})});
  return {status:r.status,result:await r.json()};
 };
 try{
   const changed=await analyze("You owe me $20. Actually make that $15 instead.");
   assert.equal(changed.status,200);
   assert.deepEqual(changed.result.obligations.map(x=>x.amount),[15]);
   assert.match(changed.result.analysisNote,/incomplete/i);
   const split=await analyze("We split $60 three ways. You owe me your share.");
   assert.equal(split.status,200);
   assert.deepEqual(split.result.obligations.map(x=>x.amount),[20]);
   const conditional=await analyze("You owe me $20 if you get tickets.");
   assert.equal(conditional.status,200);
   assert.equal(conditional.result.obligations.length,0);
   assert.match(conditional.result.analysisNote,/conditional payment/i);
   const unsupported=await analyze("The sky is blue today.");
   assert.equal(unsupported.status,502);
 } finally {
   await new Promise(ok=>app.close(ok));
   await new Promise(ok=>mock.close(ok));
   for(const [key,value] of Object.entries(prev)) {
     if(value===undefined)delete process.env[key];else process.env[key]=value;
   }
 }
});
