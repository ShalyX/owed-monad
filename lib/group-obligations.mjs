import { randomUUID, createHash } from "node:crypto";
import { validatedGroupIdentity } from "../public/group-context.js";
import { atomizeTasks } from "../public/atomic-tasks.js";

const norm=s=>String(s||"").toLocaleLowerCase().trim();
const money=/(?:\$\s*(\d{1,5}(?:\.\d{1,6})?)|(\d{1,5}(?:\.\d{1,6})?)\s*(?:USDC|USD|dollars?)\b)/gi;
const quoted=/\b(?:remember how|joked|kidding|pretend|quoted|someone said|told me|imagined|hypothetically)\b/i;
const conditional=/\b(?:if|unless|only if|not yet|provided that)\b/i;
const waived=/\b(?:don't|do not|never)\s+(?:pay|send|transfer)\b|\b(?:my treat|gift|forget about it|never mind|no longer owe|don't owe)\b/i;
const confirmed=/\b(?:we(?:'re| are) settled|we(?:'re| are) good|got the \$|got your \$|received|paid in full|money arrived)\b/i;
const revise=/\b(?:i meant|the corrected amount|not \$\d|make it|revised to|correction)\b/i;
function prices(s){return [...s.matchAll(money)].map(m=>Number(m[1]||m[2])).filter(x=>x>0&&x<=10000)}
function single(s){const v=prices(s);return v.length===1?v[0]:null}
function clauses(body){return body.replace(/(\d)\.(\d)/g,"$1\u2024$2").split(/(?<=[.!?;])\s+/).map(x=>x.replace(/\u2024/g,".").trim()).filter(Boolean)}
function addressee(text,names){
 for(const name of [...names].sort((a,b)=>b.length-a.length)){
  const escaped=name.replace(/[-/\\^$*+?.()|[\]{}]/g,"\\$&");
  const re=new RegExp("^(?:(?:so|and|hey|hi|yo|also)\\s+)?@?"+escaped+"(?=\\s|[,.:!—–-])(?:\\s*[,.:!—–-]\\s*|\\s+)","i");
  const match=re.exec(text);
  if(match)return {name,rest:text.slice(match[0].length).trim()};
 }
 return null;
}
function tasksFrom(text){
 let s=text.trim().replace(/^(?:(?:please|just|also|could you|can you|would you)\s+)+/gi,"");
 const found=/^(send|share|forward|email|upload|bring|submit|take|call)\s+(?:me\s+|us\s+)?(.+?)\s*[.!?;]*$/i.exec(s);
 if(!found)return [];
 const verb=found[1].toLowerCase(),obj=found[2].trim();
 if(/\b(?:usdc|dollars?|refund|repay)\b|\$\s*\d/i.test(obj)||!obj||obj.length>125)return [];
 const title=verb[0].toUpperCase()+verb.slice(1)+" "+obj;
 const split=atomizeTasks([{kind:"task",title,evidence:verb+" "+obj,status:"open"}]);
 if(split.length===2)return split.map(t=>({title:t.title,taskKey:t.taskKey}));
 if(!/\b(?:photo|picture)\s+of\b/i.test(obj)){
  const pair=obj.split(/\s+and\s+/i);
  if(pair.length===2&&/^(?:receipts?|links?|pdfs?|files?|flyers?|posters?|documents?|details?|maps?|instructions?)\b/i.test(pair[1]))
    return pair.map(p=>({title:verb[0].toUpperCase()+verb.slice(1)+" "+p,taskKey:verb+":"+norm(p)}));
 }
 return [{title,taskKey:verb+":"+norm(obj)}];
}
function eventBase(turn,addressee,clause,n){return {id:"ge"+n,speaker:turn.speaker,addressee,clause,quote:turn.evidence,offset:turn.start}}
export function groupEventTimeline(context){
 const events=[],names=context.participants,me=context.participant;
 for(const turn of context.turns){
  let target=null;
  for(const clause of clauses(turn.body)){
   const found=addressee(clause,names);
   if(found)target=found.name;
   const text=found?found.rest:clause;
   const base=eventBase(turn,target,text,events.length);
   if(norm(turn.speaker)===norm(me)){
    if(/\b(?:already sent|sent it|already did)\b/i.test(text))events.push({...base,type:"claim_sent"});
    continue;
   }
   if(found&&norm(target)!==norm(me))continue;
   if(!target){
    // Unaddressed follow-up only changes an unambiguous request by this speaker.
    if(confirmed.test(text))events.push({...base,type:"acknowledge",amount:single(text),addressee:me});
    continue;
   }
   if(norm(target)!==norm(me)||quoted.test(text))continue;
   if(waived.test(text)){events.push({...base,type:"cancel",amount:single(text)});continue}
   if(revise.test(text)&&prices(text).length===2){
    const [amount,oldAmount]=prices(text);
    events.push({...base,type:"correct",amount,oldAmount});continue;
   }
   if(confirmed.test(text)){events.push({...base,type:"acknowledge",amount:single(text)});continue}
   if(conditional.test(text))continue;
   const amount=single(text);
   if(amount!==null){
    if(/\bi\s+(?:still\s+)?owe\s+you\b/i.test(text)){
     events.push({...base,type:"money",direction:"owed_to_me",amount,payer:turn.speaker,payee:me});continue;
    }
    if(/\byou\s+(?:still\s+)?owe\s+me\b|\byou\s+only\s+have\b|\b(?:send|pay|transfer)\s+(?:(?:me|us|[\p{L}][\p{L}\p{M}'-]*)\s+)?(?:your\s+|the\s+)?(?:remaining\s+)?(?:\$\s*\d|\d+(?:\.\d+)?\s+(?:usd|usdc|dollars?))/iu.test(text)){
      const named=/\b(?:send|pay|transfer)\s+([\p{L}][\p{L}\p{M}\x27-]*)\s+(?:your\s+)?(?:\$\s*\d|\d+(?:\.\d+)?\s+(?:usd|usdc|dollars?))/iu.exec(text);
      const explicit=named&&names.find(name=>norm(name)===norm(named[1]));
      events.push({...base,type:"money",direction:"i_owe",amount,payer:me,payee:explicit||turn.speaker});continue;
    }
   }
   for(const task of tasksFrom(text))events.push({...base,type:"task",...task});
  }
 }
 return events;
}
function record(event,status="open",note=""){
 const isMoney=event.type==="money";
 return {id:randomUUID(),kind:isMoney?"money":"task",direction:isMoney?event.direction:"i_owe",
  title:isMoney?(event.direction==="owed_to_me"?"Money due to you · $":"Group payment · $")+event.amount:event.title,
  amount:isMoney?event.amount:null,evidence:event.quote,taskKey:event.taskKey,
  groupActor:event.addressee,groupDirect:true,groupEventId:event.id,
  recipientName:event.payee||"",contextNote:note||"Group chat item; verify the speakers and latest context.",
  status,currency:"USD",recipientAddress:"",txHash:"",payer:"",network:"monad-testnet",
  createdAt:new Date().toISOString()};
}
export function reconcileGroupEvents(events,me){
 const entries=[],history=[];
 for(const ev of events){
  if(ev.type==="money"||ev.type==="task"){
   if(norm(ev.addressee)!==norm(me))continue;
   if(ev.type==="task"&&entries.some(x=>x.item.taskKey===ev.taskKey))continue;
   // Restating the new amount immediately after a correction in the same
   // speaker turn is not a second debt. Separate-turn requests stay distinct.
   if(ev.type==="money"&&entries.some(x=>x.item.kind==="money"&&x.item.status==="open"&&
       x.item.direction===ev.direction&&x.item.amount===ev.amount&&x.item.evidence===ev.quote&&
       norm(x.payee)===norm(ev.payee))){history.push({...ev,outcome:"same_turn_confirmation"});continue}
   entries.push({item:record(ev),payee:ev.payee});history.push({...ev,outcome:"open"});
   continue;
  }
  if(!["acknowledge","cancel","correct"].includes(ev.type)){history.push({...ev,outcome:"unverified_claim"});continue}
  const open=entries.filter(x=>x.item.kind==="money"&&x.item.status==="open"&&
    x.item.direction==="i_owe"&&norm(x.payee)===norm(ev.speaker));
  let match=null;
  if(ev.type==="correct"){
   const options=open.filter(x=>x.item.amount===ev.oldAmount);
   if(options.length===1){
    match=options[0];match.item.status="cancelled";
    match.item.contextNote="Superseded by a later correction. Not payable.";
    const replacement={...ev,type:"money",direction:"i_owe",payer:me,payee:ev.speaker,amount:ev.amount};
    entries.push({item:record(replacement,"open","Later corrected amount. Group payment remains disabled."),payee:ev.speaker});
   }
  }else{
   const matching=ev.amount===null?open:open.filter(x=>x.item.amount===ev.amount);
   if(matching.length===1){
    match=matching[0];match.item.status=ev.type==="cancel"?"cancelled":"conversation_confirmed";
    match.item.contextNote=ev.type==="cancel"?"The requester withdrew this debt. No transfer is needed.":
      "Acknowledged by the requester in the chat; NOT independently verified onchain.";
   }
  }
  history.push({...ev,outcome:match?match.item.status:"unresolved"});
 }
 return {items:entries.map(x=>x.item).slice(0,16),history};
}
export function resolveGroupConversation(text,participant){
 const context=validatedGroupIdentity(text,participant);
 if(!context)return null;
 if(!context.participant&&!context.observer){
  const err=new Error("Choose which participant is you before analysing a group conversation.");
  err.status=422;throw err;
 }
 const member=context.participant;
 const base={id:randomUUID(),source:"text",transcript:text,perspective:"group",
  groupContext:{participants:context.participants,participant:member,observer:context.observer},
  title:"Group conversation",summary:"Reconciled across speakers and message order; group transfers paused.",
  createdAt:new Date().toISOString(),fingerprint:createHash("sha256")
  .update("group:"+norm(member||"observer")+":"+text.toLocaleLowerCase()).digest("hex")};
 if(context.observer)return {...base,obligations:[],events:[],analysisNote:"You are not a participant; no debts assigned."};
 const timeline=groupEventTimeline(context),result=reconcileGroupEvents(timeline,member);
 return {...base,events:result.history,obligations:result.items,
  analysisNote:"Group payments are paused. Owed distinguishes requests, changes and in-chat confirmations from onchain settlement."};
}
