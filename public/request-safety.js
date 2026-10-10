import { sourceStatements } from "./source-statements.js";

// Source-grounded checks for money requests that were withdrawn, relayed by
// a third party, or revised without a clear final amount. Never create Pay from
// these without a fresh, unambiguous instruction.
const moneyMention = /\$\s*\d+(?:\.\d+)?|\b\d+(?:\.\d+)?\s*(?:dollars?|usd|usdc)\b|\b(?:a|one|two|three|four|five|six|seven|eight|nine|ten|twenty|fifty|hundred)\s+dollars?\b/gi;
const ask = /\b(?:can|could|would|may)\s+(?:i|you)\s+(?:please\s+)?(?:just\s+)?(?:get|have|borrow|send|give|lend|spare|pay|transfer)\b|\b(?:please\s+)?(?:send|pay|transfer)\s+me\b|\b(?:help\s+me\s+(?:out\s+)?with|spare\s+me)\b|\byou\s+(?:still\s+)?owe\s+me\b/i;
const withdraw = /\b(?:never\s*mind|nevermind|forget\s+(?:it|that|the\s+request)|(?:do\s+not|don't)\s+(?:send|pay|transfer)\s+(?:anything|it|the\s+money)|(?:no\s+longer|don't|do\s+not)\s+need\s+(?:it|the\s+money)|cancel\s+(?:that|the\s+request))\b/i;
const revision = /\b(?:make\s+(?:it|that)|change\s+(?:it|that)\s+to|instead|rather|\bor\b|actually\s+\$?|correction)\b/i;
const reported = /\b(?:i|we|he|she|they|my\s+friend|[a-z]+)\s+(?:told|asked|said|wrote|texted|messaged|quoted)\b[^.!?;\n]{0,65}$/i;
function statements(text) {
  return sourceStatements(text);
}
export function unsafeRequestSegments(source) {
  const text=String(source||"");
  const segments=statements(text),out=[];
  for(let i=0;i<segments.length;i++){
    const segment=segments[i];
    const request=ask.exec(segment.text);
    if(!request || ![...segment.text.matchAll(moneyMention)].length)continue;
    const prefix=segment.text.slice(0,request.index);
    const next=segments[i+1]?.text||"";
    const follow=segment.text.slice(request.index);
    let reason="";
    let end=segment.end;
    if(reported.test(prefix))reason="A money request was quoted or retold, not clearly addressed to you.";
    else if(withdraw.test(follow)||withdraw.test(next)) {
      reason="The money request appears to have been withdrawn. No payment was added.";
      if(withdraw.test(next))end=segments[i+1].end;
    }
    else if(revision.test(follow)&&[...follow.matchAll(moneyMention)].length>=2)
      reason="More than one possible amount was mentioned. Confirm the final amount before paying.";
    else if(revision.test(next)&&[...next.matchAll(moneyMention)].length){
      reason="The requested amount may have changed. Confirm the final amount before paying.";
      end=segments[i+1].end;
    }
    if(reason)out.push({...segment,end,reason});
  }
  return out;
}
export function unsafeMoneyRequestReason(item,source) {
  if(item?.kind!=="money")return "";
  const text=String(source||""),evidence=String(item.evidence||"").trim();
  if(!evidence)return "";
  // An acknowledged, completed payment is not a fresh money request.
  // Text acknowledgement alone cannot be presented as verified onchain.
  if (/\b(?:saw|received|got)\s+(?:the\s+)?\$\s*\d+(?:\.\d+)?\s+you\s+(?:sent|paid|transferred)\b/i.test(evidence) &&
      /\b(?:we(?:'re|\s+are)\s+good\s+now|that's\s+everything\s+you\s+owed\s+me)\b/i.test(evidence))
    return "The sender describes this amount as already paid. No new outstanding debt is established.";
  for(const segment of unsafeRequestSegments(text)){
    let pos=text.toLowerCase().indexOf(evidence.toLowerCase());
    while(pos>=0){
      if(pos<segment.end && pos+evidence.length>segment.start){
        // The financial reconciler already established an exact revised amount.
        if((segment.reason.startsWith("The requested amount may have changed") ||
            segment.reason.startsWith("More than one possible amount was mentioned")) &&
           /^Revised from \$[\d.]+ to \$[\d.]+\./.test(String(item.contextNote||"")))return "";
        return segment.reason;
      }
      pos=text.toLowerCase().indexOf(evidence.toLowerCase(),pos+1);
    }
  }
  return "";
}
