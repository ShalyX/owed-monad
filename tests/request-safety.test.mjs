import test from "node:test";
import assert from "node:assert/strict";
import { cleanAnalysis } from "../lib/obligations.mjs";
import { findVoluntaryRequests } from "../public/voluntary-request.js";
import { unsafeMoneyRequestReason, unsafeRequestSegments } from "../public/request-safety.js";
import { legacyPaymentWarning } from "../public/financial-context.js";

const empty=()=>({title:"Chat",obligations:[]});
const item=(evidence,kind="money",amount=5)=>({
 title:"Pay",kind,direction:"i_owe",amount,evidence
});
function parse(text,obligations=[]){
 return cleanAnalysis({title:"Chat",obligations},text,"text","incoming");
}
test("cancelled request does not become payable, even if model invents a debt",()=>{
 const text="Can you send me $5? Actually no, never mind.";
 const result=parse(text,[item("Can you send me $5?")]);
 assert.equal(result.obligations.length,0);
 assert.match(result.analysisNote,/withdrawn/i);
 assert.match(legacyPaymentWarning(item("Can you send me $5?"),text),/withdrawn/i);
});
test("cancelled voluntary favor produces a useful empty-state explanation",()=>{
 const text="Can I get a dollar from you for rent? Never mind, don't send anything.";
 const result=parse(text);
 assert.equal(result.obligations.length,0);
 assert.match(result.analysisNote,/withdrawn/i);
});
test("quoted request to a third party is not presented as payable",()=>{
 const text="I told Sarah: can I get $1 from you? She said no.";
 const result=parse(text,[item("can I get $1 from you?", "money",1)]);
 assert.equal(result.obligations.length,0);
 assert.match(result.analysisNote,/quoted or retold/i);
});
test("multiple competing suggested amounts require clarification",()=>{
 const text="Can I get a dollar from you or would five dollars be better?";
 const result=parse(text,[item("Can I get a dollar from you or would five dollars be better?", "money",1)]);
 assert.equal(result.obligations.length,0);
 assert.match(result.analysisNote,/more than one possible amount/i);
});
test("a later revision expressed as words does not leave the old price payable",()=>{
 const text="Can I get a dollar from you? Actually, make it two dollars.";
 const result=parse(text,[item("Can I get a dollar from you?","money",1)]);
 assert.equal(result.obligations.length,0);
 assert.match(result.analysisNote,/amount may have changed/i);
});
test("a clear, uncancelled monetary favor remains in existing Money category",()=>{
 const text="hey bro, can I please get a dollar from you, I wanna offset some bills ";
 const result=parse(text);
 assert.equal(result.obligations.length,1);
 assert.equal(result.obligations[0].intent,"voluntary_request");
 assert.equal(result.obligations[0].amount,1);
 assert.equal(result.obligations[0].direction,"i_owe");
});
test("explicit reimbursement must not become voluntary favor",()=>{
 const text="Could you send me $5 back for lunch?";
 assert.equal(findVoluntaryRequests(text).length,0);
 const r=parse(text);
 assert.equal(r.obligations.length,1);
 assert.notEqual(r.obligations[0].intent,"voluntary_request");
});
test("direct request for help with groceries is voluntary, not debt",()=>{
 const text="Hey please send me $5 for groceries";
 const r=parse(text);
 assert.equal(r.obligations.length,1);
 assert.equal(r.obligations[0].intent,"voluntary_request");
});
test("an explicit charge for ordered shoes is not relabeled a favor",()=>{
 const text="Please send me $10 for the sneakers you ordered.";
 assert.equal(findVoluntaryRequests(text).length,0);
 const r=parse(text);
 assert.equal(r.obligations.length,1);
 assert.equal(r.obligations[0].amount,10);
});
test("unrelated actual debt remains when separate help request is cancelled",()=>{
 const text="Can you send me $5? Never mind. You still owe me $12 for cab.";
 const r=parse(text);
 assert.equal(r.obligations.length,1);
 assert.equal(r.obligations[0].amount,12);
});
test("reported or cancelled requests cannot survive model task mislabeling",()=>{
 const text="Can you send me $5? Never mind.";
 const result=parse(text,[item("Can you send me $5?","task",null)]);
 assert.equal(result.obligations.length,0);
});
test("small model quoting only the cancellation cannot create a Send task",()=>{
 const text="Can you send me $5? Actually no, never mind.";
 const result=parse(text,[item("Actually no, never mind.","task",null)]);
 assert.equal(result.obligations.length,0);
 assert.match(result.analysisNote,/withdrawn/i);
});
test("safety inspection does not mark an ordinary debt as a withdrawn request",()=>{
 const text="You still owe me $12 for cab.";
 assert.equal(unsafeRequestSegments(text).length,0);
 assert.equal(unsafeMoneyRequestReason(item(text,"money",12),text),"");
});
