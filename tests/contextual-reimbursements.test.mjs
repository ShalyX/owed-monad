import test from "node:test";
import assert from "node:assert/strict";
import { cleanAnalysis } from "../lib/obligations.mjs";

const empty = () => ({title:"Bolt payment",summary:"",obligations:[]});
const extract = (text,perspective="incoming",model=empty()) => cleanAnalysis(model,text,"text",perspective);
const exact = "Bro I paid for the Bolt yesterday because your app was acting up 😂. Your part was $8. Just send it whenever you can. Also, don't forget to send me that apartment link we were checking out. I already sorted the booking for Saturday.";

test("real Bolt message yields one $8 reimbursement and separate apartment-link task despite model omission",()=>{
 const result = extract(exact);
 const money = result.obligations.filter(x=>x.kind==="money");
 const tasks = result.obligations.filter(x=>x.kind==="task");
 assert.equal(money.length,1,JSON.stringify(result.obligations));
 assert.equal(money[0].amount,8);
 assert.equal(money[0].direction,"i_owe");
 assert.equal(money[0].intent,undefined);
 assert.equal(money[0].recipientAddress,"");
 assert.ok(exact.includes(money[0].evidence));
 assert.match(money[0].evidence,/your part was \$8/i);
 assert.match(money[0].evidence,/send it/i);
 assert.equal(tasks.length,1,JSON.stringify(tasks));
 assert.match(tasks[0].evidence,/apartment link/i);
 assert.equal(result.obligations.some(x=>/booking/i.test(x.title)),false);
});

test("same request is not duplicated when the model already identified $8 or misclassified money",()=>{
 const model={obligations:[
  {title:"Bolt repayment",kind:"money",direction:"unclear",amount:8,evidence:"Your part was $8."},
  {title:"Send apartment link",kind:"task",direction:"i_owe",evidence:"don't forget to send me that apartment link"}
 ]};
 const r=extract(exact,"incoming",model);
 assert.equal(r.obligations.filter(x=>x.kind==="money").length,1);
 assert.equal(r.obligations.filter(x=>x.kind==="task").length,1);
 assert.equal(r.obligations.find(x=>x.kind==="money").direction,"i_owe");
});

test("self-recorded reminder requesting reimbursement is owed to me, never Pay USDC",()=>{
 const r=extract("I paid for the Bolt. Your part was $8. Just send it when you can.","recording");
 assert.equal(r.obligations.filter(x=>x.kind==="money"&&x.direction==="i_owe").length,0);
});

test("a part or price alone, without repayment request, is not a payable debt",()=>{
 for(const t of [
  "I paid for Bolt. Your part was $8.",
  "Our total was $8. Send me the apartment link.",
  "Your part was $8. I'll send it to you later.",
  "I paid $8 for my own Bolt. Send me the apartment link.",
  "Your part was $8. Just send me that apartment link."
 ]) assert.equal(extract(t).obligations.filter(x=>x.kind==="money"&&x.direction==="i_owe").length,0,t);
});

test("withdrawals, hypotheticals and already-settled reimbursements never become payable",()=>{
 for(const t of [
  "Your part was $8. Just send it. Actually never mind, my treat.",
  "Your part was $8. Just send it. Don't send anything, I got it.",
  "Your part was $8. Just send it if you decide to come.",
  "If your part was $8, just send it later.",
  "Your part was $8. Just send it, except you already sent the $8 yesterday.",
  "My friend said your part was $8. Just send it."
 ]) assert.equal(extract(t).obligations.filter(x=>x.kind==="money"&&x.direction==="i_owe").length,0,t);
});

test("does not guess amount or bridge unrelated sentence",()=>{
 for(const t of [
  "Your part was about $8. Just send it when you can.",
  "Your part was $8. The apartment is ready. Just send it.",
  "Your part was $8 or $10. Just send it.",
  "Your part was $8. You already paid it last night."
 ]) assert.equal(extract(t).obligations.filter(x=>x.kind==="money"&&x.direction==="i_owe").length,0,t);
});
