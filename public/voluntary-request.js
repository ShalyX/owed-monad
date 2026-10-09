// Explicit voluntary money asks, separate from a debt and from general spending advice.
// Ground every candidate in the exact source words. Never invent a payee wallet.
const amount = String.raw`(?:\$\s*\d{1,5}(?:\.\d{1,6})?|\b\d{1,5}(?:\.\d{1,6})?\s*(?:USDC|USD|dollars?)\b|\b(?:a|one|two|three|four|five|six|seven|eight|nine|ten|twenty|fifty|hundred)\s+dollars?\b)`;
const AMOUNT = new RegExp(amount, "i");
const amountWords={a:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,twenty:20,fifty:50,hundred:100};
function parseAmount(phrase) {
  const digits=phrase.match(/\d+(?:\.\d+)?/);
  if(digits)return Number(digits[0]);
  const word=phrase.match(/\b(a|one|two|three|four|five|six|seven|eight|nine|ten|twenty|fifty|hundred)\b/i)?.[0]?.toLowerCase();
  return amountWords[word]??null;
}
const ask = /(?:\b(?:can|could|may|might)\s+i\s+(?:please\s+)?(?:just\s+)?(?:get|have|borrow)\b|\b(?:can|could|would)\s+you\s+(?:please\s+)?(?:spare|give|lend|send)\b|\b(?:please\s+)?(?:help\s+me\s+(?:out\s+)?with|spare\s+me)\b)/i;
const negated=/\b(?:if|unless|hypothetically|suppose|pretend|for example|imagine)\b/i;
const moneyTerms=/\b(?:dollars?|usd|usdc)\b|\$/i;
function matchPhrase(text) {
  const phrase=String(text||"").trim();
  const request=phrase.match(ask);
  if(!request) return null;
  const start=request.index;
  const trailing=phrase.slice(start);
  const boundary=trailing.search(/[.!?;\n]/);
  const segment=boundary<0?trailing:trailing.slice(0,boundary);
  // Restrict inference to exact money in the same speech clause as the ask.
  const found=segment.match(AMOUNT);
  if(!found||!moneyTerms.test(found[0])||found.index>125)return null;
  const prefix=phrase.slice(0,start);
  if(negated.test(prefix)||/\b(?:if|unless|once|when|provided|after|hypothetically)\b/i.test(segment)||/\b(?:not|never|don't|do not)\b/i.test(segment.slice(0,found.index)))return null;
  const context=segment.slice(0,Math.min(segment.length,260)).trimEnd();
  if(/\b(?:you\s+owe\s+me|i\s+owe\s+you|pay\s+me\s+back|you\s+still\s+owe)\b/i.test(segment))return null;
  // A demonstrative, second-person conditional is not a real money ask.
  const value=parseAmount(found[0]);
  if(!Number.isFinite(value)||value<=0||value>10000||Math.round(value*1e6)!==value*1e6)return null;
  const quote=(/^\s/.test(segment)?" ":"")+context;
  // Exact source quote, not a generated paraphrase.
  const index=text.indexOf(context);
  return index>=0?{amount:value,evidence:text.slice(index,index+context.length)}:null;
}
export function findVoluntaryRequests(transcript,perspective="incoming") {
  const text=String(transcript||"").trim().slice(0,12000);
  if(!text)return [];
  const result=[];
  const spans=[...text.matchAll(/[^.!?;\n]+[.!?;\n]?/g)];
  for(const span of spans){
    const possible=matchPhrase(span[0]);
    if(!possible)continue;
    const position=text.indexOf(possible.evidence,span.index);
    const prefix=text.slice(Math.max(0,position-80),position).split(/[.!?;\n]/).pop();
    if(negated.test(prefix))continue;
    if(result.some(x=>x.amount===possible.amount && x.evidence===possible.evidence))continue;
    result.push({
      kind:"money",direction:perspective==="recording"?"owed_to_me":"i_owe",
      intent:"voluntary_request",
      title:perspective==="recording"?"You asked for $"+possible.amount:"Asked you for $"+possible.amount,
      amount:possible.amount,evidence:possible.evidence,
      contextNote:"A request for help, not money already owed. Sending is entirely your choice."
    });
    if(result.length===5)break;
  }
  return result;
}
