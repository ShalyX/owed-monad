// Extract only source-quoted, explicit payment requests when a small LLM misses them.
// In particular, a shopping estimate such as "you'll need $250" is NOT a debt.
const digitAmount = String.raw`\$\s*\d{1,6}(?:\.\d{1,6})?|\b\d{1,6}(?:\.\d{1,6})?\s*(?:usdc|usd|dollars?)\b`;
const units = ["zero","one","two","three","four","five","six","seven","eight","nine",
  "ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen",
  "eighteen","nineteen","twenty","thirty","forty","fifty","sixty","seventy",
  "eighty","ninety","hundred","thousand","and"];
const words = "(?:" + units.join("|") + ")";
const moneyPattern = new RegExp(digitAmount + "|\\b" + words + "(?:[\\s-]+" + words + "){0,8}\\s+dollars?\\b", "gi");
const basic = {zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,
  ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,
  seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,
  sixty:60,seventy:70,eighty:80,ninety:90};
function parseAmount(match) {
  const numeric = match.match(/\d+(?:\.\d+)?/);
  if (numeric) return Number(numeric[0]);
  const tokens = match.toLowerCase().replace(/[\-,]/g, " ").replace(/\bdollars?\b/g, "").split(/\s+/).filter(x=>x!=="and"&&x);
  if (!tokens.length) return null;
  // 'two fifty' might mean $2.50 or $250. Never make it payable by guessing.
  if (tokens.length===2 && basic[tokens[0]]<=9 && basic[tokens[1]]>=20) return null;
  let group=0,total=0;
  for(const word of tokens) {
    if(word==="hundred") {if(!group)return null;group*=100;}
    else if(word==="thousand"){if(!group)return null;total+=group*1000;group=0;}
    else if(Object.hasOwn(basic,word)) group+=basic[word];
    else return null;
  }
  const n=total+group;
  return n>0&&n<=10000?n:null;
}
function isExplicitAsk(fragment, perspective) {
  const lower=fragment.toLowerCase();
  if (/\b(if|suppose|imagine|hypothetically|for example)\b.{0,35}\b(?:owe|send|pay)\b/i.test(lower)) return false;
  // Notes like "you should need 250 dollars" are estimates, not obligations.
  const direct=/\b(?:you\s+(?:still\s+)?owe\s+me|(?:please\s+)?(?:send|pay|transfer)\s+(?:me|us)\b|(?:could|can|would)\s+you\s+(?:please\s+)?(?:send|pay|transfer)\b|(?:you\s+)?(?:can|could)\s+(?:just\s+)?send\s+(?:it|the\s+money)\b|(?:send|pay)\s+(?:it|the\s+money)\s+(?:in\s+)?(?:right\s+)?now\b|i\s+(?:still\s+)?owe\s+you)\b/i.test(lower);
  if (direct) return true;
  return /\b(?:send|pay|transfer)\s+(?:me\s+)?(?:my\s+)?(?:\$\s*\d|\d+\s+dollars?|[a-z -]+\s+dollars?)\b/i.test(lower);
}
function directionFor(fragment,perspective) {
  const self=perspective==="recording";
  if(/\bi\s+(?:still\s+)?owe\s+you\b/i.test(fragment))return self?"i_owe":"owed_to_me";
  if(/\byou\s+(?:still\s+)?owe\s+me\b/i.test(fragment))return self?"owed_to_me":"i_owe";
  if(/\b(?:send|pay|transfer)\s+me\b/i.test(fragment))return self?"owed_to_me":"i_owe";
  // A first-person incoming speaker asking the listener to send money.
  if(/\b(?:you\s+can\s+(?:just\s+)?send|can\s+you\s+send|send\s+it)\b/i.test(fragment))return self?"unclear":"i_owe";
  return "unclear";
}
export function explicitSpokenPayments(transcript,perspective="incoming") {
  const text=String(transcript||"").trim();
  if(!text) return [];
  const phrases=[...text.matchAll(/[^.!?;\n]+[.!?;]?/g)];
  const result=[];
  for(let i=0;i<phrases.length;i++){
    const piece=phrases[i][0].trim();
    const before=i?phrases[i-1][0].trim():"";
    const after=i+1<phrases.length?phrases[i+1][0].trim():"";
    // Allow "$250 total. You can just send it now" with a request in the adjacent sentence.
    const directHere=isExplicitAsk(piece,perspective);
    const adjacent=(!directHere && isExplicitAsk(after,perspective) && /\b(?:total|both|amount|cost|balance)\b/i.test(piece))
      ? piece+" "+after : null;
    if(!directHere&&!adjacent)continue;
    const context=(directHere?piece:adjacent);
    const matches=[...piece.matchAll(moneyPattern)];
    if(!matches.length && directHere && /\b(?:send|pay|transfer)\s+(?:it|the\s+money)\b/i.test(piece)){
      // "$250 total. You can send it now."
      if(before && /\b(?:total|both|amount|cost|balance)\b/i.test(before)){
        for(const money of before.matchAll(moneyPattern))matches.push(money);
      }
    }
    for(const hit of matches){
      const phrase = hit[0];
      const value=parseAmount(phrase);
      // If amount is ambiguous, keep the request for review; never auto-quote a price.
      if(value!==null && (!Number.isFinite(value)||value<=0||value>10000))continue;
      const quote=String(context.length>260?context.slice(0,260):context).trim();
      const direction=directionFor(context,perspective);
      if(direction==="unclear")continue;
      if(result.some(x=>x.amount===value && x.direction===direction && x.evidence===quote))continue;
      result.push({title:value===null?"Review payment request":direction==="i_owe"?"Send $"+value:"Receive $"+value,
        kind:"money",direction,amount:value,evidence:quote,recipientName:"",sourceRule:"explicit-speech"});
      if(result.length>=8)return result;
    }
  }
  return result;
}
