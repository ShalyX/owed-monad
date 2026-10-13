import { createHash } from "node:crypto";
import { cleanAnalysis } from "./obligations.mjs";
import { explicitSpokenPayments } from "./spoken-obligations.mjs";
import { parseGroupTurns } from "../public/group-context.js";
import { legacyPaymentWarning } from "../public/financial-context.js";
import { unsafeMoneyRequestReason } from "../public/request-safety.js";

const normalized=x=>String(x||"").toLocaleLowerCase().replace(/\s+/g," ").trim();
const unresolved=/\b(?:never\s*mind|my\s+treat|don'?t\s+(?:pay|send|transfer)|do\s+not\s+(?:pay|send|transfer)|no\s+longer\s+owe|we(?:'re| are)\s+(?:good|settled)|already\s+(?:paid|sent|settled)|received\s+(?:it|the|your|\$)|got\s+(?:the\s+)?\$[\d.]+|payment\s+(?:received|confirmed)|cancelled|canceled|refunded|refund\s+completed)\b/i;
const maybeConditional=/\b(?:if|unless|only\s+when|once\s+the|after\s+you|as\s+long\s+as|provided\s+that)\b/i;
const direction=new Set(["i_owe","owed_to_me"]);
const supportedResponse=(reason,ref={})=>({supported:false,basis:"source_text_only",receiptVerified:false,reason,...ref});
export function reverifyEditedMoney(payload) {
 const text=String(payload?.text||"").trim();
 const evidence=String(payload?.evidence||"").trim();
 const amount=Number(payload?.amount);
 const perspective=payload?.perspective;
 const requestedDirection=payload?.direction;
 if(text.length<8||text.length>12000||evidence.length<5||evidence.length>1200)
   return supportedResponse("Source text or original evidence is missing or outside its safety limits.");
 if(!["incoming","recording"].includes(perspective)||!direction.has(requestedDirection)||
    !Number.isFinite(amount)||amount<=0||amount>10000||
    Math.abs(amount-Math.round(amount*1e6)/1e6)>1e-9)
   return supportedResponse("The amount, direction, or speaker perspective cannot be independently established.");
 if(parseGroupTurns(text))return supportedResponse("Group-chat payments remain disabled, even after source review.");
 if(!normalized(text).includes(normalized(evidence)))
   return supportedResponse("The original quote was not found verbatim in the provided conversation.");
 // Fail closed on any potential reversal, conditionality, or settlement.
 // This conservatively rejects some genuine multi-obligation conversations.
 if(unresolved.test(text)||maybeConditional.test(text))
   return supportedResponse("The conversation contains a possible cancellation, condition, or completed payment. Confirm outside Owed; Pay stays disabled.");
 const base=cleanAnalysis({title:"Recheck original source",obligations:[]},text,"text",perspective);
 const grounded=explicitSpokenPayments(text,perspective);
 const matched=base.obligations.filter(item=>item.kind==="money"&&item.direction===requestedDirection&&
   item.status==="open"&&item.intent!=="voluntary_request"&&item.amount===amount&&
   !unsafeMoneyRequestReason(item,text)&&!legacyPaymentWarning(item,text));
 const direct=grounded.filter(item=>item.kind==="money"&&item.direction===requestedDirection&&item.amount===amount&&
   !unsafeMoneyRequestReason(item,text));
 const candidates=[...matched,...direct];
 if(!candidates.length)return supportedResponse("No independent explicit request for this exact amount and direction was recovered from the original text.");
 // A mixed interpretation (or another conflicting amount) is never promoted.
 const competing=base.obligations.filter(item=>item.kind==="money"&&item.status==="open"&&
   item.direction===requestedDirection&&item.amount!==amount);
 if(competing.length)return supportedResponse("Several unresolved amounts exist in the same source. Payment requires independent clarification.");
 const best=matched[0]||direct[0];
 const sourceEvidence=String(best.evidence||"").trim();
 if(!normalized(text).includes(normalized(sourceEvidence)))
   return supportedResponse("Rechecked request could not be traced back to the original conversation.");
 const sourceKey=createHash("sha256").update([text,perspective,evidence,requestedDirection,String(amount)].join("\x00")).digest("hex");
 return {supported:true,basis:"source_text_only",receiptVerified:false,
   sourceKey,sourceEvidence,amount,direction:requestedDirection,
   reason:"An explicit request for this amount and direction was found again in the original text. This does not verify the recipient's identity, whether the debt remains owed outside the conversation, or any blockchain transfer."};
}
