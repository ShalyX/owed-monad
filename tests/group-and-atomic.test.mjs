import test from "node:test";
import assert from "node:assert/strict";
import { parseGroupTurns, validatedGroupIdentity } from "../public/group-context.js";
import { resolveGroupConversation } from "../lib/group-obligations.mjs";
import { atomizeTasks, atomizeOpenTasks } from "../public/atomic-tasks.js";
import { missingObligations } from "../public/obligation-merge.js";
import { cleanAnalysis } from "../lib/obligations.mjs";
import { makeServer } from "../server.mjs";

const taxi=[
"Kemi: I covered the $36 hotel taxi. That's $12 each for Kemi, Zara and Alex.",
"Zara: Alex, send Kemi your $12, I already sent mine.",
"Alex: Alright, I'll do that."
].join("\n");
const airbnb=[
"Amaka: Guys I've paid for the Airbnb. It was $120 total.",
"Tunde: Niceee. So that's $40 each for the three of us right?",
"Shaly: Yeah but I already sent you $15 last night, Amaka.",
"Amaka: Oh true, just saw it. So Shaly you only have $25 left to send me.",
"Tunde: I'll sort out my own $40 tomorrow.",
"Amaka: Shaly also please send me the check-in details you got from the host.",
"Shaly: Okay I'll forward them tonight."
].join("\n");
const due=result=>result.obligations.filter(x=>x.kind==="money"&&x.direction==="i_owe");
const todo=result=>result.obligations.filter(x=>x.kind==="task");
test("speaker labels are structured turns; names are not guessed from prose, URLs or lone speakers",()=>{
 assert.deepEqual(parseGroupTurns(taxi).participants,["Kemi","Zara","Alex"]);
 assert.equal(parseGroupTurns("You owe me $10. Send me the link."),null);
 assert.equal(parseGroupTurns("https://example.com/asset\nB: something"),null);
 assert.equal(parseGroupTurns("Kemi: One speaker only."),null);
 assert.equal(validatedGroupIdentity(taxi,"Axel").participant,null);
});
test("group identity is mandatory before any payable item is created",()=>{
 assert.throws(()=>resolveGroupConversation(taxi,""),/Choose which participant/);
 assert.throws(()=>resolveGroupConversation(taxi,"Alexx"),/Choose which participant/);
 assert.equal(resolveGroupConversation(taxi,"__observer__").obligations.length,0);
});
test("only Alex owes the directly requested $12, never the group's $36",()=>{
 const alex=resolveGroupConversation(taxi,"Alex");
 assert.deepEqual(due(alex).map(x=>x.amount),[12],JSON.stringify(alex.obligations));
 assert.equal(due(alex)[0].recipientName,"Kemi");
 assert.equal(todo(alex).length,0);
 assert.equal(due(resolveGroupConversation(taxi,"Zara")).length,0);
 assert.equal(due(resolveGroupConversation(taxi,"Kemi")).length,0);
});
test("Airbnb Shaly gets precisely $25 and a check-in task; Tunde not charged for Shaly's $25",()=>{
 const shaly=resolveGroupConversation(airbnb,"Shaly");
 assert.deepEqual(due(shaly).map(x=>x.amount),[25],JSON.stringify(shaly.obligations));
 assert.equal(todo(shaly).length,1,JSON.stringify(shaly.obligations));
 assert.match(todo(shaly)[0].evidence,/check-in details/i);
 const tunde=resolveGroupConversation(airbnb,"Tunde");
 assert.equal(due(tunde).length,0,JSON.stringify(tunde.obligations));
 assert.equal(todo(tunde).length,0);
});
test("being mentioned in unrelated price statement cannot silently become a debt",()=>{
 const chat="Amaka: The venue costs $200 each.\nAlex: Sounds expensive.\nShaly: Alex are you free tomorrow?";
 assert.deepEqual(resolveGroupConversation(chat,"Alex").obligations,[]);
});
test("one compound delivery sentence becomes two independently identifiable tasks",()=>{
 const quote="Send me the final event flyer and the location link.";
 const tasks=atomizeTasks([{id:"old-task",kind:"task",title:"Send final event flyer and location link",evidence:quote,status:"open"}]);
 assert.equal(tasks.length,2,JSON.stringify(tasks));
 assert.notEqual(tasks[0].id,tasks[1].id);
 assert.notEqual(tasks[0].taskKey,tasks[1].taskKey);
 assert.ok(tasks.every(x=>quote.includes(x.evidence)));
 assert.match(tasks[0].title,/flyer/i);
 assert.match(tasks[1].title,/location link/i);
 tasks[0].status="done";
 assert.equal(tasks[1].status,"open");
});
test("read-only inbox migration atomizes only open combined tasks and preserves completed receipts",()=>{
 const quote="Send me the final event flyer and the location link.";
 const original=[
  {id:"a",kind:"task",status:"open",title:"Both",evidence:quote},
  {id:"b",kind:"task",status:"done",title:"Already finished",evidence:quote},
  {id:"c",kind:"money",status:"settled",txHash:"0x123",evidence:quote}
 ];
 const result=atomizeOpenTasks(original);
 assert.equal(result.length,4); assert.equal(result.find(x=>x.id==="b").status,"done");
 assert.equal(result.find(x=>x.id==="c").txHash,"0x123");
});
test("re-analysis preserves both independently complete-able children, not merging by shared evidence",()=>{
 const quote="Send me the final event flyer and the location link.";
 const latest=atomizeTasks([{id:"latest",kind:"task",title:"Both",evidence:quote,status:"open"}]);
 const old={obligations:[{...latest[0],status:"done"}]};
 const incoming={obligations:latest};
 assert.deepEqual(missingObligations(old,incoming).map(x=>x.taskKey),[latest[1].taskKey]);
});
test("simple source input creates two items without a prompt-specific special case",()=>{
 const source="Thanks for printing. You still owe me $2.25 for printing. Also send me the final event flyer and the location link.";
 const r=cleanAnalysis({title:"Print",obligations:[{kind:"task",title:"Send flyer and link",evidence:"send me the final event flyer and the location link."}]},source);
 assert.equal(due(r).length,1);
 assert.equal(todo(r).length,2,JSON.stringify(r.obligations));
});
test("standalone simple task remains one, and don't split names with and",()=>{
 assert.equal(atomizeTasks([{kind:"task",title:"Send photo",evidence:"Send a photo of Tunde and Zara."}]).length,1);
 assert.equal(atomizeTasks([{kind:"task",title:"Link",evidence:"Please forward the Google Maps link."}]).length,1);
});
test("the API blocks missing/invalid group identity without involving inference",async()=>{
 const app=makeServer({publicDemo:false});await new Promise(ok=>app.listen(0,"127.0.0.1",ok));
 const url="http://127.0.0.1:"+app.address().port+"/api/analyze-text";
 try{
  const send=async participant=>{
   const resp=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({text:taxi,participant})});
   return {status:resp.status,data:await resp.json()};
  };
  assert.equal((await send("")).status,422);
  assert.equal((await send("Invented")).status,422);
  const good=await send("Alex"); assert.equal(good.status,200);
  assert.deepEqual(good.data.obligations.filter(x=>x.kind==="money").map(x=>x.amount),[12]);
  const observer=await send("__observer__");assert.equal(observer.status,200);assert.deepEqual(observer.data.obligations,[]);
 }finally{await new Promise(ok=>app.close(ok));}
});

test("money another named speaker explicitly owes the selected user is owed_to_me, not Pay",()=>{
 const text="Kemi: Alex, I still owe you $7.50 for the book.\nAlex: No rush.";
 const r=resolveGroupConversation(text,"Alex");
 assert.deepEqual(r.obligations.filter(x=>x.kind==="money").map(x=>[x.direction,x.amount]),[["owed_to_me",7.5]]);
 assert.equal(due(r).length,0);
});
test("quoted conditional and cancelled group instructions cannot create Pay",()=>{
 const text="Kemi: Alex, don't send me $12, that was a gift.\nZara: Alex, if you come tomorrow send me $15.\nAlex: Not sure yet.";
 const r=resolveGroupConversation(text,"Alex");
 assert.equal(due(r).length,0,JSON.stringify(r.obligations));
});
test("no-model message can still discover independent deliverables as two tasks",()=>{
 const text="Please send me the final event flyer and the location link.";
 const r=cleanAnalysis({title:"Two tasks",obligations:[]},text);
 assert.equal(todo(r).length,2,JSON.stringify(r.obligations));
 assert.notEqual(todo(r)[0].taskKey,todo(r)[1].taskKey);
});
