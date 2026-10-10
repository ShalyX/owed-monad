import { unsafeMoneyRequestReason } from "./request-safety.js";
import { sourceStatements } from "./source-statements.js";

// Financial-context safety pass. This does not add an inbox category.
// It prevents an amount in a condition, correction, or split total from
// becoming an actionable payment simply because a small model found "$".
const amountToken = String.raw`(?:\$\s*(\d{1,5}(?:\.\d{1,6})?)|\b(\d{1,5}(?:\.\d{1,6})?)\s*(?:USD|USDC|dollars?)\b)`;
const amountRegex = new RegExp(amountToken, "gi");
function amounts(text) {
  return [...String(text).matchAll(amountRegex)].map(m => ({
    value:Number(m[1] || m[2]),index:m.index,raw:m[0]
  })).filter(x=>Number.isFinite(x.value)&&x.value>0&&x.value<=10000);
}
function moneyItem(items,perspective,amount,evidence,title,contextNote) {
  const cue=/\b(i\s+(?:still\s+)?owe\s+you)\b/i.test(evidence)?"self":
    /\b(you\s+(?:still\s+)?owe\s+me|(?:send|pay|transfer)\s+me)\b/i.test(evidence)?"listener":"none";
  const direction = perspective==="recording"
    ? cue==="self"?"i_owe":cue==="listener"?"owed_to_me":"unclear"
    : cue==="listener"?"i_owe":cue==="self"?"owed_to_me":"unclear";
  const result={
    kind:"money",direction,title,amount,currency:"USD",evidence,
    recipientName:"",recipientAddress:"",status:"open",txHash:"",payer:"",createdAt:new Date().toISOString(),
    network:"monad-testnet",contextNote
  };
  return result;
}
function statements(text) {
  return sourceStatements(text).map(s=>({...s,text:s.text.trim()}));
}
const conditionPattern=/\b(?:if|unless|once|after|provided(?: that)?|as long as|only if|when)\b/i;
const paymentCue=/\b(?:owe|pay|send|transfer|repay|refund|payment|share)\b/i;
function isMaterialCondition(sentence) {
  const relevant=String(sentence||"").replace(
    /\bwhen\s+you\s+get\s+(?:a|the)\s+chance\b|\bwhen\s+you(?:'re|\s+are)\s+free\b|\bwhen\s+you\s+can\b/gi,"");
  return conditionPattern.test(relevant);
}
function conditionalSegments(text) {
  const parts=statements(text);
  const found=parts.filter(s=>isMaterialCondition(s.text)&&paymentCue.test(s.text)&&amounts(s.text).length);
  for(let i=0;i<parts.length;i++) {
    if(!isMaterialCondition(parts[i].text)||amounts(parts[i].text).length)continue;
    const before=parts[i-1],after=parts[i+1];
    for(const neighbor of [before,after]) {
      if(neighbor && paymentCue.test(neighbor.text)&&amounts(neighbor.text).length &&
        // Only join a standalone condition to an adjacent payment statement.
        !found.some(s=>s.start===neighbor.start)) found.push(neighbor);
    }
  }
  return found;
}
function findCorrection(text) {
  const first=/\b(?:you\s+(?:still\s+)?owe\s+me|i\s+(?:still\s+)?owe\s+you|(?:please\s+)?(?:send|pay|transfer)\s+me)\s+/gi;
  const original=[...text.matchAll(first)].map(m=>{
    const after=sourceStatements(text.slice(m.index,Math.min(text.length,m.index+100)))[0]?.text || "";
    const hit=amounts(after)[0];
    return hit ? {start:m.index,amount:hit.value,end:m.index+hit.index+hit.raw.length} : null;
  }).filter(Boolean);
  const correction=/\b(?:actually\s+)?(?:make\s+(?:it|that)\s+|change\s+(?:it|that)\s+to\s+|(?:it's|it is)\s+actually\s+|(?:the\s+)?(?:amount|total)\s+is\s+now\s+)(\$\s*\d{1,5}(?:\.\d{1,6})?|\d{1,5}(?:\.\d{1,6})?\s*(?:dollars?|usd|usdc)\b)/gi;
  const changes=[...text.matchAll(correction)].map(m=>({start:m.index,amount:amounts(m[1])[0]?.value,end:m.index+m[0].length})).filter(x=>x.amount);
  if(!original.length||!changes.length)return null;
  const changed=changes.find(x=>x.start>original[0].end&&x.start-original[0].end<=140);
  if(!changed)return null;
  const unambiguous=original.length===1&&changes.length===1&&
    amounts(text.slice(original[0].start,changed.end)).length===2;
  return {
    original:original[0],latest:changed.amount,
    evidence:text.slice(original[0].start,changed.end).trim(),
    unambiguous
  };
}
const countNames={two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
function findSplit(text) {
  if(!/\b(?:split|splitting|divide|divided)\b/i.test(text))return null;
  const near=[...text.matchAll(/\b(?:split|splitting|divide|divided)\b/gi)];
  const found=near.map(hit=>{
    const segment=text.slice(Math.max(0,hit.index-70),Math.min(text.length,hit.index+180));
    const total=amounts(segment)[0];
    if(!total)return null;
    const ways=segment.match(/\b([2-9]|10|two|three|four|five|six|seven|eight|nine|ten)\s*(?:equal(?:ly)?\s*)?(?:ways|people|persons|of\s+us|of\s+you)\b/i)||
      segment.match(/\b(?:between|among|across)\s+([2-9]|10|two|three|four|five|six|seven|eight|nine|ten)\s+(?:people|persons|of\s+us)\b/i);
    const count=ways ? countNames[ways[1].toLowerCase()]||Number(ways[1]):null;
    return {total:total.value,count,segment,index:hit.index};
  }).filter(Boolean);
  if(!found.length)return null;
  const s=found[0];
  const evidenceStart=text.length<=260?0:Math.max(0,s.index-48);
  const evidence=text.slice(evidenceStart,evidenceStart+260).trim();
  const directShare=/\b(?:you\s+(?:still\s+)?owe\s+me\s+(?:your\s+)?share|(?:send|pay|transfer)\s+me\s+(?:your\s+|the\s+)?share|(?:could|can)\s+you\s+(?:please\s+)?(?:send|pay)\s+me\s+(?:your\s+)?share)\b/i.test(evidence);
  const directAmount=/\b(?:you\s+(?:still\s+)?owe\s+me|(?:send|pay|transfer)\s+me)\s+(?:your\s+)?\$\s*\d/i.test(evidence);
  const num=amounts(text);
  const exactShare=s.count ? Math.round((s.total*1000000)/s.count) : null;
  const exact=Number.isSafeInteger(exactShare) &&
    Math.abs(exactShare*s.count-s.total*1000000)<0.000001;
  const share=exact?exactShare/1000000:null;
  const monetaryValues=num.map(x=>x.value);
  const unrelated=monetaryValues.some(v=>v!==s.total && v!==share);
  const explicitPerPerson=directAmount&&monetaryValues.some(v=>v===share);
  return {...s,share,directShare,explicitPerPerson,
    unambiguous:found.length===1&&new Set(num.map(x=>x.value)).size<=2&&!unrelated&&share!==null&&
      (directShare||explicitPerPerson),
    evidence};
}
function condNote(){return "This payment depends on a condition. Confirm it happened before treating it as owed.";}
export function inspectFinancialContext(text) {
  const source=String(text||"").trim().slice(0,20000);
  const correction=findCorrection(source);
  const possibleCorrection=!correction && !/\b(?:never\s*mind|nevermind|my\s+treat|don't\s+send|do\s+not\s+send)\b/i.test(source) && amounts(source).length>=2 &&
    /\b(?:actually|correction|instead|rather|scratch that|changed? to|revised? to|make (?:it|that)|wait[,!]?|no[,!])\b/i.test(source);
  return {conditional:conditionalSegments(source),correction,possibleCorrection,split:findSplit(source)};
}
export function reconcileFinancialContext(items,source,perspective="incoming") {
  const original=Array.isArray(items)?items.slice():[];
  const text=String(source||"").trim().slice(0,20000);
  if(!text)return {items:original,analysisNote:""};
  const {conditional,correction,possibleCorrection,split}=inspectFinancialContext(text);
  let result=original,notes=[];
  if (conditional.length) {
    const conditionAmounts=conditional.flatMap(s=>amounts(s.text).map(x=>x.value));
    const before=result.length;
    result=result.filter(item=>{
      const fromConditional=conditional.some(s=>s.text.toLowerCase().includes(
        String(item.evidence||"\u0000").toLowerCase()));
      if(item.kind==="money" && (conditionAmounts.includes(item.amount) || fromConditional)) return false;
      if(item.kind==="task" && fromConditional) return false;
      return true;
    });
    if(before!==result.length||conditional.length) notes.push("A conditional payment was mentioned, but it is not yet confirmed as owed.");
  }
  if(possibleCorrection) {
    result=result.filter(item=>item.kind!=="money");
    notes.push("A payment correction was mentioned, but the latest amount is unclear. Please confirm before paying.");
  }
  if(correction) {
    // Never expose the original price as a payable alternative to a correction.
    const amountValues=new Set([correction.original.amount,correction.latest]);
    result=result.filter(item=>item.kind!=="money" ||
      (!amountValues.has(item.amount)&&
       !correction.evidence.toLowerCase().includes(String(item.evidence||"\u0000").toLowerCase())));
    if(correction.unambiguous&&!conditional.length&&!split) {
      const money=moneyItem(original,perspective,correction.latest,correction.evidence,
        "Updated payment · $"+correction.latest,
        "Revised from $"+correction.original.amount+" to $"+correction.latest+". Confirm the revised amount.");
      if(money.direction!=="unclear")result.push(money);
      notes.push("The payment was corrected from $"+correction.original.amount+" to $"+correction.latest+". Only the revised amount is shown.");
    } else {
      result=result.filter(item=>item.kind!=="money");
      notes.push("A payment correction was mentioned, but the final amount needs clarification.");
    }
  }
  if(split) {
    // A group total is not a personal debt. Never expose it with Pay in USDC.
    // For ambiguous splits, deliberately remove model-guessed individual amounts too.
    // Do not allow a guessed value such as $25 from a $60 three-way split.
    // A conflicting split disables all money candidates in this analysis.
    result=result.filter(item=>item.kind!=="money");
    if(split.unambiguous&&!conditional.length&&!correction&&!possibleCorrection) {
      const evidence=split.evidence;
      const amount=split.share;
      const computed=moneyItem(original,perspective,amount,evidence,
        "Your share · $"+amount,
        "Calculated as $"+split.total+" ÷ "+split.count+". Confirm the equal split before paying.");
      if(computed.direction==="unclear" && /\b(?:you\s+(?:still\s+)?owe\s+me|(?:send|pay)\s+me\s+(?:your|the)\s+share)\b/i.test(text)) {
        computed.direction=perspective==="recording"?"owed_to_me":"i_owe";
      }
      if(computed.direction!=="unclear")result.push(computed);
      notes.push("An equal split of $"+split.total+" across "+split.count+" people gives $"+amount+" each. Confirm before paying.");
    } else notes.push("A shared bill was mentioned, but your exact payable share wasn't established.");
  }
  // Never allow a context rewrite to give a task an implicit payment status.
  return {items:result.slice(0,16),analysisNote:notes.join(" ")};
}
export function legacyPaymentWarning(item,source) {
  if(!item||item.kind!=="money")return null;
  const unsafe = unsafeMoneyRequestReason(item,source);
  if(unsafe) return unsafe;
  const {conditional,correction,possibleCorrection,split}=inspectFinancialContext(source);
  if(conditional.some(s=>amounts(s.text).some(m=>m.value===item.amount)||
    s.text.toLowerCase().includes(String(item.evidence||"\u0000").toLowerCase()))) {
    return condNote();
  }
  if(possibleCorrection) return "An amount may have been revised. Re-analyze the message before paying.";
  if(correction && (!correction.unambiguous || item.amount!==correction.latest ||
      !String(item.contextNote||"").includes("Revised from")))
    return "This conversation changes an earlier amount. Re-analyze it to confirm the latest payment before sending.";
  if(split && (!split.unambiguous || item.amount!==split.share ||
      !String(item.contextNote||"").includes("Calculated as")))
    return "This conversation describes a split bill. Re-analyze it to confirm your exact share before sending.";
  return null;
}
