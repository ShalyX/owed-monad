import test from "node:test";
import assert from "node:assert/strict";
import {cleanAnalysis} from "../lib/obligations.mjs";
import {explicitNonMoneyTasks} from "../public/explicit-tasks.js";
const model=(obligations=[])=>({title:"Conversation",obligations});
const item=(kind,title,amount,evidence)=>({kind,title,amount,evidence,direction:"i_owe"});
const run=(text,obligations=[])=>cleanAnalysis(model(obligations),text);
test("small-model repair estimate cannot create an irrelevant Money item",()=>{
 const t="Hey, you'll probably need about $80 to repair the phone. Just letting you know.";
 const r=run(t,[item("money","Repair phone",80,t)]);
 assert.equal(r.obligations.length,0);
 assert.match(r.analysisNote,/estimated cost/i);
});
test("model returning payment only cannot lose independently requested address",()=>{
 const t="You owe me $12 for the tickets. Also please send me the venue address.";
 const r=run(t,[item("money","Ticket payment",12,"You owe me $12 for the tickets.")]);
 assert.deepEqual(r.obligations.map(x=>x.kind).sort(),["money","task"]);
 assert.match(r.obligations.find(x=>x.kind==="task").evidence,/venue address/i);
});
test("two distinct amounts inside same evidence are not mistaken for duplicates",()=>{
 const t="You still owe me $7 for lunch and $4 for coffee.";
 const r=run(t,[item("money","Lunch money",7,t)]);
 assert.deepEqual(r.obligations.filter(x=>x.kind==="money").map(x=>x.amount).sort((a,b)=>a-b),[4,7]);
 assert.ok(r.obligations.every(x=>t.includes(x.evidence)));
});
test("ambiguously proposed amounts cannot turn model's filler into a task",()=>{
 const t="Can you send me $5 or $10? I'm not sure which yet.";
 const r=run(t,[item("task","Payment request",null,"I'm not sure which yet.")]);
 assert.equal(r.obligations.length,0);
 assert.match(r.analysisNote,/not.*separate action|more than one possible amount/i);
});
test("mixed optional request and an unrelated reminder produce both loose ends",()=>{
 const t="Can you spare me $6 for food? Also remind me to bring the charger tomorrow.";
 const r=run(t);
 assert.equal(r.obligations.length,2);
 assert.equal(r.obligations.find(x=>x.kind==="money").intent,"voluntary_request");
 assert.match(r.obligations.find(x=>x.kind==="task").evidence,/charger tomorrow/i);
});
test("payment-only commands cannot create shadow tasks",()=>{
 for(const t of ["Please send me $10 for lunch.","Can you send me $5 back for lunch?"]){
  assert.deepEqual(explicitNonMoneyTasks(t),[],t);
 }
});
test("hypothetical or relayed address requests are not made into to-dos",()=>{
 for(const t of ["If you can, please send me the address.","I told Sarah: please send me the venue address."]){
  assert.deepEqual(explicitNonMoneyTasks(t),[],t);
 }
});
test("two explicit separate asks may share one source sentence",()=>{
 const t="Please send me the venue address and pay me $12 for the ticket.";
 const r=run(t);
 assert.equal(r.obligations.some(x=>x.kind==="task"),true);
 assert.equal(r.obligations.some(x=>x.kind==="money"&&x.amount===12),true);
});
