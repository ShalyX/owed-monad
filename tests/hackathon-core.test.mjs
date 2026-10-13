import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {unsafeMoneyRequestReason, thirdPartyDebtWarning} from "../public/request-safety.js";
import {legacyPaymentWarning} from "../public/financial-context.js";
import {reverifyEditedMoney} from "../lib/source-reverify.mjs";
import {cleanAnalysis} from "../lib/obligations.mjs";
const bad="I overheard Jordan tell Maya 'you owe me $50'. I don't need anything from you.";
const moneyItem=(amount,evidence)=>({
 kind:"money",amount,direction:"i_owe",status:"open",
 title:"Send $"+amount,evidence,recipientAddress:"",txHash:""
});
test("quoted third-party demand cannot be personally payable even if only inner quotation was extracted",()=>{
 const i=moneyItem(50,"you owe me $50");
 assert.match(thirdPartyDebtWarning(bad),/quoted|reported/i);
 assert.match(unsafeMoneyRequestReason(i,bad),/quoted|reported/i);
 assert.match(legacyPaymentWarning(i,bad),/quoted|reported/i);
 assert.equal(reverifyEditedMoney({text:bad,evidence:i.evidence,amount:50,direction:"i_owe",perspective:"incoming"}).supported,false);
});
test("third-party reporters are blocked by the same payment safety path",()=>{
 for(const source of [
  "Ada told Bola 'send me $25 for the tickets'. I just copied their conversation.",
  "I heard Emma ask David to pay $12 for the pizza.",
  "Someone said 'you owe me $5' but that message was for Tolu."
 ]){
  assert.ok(thirdPartyDebtWarning(source),source);
  assert.ok(legacyPaymentWarning(moneyItem(12,source.slice(0,40)),source),source);
 }
});
test("ordinary direct personal requests remain eligible for payment review",()=>{
 for(const [source,amount] of [
  ["Hey, you still owe me $0.01 for coffee. Send when you get a chance.",0.01],
  ["You owe me $18 for the cab.",18],
  ["Please send me $6 for the ticket.",6]
 ]){
  assert.equal(thirdPartyDebtWarning(source),"",source);
  assert.equal(legacyPaymentWarning(moneyItem(amount,source),source),null,source);
 }
});
test("an extracted model debt from a third-party quotation fails the source safety pass",()=>{
 const actual=cleanAnalysis({title:"Send $50",obligations:[moneyItem(50,"you owe me $50")]},bad,"text","incoming");
 assert.equal(actual.obligations.filter(i=>i.kind==="money"&&i.direction==="i_owe"&&i.status==="open").length,0);
});
test("the hackathon interface retains voice input while rejecting group capture",()=>{
 const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
 const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
 assert.match(app,/if\(group\)return showNotice\("Group conversations are not supported/);
 assert.match(app,/if\(parsed\.recognized\)return showNotice\("Group chat exports are out of scope/);
 assert.match(html,/data-mode="record"/);
 assert.match(html,/id="audioFile"/);
 assert.match(html,/id="groupIdentityPanel"[^>]+hidden/);
});
