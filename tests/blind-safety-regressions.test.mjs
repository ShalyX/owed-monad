import test from "node:test";
import assert from "node:assert/strict";
import { cleanAnalysis } from "../lib/obligations.mjs";
import { legacyPaymentWarning } from "../public/financial-context.js";
const extracted=(text,money=[])=>cleanAnalysis({title:"Blind safety",obligations:money},text,"text","incoming");
const due=x=>x.obligations.filter(i=>i.kind==="money"&&i.direction==="i_owe"&&i.intent!=="voluntary_request");
test("waived $13 dinner cannot produce a Pay action from model or deterministic fallback",()=>{
 const s="You still owe me $13 for dinner. Actually forget about it, it was my treat. Don't transfer anything.";
 const r=extracted(s,[{title:"Repay dinner",kind:"money",direction:"i_owe",amount:13,evidence:"You still owe me $13 for dinner."}]);
 assert.equal(due(r).length,0,JSON.stringify(r));
 assert.equal(r.obligations.filter(i=>i.kind==="task"&&/send|transfer/i.test(i.title)).length,0,JSON.stringify(r));
 assert.ok(legacyPaymentWarning({kind:"money",direction:"i_owe",amount:13,evidence:"You still owe me $13 for dinner."},s));
});
test("corrected grocery $28 to $23 never exposes old debt",()=>{
 const s="You owe me $28 for the groceries. Hang on, I used the wrong receipt. It's $23, not $28. Send $23.";
 const raw=[{kind:"money",direction:"i_owe",title:"Groceries",amount:28,evidence:"You owe me $28 for the groceries."},{kind:"task",direction:"i_owe",title:"Send $23",amount:null,evidence:"Send $23."}];
 const r=extracted(s,raw);
 assert.deepEqual(due(r).map(x=>x.amount),[23],JSON.stringify(r));
 assert.equal(r.obligations.filter(x=>x.kind==="task"&&/send/i.test(x.title)).length,0,JSON.stringify(r));
});
test("voluntary $2.50 never truncates decimal to $2",()=>{
 const s="Babe I need a little help, could you spare me $2.50 for mobile data? Totally fine if not.";
 const r=extracted(s);
 assert.equal(r.obligations.filter(x=>x.intent==="voluntary_request").length,1,JSON.stringify(r));
 assert.equal(r.obligations.find(x=>x.intent==="voluntary_request")?.amount,2.5,JSON.stringify(r));
});
test("borrowed $9.20 from user is money owed to user",()=>{
 const s="Sorry I couldn't return the $9.20 I borrowed from you last Wednesday. I'll send it after my shift tonight.";
 const r=extracted(s);
 const incoming=r.obligations.filter(x=>x.kind==="money"&&x.direction==="owed_to_me");
 assert.equal(incoming.length,1,JSON.stringify(r));
 assert.equal(incoming[0].amount,9.2,JSON.stringify(r));
 assert.equal(due(r).length,0);
});

test("micro-USDC reminder containing 'split last week' remains a direct $0.075 debt",()=>{
 const s="Reminder: you still owe me 0.075 USDC for the API credits we split last week.";
 const r=extracted(s);
 assert.deepEqual(due(r).map(x=>x.amount),[0.075],JSON.stringify(r));
});
test("a recorded reminder 'I owe Fola $6' belongs to the user's own payments",()=>{
 const s="Note to self: I still owe Fola $6 for the cinema popcorn. Pay her tomorrow.";
 const r=cleanAnalysis({title:"Self reminder",obligations:[]},s,"text","recording");
 assert.deepEqual(due(r).map(x=>x.amount),[6],JSON.stringify(r));
});
test("acknowledged $3 partial transfer leaves precisely $7, not the original $10",()=>{
 const s="You owed $10 for lunch, but I got your $3 earlier. That leaves $7. Please send the remaining $7.";
 const r=extracted(s,[{title:"Lunch",kind:"money",direction:"i_owe",amount:10,evidence:"You owed $10 for lunch, but I got your $3 earlier."}]);
 assert.deepEqual(due(r).map(x=>x.amount),[7],JSON.stringify(r));
});
test("ambiguous or arithmetically wrong remaining balance is never synthesized",()=>{
 for (const s of [
  "You owed $10 for lunch, but I got your $3 earlier. That leaves $8. Please send the remaining $8.",
  "If you owed $10 for lunch, and I got your $3 earlier, that leaves $7. Please send the remaining $7.",
  "You owed $10 for lunch, but I got your $3 earlier. That leaves $7. Never mind, my treat."
 ]) assert.equal(due(extracted(s)).length,0,JSON.stringify({s,r:extracted(s).obligations}));
});
test("withdrawn photocopy debt cannot be offered as Pay, but its PDF task survives",()=>{
 const s="You owe me $5 for the photocopies—actually skip it, my treat. Could you forward the final PDF instead?";
 const r=extracted(s,[{kind:"money",direction:"i_owe",title:"Send $5",amount:5,evidence:"You owe me $5 for the photocopies—actually skip it, my treat."}]);
 assert.equal(due(r).length,0,JSON.stringify(r));
 assert.equal(r.obligations.filter(x=>x.kind==="task"&&/pdf/i.test(x.title)).length,1,JSON.stringify(r));
});
test("a completed refund and a non-loan gift never become debt cards",()=>{
 const tests=[
 ["I processed the refund for the $18.75 shipping surcharge I charged you. The funds should reach you tomorrow.",{kind:"money",direction:"unclear",title:"Refund shipping",amount:18.75,evidence:"I processed the refund for the $18.75 shipping surcharge I charged you."}],
 ["That $40 I gave you for your birthday was a gift, not a loan. Please don't send it back.",{kind:"money",direction:"unclear",title:"Gift",amount:40,evidence:"That $40 I gave you for your birthday was a gift, not a loan."}]
 ];
 for(const [s,raw]of tests) assert.equal(extracted(s,[raw]).obligations.filter(x=>x.kind==="money").length,0,JSON.stringify({s,r:extracted(s,[raw]).obligations}));
});
test("non-payment task phrased as check whether money arrived survives",()=>{
 const s="I already sent you $0.50 yesterday for the snacks. Can you check whether it arrived?";
 const r=extracted(s);
 assert.equal(due(r).length,0);
 assert.equal(r.obligations.filter(x=>x.kind==="task"&&/check/i.test(x.title)).length,1,JSON.stringify(r));
});
test("guest list request remains independent of unrelated third-party debt",()=>{
 const s="Abiola still owes Kemi $31 from the group gift. You don't owe either of them anything; just send me the guest list.";
 const r=extracted(s);
 assert.equal(due(r).length,0);
 assert.equal(r.obligations.filter(x=>x.kind==="task"&&/guest/i.test(x.title)).length,1,JSON.stringify(r));
});
test("identical model tasks cannot appear as duplicate cards",()=>{
 const s="Please forward the Google Maps link for the studio, and remind me which floor we're meeting on.";
 const quote=s;
 const r=extracted(s,[{kind:"task",title:"Google Maps link",evidence:quote},{kind:"task",title:"Google Maps link",evidence:quote}]);
 assert.equal(r.obligations.filter(x=>x.kind==="task").length,1,JSON.stringify(r));
});
