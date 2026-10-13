// Browser-owned corrections preserve immutable source evidence and an edit trail.
// An edited monetary interpretation NEVER becomes payable from a local claim.
const protectedStates=new Set(["settled","pending","submitting","review","failed"]);
const moneyStates=new Set(["needs_review","user_handled","dismissed"]);
const directionValues=new Set(["i_owe","owed_to_me","unclear"]);
const narrow=x=>String(x||"").trim();
export function canCorrect(item){
 return Boolean(item&&["money","task"].includes(item.kind)&&
   !protectedStates.has(item.status)&&!(item.kind==="money"&&item.txHash));
}
export function hasReverifiedSource(item) {
 if(!item || item.kind!=="money" || item.manualReviewOnly)return false;
 if(!Array.isArray(item.reviewHistory)||!item.reviewHistory.some(e=>e.kind==="user_review"))return true;
 return Boolean(item.sourceVerification?.supported &&
   item.sourceVerification.amount===item.amount &&
   item.sourceVerification.direction===item.direction &&
   /^([a-f0-9]{64})$/.test(item.sourceVerification.sourceKey||""));
}
export function applySourceReview(item,reply,{now=new Date().toISOString()}={}) {
 if(!item || item.kind!=="money" || item.status!=="needs_review" ||
   !item.manualReviewOnly || item.txHash)return {ok:false,error:"Only a corrected, unpaid money item can be rechecked."};
 if(reply?.supported) {
  if(reply.amount!==item.amount||reply.direction!==item.direction ||
    !/^[a-f0-9]{64}$/.test(reply.sourceKey||"")||reply.receiptVerified!==false)
    return {ok:false,error:"The source check did not match the current correction."};
  item.sourceVerification={supported:true,sourceKey:reply.sourceKey,
    amount:reply.amount,direction:reply.direction,evidence:reply.sourceEvidence,
    checkedAt:now,basis:"source_text_only"};
  item.manualReviewOnly=false;
  item.status="open";
  item.contextNote="Source text rechecked: this is an explicit request, not a confirmed debt, recipient identity, or onchain payment.";
 }else{
  item.manualReviewOnly=true;
  item.sourceVerification=null;
  item.contextNote="Source check could not independently support this correction. Payment stays disabled.";
 }
 item.reviewHistory=Array.isArray(item.reviewHistory)?item.reviewHistory:[];
 item.reviewHistory.push({kind:"source_recheck",at:now,sourceSupported:Boolean(reply?.supported),
  reason:String(reply?.reason||"No source support")});
 return {ok:true,supported:Boolean(reply?.supported)};
}
export function reopenManualResolution(item,{now=new Date().toISOString()}={}) {
 if(!item||item.kind!=="money"||!item.manualReviewOnly||
    !["dismissed","user_handled"].includes(item.status) || item.txHash)return false;
 const previous=item.status;
 item.status="needs_review";
 item.reviewHistory=Array.isArray(item.reviewHistory)?item.reviewHistory:[];
 item.reviewHistory.push({kind:"reopen_review",at:now,before:{status:previous},after:{status:"needs_review"}});
 return true;
}
export function applyItemCorrection(item,changes,{now=new Date().toISOString()}={}){
 if(!canCorrect(item))return {ok:false,error:"A pending, failed or verified transfer cannot be edited. Review the transaction separately."};
 const title=narrow(changes?.title);
 if(!title||title.length>140)return {ok:false,error:"Enter a short title (1–140 characters)."};
 const note=narrow(changes?.note);
 if(note.length>500)return {ok:false,error:"Keep the review note under 500 characters."};
 const next={title};
 if(item.kind==="money"){
  const amount=Number(changes?.amount);
  if(!Number.isFinite(amount)||amount<=0||amount>10000||!Number.isInteger(Math.round(amount*1e6))||
    Math.abs(amount-Math.round(amount*1e6)/1e6)>1e-10)
    return {ok:false,error:"Enter a positive amount with up to six decimal places."};
  if(!directionValues.has(changes?.direction))return {ok:false,error:"Choose who owes whom."};
  if(!moneyStates.has(changes?.status))return {ok:false,error:"Choose review, handled in chat or dismiss."};
  next.amount=amount;next.direction=changes.direction;next.status=changes.status;
 }else{
  if(!["open","done"].includes(changes?.status))return {ok:false,error:"Choose open or completed for a task."};
  next.status=changes.status;
 }
 const before={title:item.title,amount:item.amount,direction:item.direction,status:item.status};
 const changed=Object.keys(next).some(k=>next[k]!==item[k])||Boolean(note);
 if(!changed)return {ok:false,error:"No changes to save."};
 if(!item.sourceEvidence)item.sourceEvidence=item.evidence;
 delete item.sourceVerification;
 for(const [k,v] of Object.entries(next))item[k]=v;
 item.manualReviewOnly=item.kind==="money"?true:Boolean(item.manualReviewOnly);
 item.reviewHistory=Array.isArray(item.reviewHistory)?item.reviewHistory:[];
 item.reviewHistory.push({at:now,before,after:next,note,kind:"user_review"});
 item.reviewedAt=now;
 item.reviewNote=note;
 if(item.kind==="money")item.contextNote=item.status==="user_handled"
  ?"You marked this as handled in conversation. This is not a verified onchain payment."
  :"Manually reviewed interpretation. Not eligible for Pay; verify the source and person independently.";
 return {ok:true,item};
}
