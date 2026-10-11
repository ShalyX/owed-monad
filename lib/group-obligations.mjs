import { randomUUID, createHash } from "node:crypto";
import { validatedGroupIdentity } from "../public/group-context.js";
import { explicitNonMoneyTasks } from "../public/explicit-tasks.js";
import { atomizeTasks } from "../public/atomic-tasks.js";
import { unsafeMoneyRequestReason } from "../public/request-safety.js";

const amountRe=/(?:\$\s*(\d{1,5}(?:\.\d{1,6})?)|(\d{1,5}(?:\.\d{1,6})?)\s*(?:USDC|USD|dollars?)\b)/gi;
const bad=/\b(?:if|unless|only\s+if|hypothetically|just\s+imagine|don't\s+send|do\s+not\s+send|never\s*mind|my\s+treat|already\s+paid)\b/i;
const normalize=s=>String(s||"").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
function addressed(body,name) {
  const escaped=name.replace(/[.*+?^$()|[\]{}]/g,"\\$&");
  const prefix=new RegExp("(?:^|[.!?]\\s+)(?:so\\s+)?(?:(?:hey|hi|yo)\\s+)?@?"+escaped+"(?:\\s*[,.:!—–-]\\s*|\\s+)","i");
  const found=prefix.exec(body);
  return found ? body.slice(found[0].length).replace(/^\s*(?:also\s+)?/i,"").trim() : null;
}
function amountOf(phrase){
  const all=[...phrase.matchAll(amountRe)];
  if(all.length!==1)return null;
  const n=Number(all[0][1]||all[0][2]);
  return Number.isFinite(n)&&n>0&&n<=10000&&Math.abs(Math.round(n*1e6)/1e6-n)<1e-10?n:null;
}
function moneyRequest(statement){
  if(bad.test(statement))return null;
  const due=/\byou\s+(?:still\s+)?owe\s+me\b/i.test(statement) ||
    /\byou\s+only\s+have\s+\$\s*\d+(?:\.\d+)?\s+left\s+to\s+send\s+me\b/i.test(statement) ||
    /\b(?:send|pay|transfer)\s+(?:(?:me|us|[\p{L}][\p{L}\p{M}'-]*)\s+)?(?:your\s+)?(?:\$\s*\d|\d+(?:\.\d+)?\s+(?:USD|USDC|dollars?))/iu.test(statement);
  return due ? amountOf(statement) : null;
}
function addMoney(result,source,from,to,amount,body,direction="i_owe"){
  const evidence=body.trim();
  if(unsafeMoneyRequestReason({kind:"money",evidence},source))return;
  if(result.some(x=>x.kind==="money"&&x.amount===amount&&x.evidence===evidence))return;
  result.push({id:randomUUID(),kind:"money",direction,
    title:(direction==="owed_to_me"?"Group payment due to you · $":"Group payment · $")+amount,amount,currency:"USD",
    evidence,recipientName:to,groupActor:from,groupDirect:true,
    contextNote:"Explicitly addressed to "+from+" in the group chat. Confirm the recipient and amount before sending.",
    status:"open",recipientAddress:"",txHash:"",payer:"",network:"monad-testnet",
    createdAt:new Date().toISOString()});
}
export function resolveGroupConversation(text,participant){
  const context=validatedGroupIdentity(text,participant);
  if(!context) return null;
  if(!context.participant&&!context.observer){
    const err=new Error("Choose which participant is you before analysing a group conversation.");
    err.status=422;throw err;
  }
  const member=context.participant;
  const base={id:randomUUID(),source:"text",transcript:text,
    perspective:"group",groupContext:{participants:context.participants,participant:member,observer:context.observer},
    title:"Group conversation",summary:"Only requests explicitly addressed to your selected participant are actionable.",
    createdAt:new Date().toISOString(),
    fingerprint:createHash("sha256").update("group:"+normalize(member||"observer")+":"+text.toLocaleLowerCase()).digest("hex")};
  if(context.observer)return {...base,obligations:[],analysisNote:"You're not a participant in this chat. Owed won't assign anyone else's debts or tasks to you."};
  const items=[];
  for(const turn of context.turns){
    if(normalize(turn.speaker)===normalize(member))continue;
    const direct=addressed(turn.body,member);
    if(!direct)continue;
    const incoming=/\bi\s+(?:still\s+)?owe\s+you\b/i.test(direct)&&!bad.test(direct)
      ? amountOf(direct):null;
    if(incoming!==null){
      addMoney(items,text,turn.speaker,member,incoming,turn.body,"owed_to_me");
      continue;
    }
    const amount=moneyRequest(direct);
    if(amount!==null) {
      let recipient=turn.speaker;
      const payee=/\b(?:send|pay|transfer)\s+([\p{L}][\p{L}\p{M}'-]*)\s+(?:your\s+)?(?:\$|\d+(?:\.\d+)?\s+(?:usd|usdc|dollars?))/iu.exec(direct);
      if(payee&&!/^(?:me|us|your)$/i.test(payee[1]))recipient=payee[1];
      addMoney(items,text,member,recipient,amount,turn.body);
      continue;
    }
    const tasks=atomizeTasks(explicitNonMoneyTasks(direct));
    for(const task of tasks){
      if(bad.test(direct))continue;
      items.push({...task,id:randomUUID(),groupActor:member,groupRequester:turn.speaker,
        contextNote:"Requested directly from "+member+" by "+turn.speaker+" in this group chat."});
    }
  }
  return {...base,obligations:items.slice(0,16),
    analysisNote:"Showing only requests explicitly addressed to "+member+". Other speakers' balances are not yours. If the chat is ambiguous, confirm with the group."};
}
