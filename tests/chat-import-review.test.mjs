import test from "node:test";
import assert from "node:assert/strict";
import {normalizeChatExport,isChatTextFile} from "../public/chat-import.js";
import {parseGroupTurns} from "../public/group-context.js";
import {resolveGroupConversation} from "../lib/group-obligations.mjs";
import {applyItemCorrection,canCorrect} from "../public/item-review.js";
import {groupPaymentBlocked} from "../public/group-payment-policy.js";
const android=[
"12/10/2026, 9:15 pm - Messages and calls are end-to-end encrypted.",
"12/10/2026, 9:16 pm - Amaka: Guys, I covered the taxi.",
"12/10/2026, 9:17 pm - Tunde: So what was it?",
"12/10/2026, 9:18 pm - Amaka: Tunde, please send me $7.50 for your part.",
"12/10/2026, 9:19 pm - Tunde: Okay.",
"12/10/2026, 9:20 pm - Amaka: Also forward the check-in details",
"for the apartment."
].join("\r\n");
test("Android WhatsApp export: timestamps, system notices, multiline content",()=>{
 const data=normalizeChatExport(android);
 assert.equal(data.recognized,true);
 assert.equal(data.count,5);
 assert.deepEqual(data.participants,["Amaka","Tunde"]);
 assert.match(data.normalized,/Amaka: Tunde, please send me \$7\.50/);
 assert.match(data.normalized,/forward the check-in details\nfor the apartment/);
 assert.equal(data.entries[2].timestamp,"12/10/2026 9:18 pm");
 assert.equal(data.entries[0].originalStart,2);
 assert.equal(data.original,android.replace(/\r\n/g,"\n"));
 const group=parseGroupTurns(data.normalized);
 assert.deepEqual(group.participants,["Amaka","Tunde"]);
 const analysis=resolveGroupConversation(data.normalized,"Tunde");
 assert.deepEqual(analysis.obligations.filter(x=>x.kind==="money").map(x=>x.amount),[7.5]);
 assert.equal(groupPaymentBlocked(analysis.obligations[0],analysis),true);
});
test("iOS WhatsApp export: bracketed timestamps and phone-number senders",()=>{
 const data=normalizeChatExport([
 "[12/10/26, 20:01:05] +234 803 000 0000: Hi all",
 "[12/10/26, 20:02:12] Jide: Here's the address",
 "[12/10/26, 20:04:00] +234 803 000 0000: Thanks"
 ].join("\n"));
 assert.equal(data.recognized,true);
 assert.equal(data.count,3);
 assert.equal(data.participants.length,2);
 assert.match(data.normalized,/Jide: Here's the address/);
});
test("never silently truncate oversized source or mistake prices/URLs for exports",()=>{
 const text=["12/10/26, 20:01 - Ana: "+ "A".repeat(100),"12/10/26, 20:02 - Bea: Hi"].join("\n");
 const data=normalizeChatExport(text,{maxLength:60});
 assert.equal(data.recognized,true);assert.equal(data.tooLong,true);
 assert.equal(data.normalized,undefined);
 assert.equal(data.original,text);
 assert.equal(normalizeChatExport("https://example.com: 12\nAna: Hello").recognized,false);
 assert.equal(isChatTextFile({name:"chat.txt",type:"text/plain"}),true);
 assert.equal(isChatTextFile({name:"chat.zip",type:"application/zip"}),false);
});
const money=()=>({id:"m1",kind:"money",title:"Pay $19",amount:19,direction:"i_owe",
 status:"open",evidence:"Amaka: Tunde, pay $19 for the room.",txHash:""});
const task=()=>({id:"t1",kind:"task",title:"Send venue link",status:"open",evidence:"Send venue link"});
test("money review freezes payment eligibility but never changes the source quote",()=>{
 const item=money(),before=item.evidence;
 const r=applyItemCorrection(item,{title:"Remaining room share",amount:"9.50",
 direction:"owed_to_me",status:"needs_review",note:"The amount was corrected later."},
 {now:"2026-10-13T11:10:00Z"});
 assert.equal(r.ok,true);assert.equal(item.amount,9.5);
 assert.equal(item.direction,"owed_to_me");assert.equal(item.status,"needs_review");
 assert.equal(item.evidence,before);assert.equal(item.sourceEvidence,before);
 assert.equal(item.manualReviewOnly,true);
 assert.equal(item.reviewHistory.length,1);
 assert.equal(item.reviewHistory[0].before.amount,19);
 assert.equal(item.reviewHistory[0].note,"The amount was corrected later.");
 assert.equal(groupPaymentBlocked(item,{perspective:"group"}),true);
 assert.equal(applyItemCorrection(item,{title:"Handled",amount:"9.5",direction:"i_owe",
 status:"user_handled"},{now:"2026-10-13T11:12:00Z"}).ok,true);
 assert.equal(item.reviewHistory.length,2);
 assert.equal(item.status,"user_handled");
 assert.match(item.contextNote,/not a verified onchain payment/i);
});
test("manual review rejects invalid money, proof-state edits and silent reactivation",()=>{
 for(const status of ["settled","pending","submitting","review","failed"]){
  const r=applyItemCorrection({...money(),status},{title:"X",amount:"4",direction:"i_owe",status:"needs_review"});
  assert.equal(r.ok,false,status);
 }
 for(const amount of ["-5","0","1.2345678","Infinity","NaN","10001",""]){
  const r=applyItemCorrection(money(),{title:"New",amount,direction:"i_owe",status:"needs_review"});
  assert.equal(r.ok,false,amount);
 }
 assert.equal(canCorrect({...money(),txHash:"0x"+"a".repeat(64)}),false);
 assert.equal(applyItemCorrection(money(),{title:"New",amount:"3",direction:"i_owe",status:"open"}).ok,false);
});
test("two task actions retain separate completion and evidence history",()=>{
 const one=task(),two={...task(),id:"t2",title:"Send floor map"};
 const result=applyItemCorrection(one,{title:"Forward venue link",status:"done",note:"Done in email."});
 assert.equal(result.ok,true);
 assert.equal(one.status,"done");assert.equal(two.status,"open");
 assert.equal(one.evidence,"Send venue link");
 assert.equal(one.reviewHistory.length,1);
});

test("reanalysis cannot resurrect a stale payable amount after user correction",async()=>{
 const {missingObligations}=await import("../public/obligation-merge.js");
 const changed=money();
 const reviewed=applyItemCorrection(changed,{title:"Adjusted",amount:"5.75",direction:"i_owe",status:"needs_review"});
 assert.equal(reviewed.ok,true);
 const duplicate={...money(),id:"new-model-run",amount:19,status:"open"};
 const proposed=missingObligations({obligations:[changed]},{obligations:[duplicate]});
 assert.deepEqual(proposed,[]);
});
