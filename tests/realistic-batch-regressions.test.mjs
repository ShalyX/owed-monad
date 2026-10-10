import test from "node:test";
import assert from "node:assert/strict";
import { cleanAnalysis } from "../lib/obligations.mjs";

const evaluate=(text,obligations=[])=>cleanAnalysis({title:"Test case",obligations},text);
const due=(result)=>result.obligations.filter(x=>x.kind==="money"&&x.direction==="i_owe"&&x.intent!=="voluntary_request");
const money=(result)=>result.obligations.filter(x=>x.kind==="money");
const tasks=(result)=>result.obligations.filter(x=>x.kind==="task");

test("coffee reminder 'when you get a chance' is courtesy, not payment condition",()=>{
 const text="Yo, remember that coffee bet? You still owe me 0.01 USDC 😂. Send it to me on Monad when you get a chance. No rush though, just reminding you before I forget.";
 const r=evaluate(text);
 assert.equal(due(r).length,1,JSON.stringify(r));
 assert.equal(due(r)[0].amount,0.01);
 assert.equal(Boolean(r.analysisNote?.includes("conditional")),false);
});
test("split dinner $60 among 3, $20 repeated and 'when you're free' yields one $20, never $60",()=>{
 const text="Heyy, the dinner bill came to $60 altogether. Since it was just the three of us and we agreed to split equally, everybody's share is $20. I covered the whole thing at the restaurant, so you can just send me your $20 when you're free.";
 const r=evaluate(text);
 assert.deepEqual(due(r).map(x=>x.amount),[20],JSON.stringify(r));
 assert.equal(money(r).length,1);
 assert.match(due(r)[0].evidence,/^Heyy, the dinner bill came to \$60/i);
});
test("approximate voluntary help request does not produce a second money card from model filler",()=>{
 const text="Guy abeg, you fit help me with like $5? 😭 I'm trying to sort out transport for tomorrow and I'm a bit short. If you can't, no wahala at all. I'll pay you back next week if you send it.";
 const ai=[{kind:"money",direction:"unclear",title:"Transport payment",amount:null,evidence:"I'm trying to sort out transport for tomorrow and I'm a bit short. If you can't, no wahala at all. I'll pay you back next week if you send it."}];
 const r=evaluate(text,ai);
 assert.equal(money(r).length,1,JSON.stringify(r));
 assert.equal(money(r)[0].intent,"voluntary_request");
 assert.equal(money(r)[0].amount,5);
 assert.equal(due(r).length,0);
});
test("someone who borrowed $25 from the user owes the user, not the reverse",()=>{
 const text="Hey, I haven't forgotten the $25 I borrowed from you last weekend. I know I promised to return it yesterday but my salary delayed. I'll send it on Monday, please don't vex 😭.";
 const ai=[{kind:"money",direction:"i_owe",title:"$25 loan",amount:25,evidence:text}];
 const r=evaluate(text,ai);
 assert.deepEqual(money(r).map(x=>[x.amount,x.direction]),[[25,"owed_to_me"]],JSON.stringify(r));
 assert.equal(due(r).length,0);
});
test("acknowledged $30 already paid never appears as a new money obligation",()=>{
 const text="I just checked my wallet and saw the $30 you sent yesterday. We're good now, that's everything you owed me from the shopping. Thanks for sorting it out. Btw are we still meeting on Sunday?";
 const ai=[{kind:"money",direction:"unclear",title:"Repay shopping",amount:30,evidence:"I just checked my wallet and saw the $30 you sent yesterday. We're good now, that's everything you owed me from the shopping."},{kind:"task",direction:"i_owe",title:"Are we still meeting on Sunday?",evidence:"Btw are we still meeting on Sunday?"}];
 const r=evaluate(text,ai);
 assert.equal(money(r).length,0,JSON.stringify(r));
 assert.equal(tasks(r).length,1);
});
test("speaker-labelled group chat recovers check-in task but not another participant's $40",()=>{
 const text="Amaka: Guys I've paid for the Airbnb. It was $120 total.\nTunde: Niceee. So that's $40 each for the three of us right?\nShaly: Yeah but I already sent you $15 last night, Amaka.\nAmaka: Oh true, just saw it. So Shaly you only have $25 left to send me.\nTunde: I'll sort out my own $40 tomorrow.\nAmaka: Shaly also please send me the check-in details you got from the host.\nShaly: Okay I'll forward them tonight.";
 const ai=[{kind:"money",direction:"i_owe",title:"Send $25",amount:25,evidence:"So Shaly you only have $25 left to send me."}];
 const r=evaluate(text,ai);
 assert.deepEqual(due(r).map(x=>x.amount),[25],JSON.stringify(r));
 assert.equal(tasks(r).length,1,JSON.stringify(r));
 assert.match(tasks(r)[0].evidence,/check-in details/i);
});
test("real pending conditions remain nonpayable despite courtesy fix",()=>{
 for (const text of [
  "If you come, you owe me $15 for the tickets.",
  "You owe me $15 after I confirm your reservation.",
  "If you owe me $15, send it when you get a chance.",
  "You owe me $15 when the delivery arrives.",
  "You still owe me $10. Don't send it, my treat."
 ]) {
  const r=evaluate(text);
  assert.equal(due(r).length,0,text+" :: "+JSON.stringify(r.obligations));
 }
});
test("completed debt and separate new debt should preserve only new obligation",()=>{
 const text="I saw the $30 you sent yesterday. We're good now on shopping. You still owe me $8 for the Bolt.";
 const r=evaluate(text,[{kind:"money",direction:"i_owe",amount:8,title:"Bolt",evidence:"You still owe me $8 for the Bolt."}]);
 assert.deepEqual(due(r).map(x=>x.amount),[8],JSON.stringify(r));
});
