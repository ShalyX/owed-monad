import test from "node:test";
import assert from "node:assert/strict";
import {resolveGroupConversation,groupEventTimeline,reconcileGroupEvents} from "../lib/group-obligations.mjs";
import {validatedGroupIdentity} from "../public/group-context.js";
import {groupPaymentBlocked} from "../public/group-payment-policy.js";
const cases=[
 ["gift","Jules: Nia, don't pay me $11 for flowers; they're a gift.\nNia: Thanks.\nOla: Nice.","Nia"],
 ["quoted","Jules: Nia, remember how Ola joked 'send me $40 or else' yesterday?\nNia: lol.\nOla: 😂","Nia"],
 ["settled","Jules: Nia, send me $13 for the hall.\nNia: Sent it already.\nJules: Got the $13 just now, we're settled.","Nia"],
 ["multi","Jules: Nia, send me $8 for leaflets.\nNia: I think I did.\nJules: Ah yes, received. Nia, forward the corrected poster instead.","Nia"]
];
test("group payment safety policy blocks old saved items and new items, not one-on-one",()=>{
 const original={kind:"money",direction:"i_owe",amount:13,status:"open"};
 assert.equal(groupPaymentBlocked(original,{perspective:"group"}),true);
 assert.equal(groupPaymentBlocked(original,{groupContext:{participant:"Nia"}}),true);
 assert.equal(groupPaymentBlocked({...original,groupActor:"Nia"},{}),true);
 assert.equal(groupPaymentBlocked(original,{perspective:"incoming"}),false);
 assert.equal(groupPaymentBlocked({kind:"task",groupActor:"Nia"},{perspective:"group"}),false);
});
test("later speaker acknowledgment changes pending request but never creates chain proof",()=>{
 const res=resolveGroupConversation(cases[2][1],"Nia");
 assert.equal(res.obligations.filter(x=>x.kind==="money").length,1);
 const record=res.obligations.find(x=>x.kind==="money");
 assert.equal(record.status,"conversation_confirmed");
 assert.equal(record.txHash,"");
 assert.match(record.contextNote,/not independently verified onchain/i);
 assert.equal(res.events.find(x=>x.type==="acknowledge")?.outcome,"conversation_confirmed");
});
test("speakers, targets, and event chronology are explicit; quoted and waiver requests are not debt",()=>{
 for(const tc of cases.slice(0,2)){
  const res=resolveGroupConversation(tc[1],tc[2]);
  assert.equal(res.obligations.filter(x=>x.kind==="money"&&x.status==="open").length,0,JSON.stringify(res));
 }
 const group=validatedGroupIdentity(cases[3][1],"Nia");
 const events=groupEventTimeline(group);
 assert.ok(events.every((x,i)=>x.id==="ge"+i),JSON.stringify(events));
 assert.ok(events.every(x=>typeof x.quote==="string"&&Number.isInteger(x.offset)));
 const result=reconcileGroupEvents(events,"Nia");
 assert.equal(result.items.find(x=>x.kind==="money").status,"conversation_confirmed");
 assert.ok(result.items.some(x=>x.kind==="task"&&/poster/.test(x.title)));
});
test("Sam and Samantha are distinct even when both requests are in one speaker turn",()=>{
 const source="Sam: Sure.\nSamantha: Ready.\nOla: Samantha, send me $16. Sam, take photos.";
 const r=resolveGroupConversation(source,"Sam");
 assert.equal(r.obligations.filter(x=>x.kind==="money").length,0);
 assert.equal(r.obligations.filter(x=>x.kind==="task").length,1);
});
test("correction event supersedes prior debt and preserves audit chronology",()=>{
 const source="Jules: Nia, send me $22 for the equipment.\nNia: I'll check.\nJules: Nia, I meant $17, not $22. Send $17.";
 const r=resolveGroupConversation(source,"Nia");
 const money=r.obligations.filter(x=>x.kind==="money");
 assert.equal(money[0].amount,22);
 assert.equal(money[0].status,"cancelled");
 assert.ok(money.some(x=>x.amount===17&&x.status==="open"),JSON.stringify(money));
 assert.ok(r.events.some(x=>x.type==="correct"));
});
test("new group payment remains review-only even if directly addressed",()=>{
 const source="Jules: Nia, send me $2.50 for the badges.\nNia: Got it.";
 const r=resolveGroupConversation(source,"Nia");
 const m=r.obligations.find(x=>x.kind==="money");
 assert.equal(m.amount,2.5);
 assert.equal(groupPaymentBlocked(m,r),true);
});
