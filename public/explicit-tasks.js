import { sourceStatements } from "./source-statements.js";

// Conservative recovery of distinct non-money instructions missed by a tiny AI.
// Only directly requested, source-quoted actions. Never create a task for paying money.
const sendItem=/\b(?:(?:also|please)\s+)*(?:send|share|forward)\s+(?:me\s+)?(?:the\s+|your\s+|that\s+)?(?:[a-z'-]+\s+){0,3}(?:address|link|location|map\s+pin|photo|picture|file|receipt|screenshot|document|details|pdf|guest\s+list|flyer)\b/i;
const remind=/\b(?:also\s+)?remind\s+me\s+to\s+[a-z][a-z' -]{3,85}/i;
const receiptCheck=/\b(?:can|could|would)\s+you\s+(?:please\s+)?check\s+(?:whether|if)\s+it\s+(?:arrived|landed|came\s+through)\b/i;
const nonAction=/\b(?:if|suppose|imagine|hypothetically|for example|quoted|someone said)\b/i;
const paymentMention=/\$\s*\d|\b(?:usdc|dollars?|repay|reimburse)\b/i;
export function explicitNonMoneyTasks(source,perspective="incoming"){
 const text=String(source||"").trim().slice(0,12000);
 const result=[];
 for(const chunk of sourceStatements(text)){
  const sentence=chunk.text,trimmed=sentence.trim();
  if(nonAction.test(trimmed))continue;
  const candidates=[sentence.match(sendItem),sentence.match(remind),sentence.match(receiptCheck)].filter(Boolean);
  for(const match of candidates){
   const quote=match[0].trim().replace(/[,.!?;]+$/,"");
   if(!quote||paymentMention.test(quote))continue;
   const prefix=sentence.slice(0,match.index);
   if(/\b(?:told|asked|quoted|said|imagined)\b/i.test(prefix))continue;
   // A bare object mention is not an independent task. The source must ask.
   if(!/\b(?:send|share|forward|remind|check)\b/i.test(quote))continue;
   const title=quote.replace(/^(?:also\s+)?(?:please\s+)?/i,"").replace(/^./,c=>c.toUpperCase());
   const evidence=text.slice(text.indexOf(quote,chunk.start),text.indexOf(quote,chunk.start)+quote.length);
   if(!evidence || result.some(x=>x.evidence.toLowerCase()===evidence.toLowerCase()))continue;
   result.push({kind:"task",direction:"i_owe",title,evidence,amount:null,recipientName:"",
     currency:"USD",status:"open",recipientAddress:"",txHash:"",payer:"",network:"monad-testnet",
     createdAt:new Date().toISOString()});
   if(result.length>=8)return result;
  }
 }
 return result;
}
