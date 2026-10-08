import test from "node:test";
import assert from "node:assert/strict";
import { cleanAnalysis } from "../lib/obligations.mjs";
import { removeShadowPaymentTasks } from "../public/obligation-dedupe.js";

// Synthesized equivalent of a real-world colloquial payment voice note.
// No personal names, wallet addresses, or private recordings are committed.
const voice = "Hey bro, just calling to remind you about the boots and cleats you wanted to get, so the total for both is $250 and you can just send it in, you get me.";
const model = () => ({
  title: "Sports equipment",
  obligations: [
    { title: "Request payment", kind: "money", direction: "i_owe", amount: 250, evidence: voice },
    { title: "Send payment details", kind: "task", direction: "i_owe", amount: null, evidence: voice }
  ]
});
test("a single voice payment request is not duplicated as send-payment task", () => {
  const group = cleanAnalysis(model(), voice, "audio", "incoming");
  assert.equal(group.obligations.length, 1);
  assert.equal(group.obligations[0].kind, "money");
  assert.equal(group.obligations[0].direction, "i_owe");
  assert.equal(group.obligations[0].amount, 250);
  assert.equal(group.obligations[0].evidence, voice);
  assert.equal(group.obligations[0].recipientAddress, "");
});
test("a payment task alone gets removed when independently grounded money request is recovered", () => {
  const onlyTask = {title:"Equipment", obligations:[model().obligations[1]]};
  const group = cleanAnalysis(onlyTask, voice, "recording", "incoming");
  assert.deepEqual(group.obligations.map(x => x.kind), ["money"]);
  assert.equal(group.obligations[0].amount, 250);
});
test("two explicit independent requests still create a payment and a task", () => {
  const text = "You owe me $250 for the equipment. Please send me your delivery address.";
  const group = cleanAnalysis({title:"Equipment", obligations:[
    {title:"Pay equipment",kind:"money",direction:"i_owe",amount:250,evidence:text},
    {title:"Send delivery address",kind:"task",direction:"i_owe",amount:null,evidence:text}
  ]},text);
  assert.equal(group.obligations.length,2);
  assert.deepEqual(group.obligations.map(x => x.kind),["money","task"]);
});
test("non-overlapping tasks are not discarded merely because the message mentions money", () => {
  const text = "You owe me $12 for lunch. Also can you send me that venue link?";
  const group = cleanAnalysis({title:"Lunch and venue",obligations:[
    {title:"Lunch",kind:"money",direction:"i_owe",amount:12,evidence:"You owe me $12 for lunch."},
    {title:"Venue link",kind:"task",direction:"i_owe",amount:null,evidence:"can you send me that venue link?"}
  ]},text);
  assert.equal(group.obligations.length,2);
  assert.equal(group.obligations[1].kind,"task");
});
test("legacy browser cleanup only removes open shadow tasks; preserves paid receipts and finished tasks", () => {
  const payment = {id:"m",kind:"money",status:"open",evidence:voice,amount:250,direction:"i_owe"};
  const duplicate = {id:"t",kind:"task",status:"open",evidence:voice,title:"Send payment details"};
  const done = {id:"done",kind:"task",status:"done",evidence:voice,title:"User-completed task"};
  const verified = {id:"receipt",kind:"money",status:"settled",evidence:"You owe me $4.",txHash:"0x"+"a".repeat(64)};
  const input = [payment,duplicate,done,verified];
  const result = removeShadowPaymentTasks(input,{onlyOpen:true});
  assert.deepEqual(result.map(x=>x.id),["m","done","receipt"]);
  assert.equal(input.length,4);
  assert.equal(result[2].txHash,verified.txHash);
});
test("legacy cleanup won't remove a distinct requested action from a shared source quote", () => {
  const both = "You owe me $9 and please send me the venue address.";
  const items=[
    {kind:"money",status:"open",evidence:both,amount:9},
    {kind:"task",status:"open",evidence:both,title:"Send venue address"}
  ];
  assert.equal(removeShadowPaymentTasks(items,{onlyOpen:true}).length,2);
});
