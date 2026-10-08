// A money request is already an action. Do not create a second to-do card
// for the very same words unless those words explicitly request a different act.
// This module is deliberately pure: it is shared by server extraction and
// migration of open (not completed) browser-local items.
function normalizeQuote(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9$]+/g, " ").trim().replace(/\s+/g, " ");
}
function samePaymentEvidence(a, b) {
  const left = normalizeQuote(a), right = normalizeQuote(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const short = left.length < right.length ? left : right;
  const long = left.length < right.length ? right : left;
  // One model may quote the entire voice note while the payment candidate
  // quotes just the imperative sentence. Both must be source-aligned.
  return short.length >= 10 && long.includes(short);
}
function distinctNonPaymentRequest(evidence) {
  const text = String(evidence || "").toLowerCase();
  // Qualify *what* is to be sent, not just the verb send (which also pays).
  if (/\b(?:send|share|forward|email|text|message|give)\s+(?:(?:me|us|them|him|her)\s+)?(?:(?:the|a|an|your|my|that|this|our)\s+)?(?:[a-z-]+\s+){0,2}(?:link|address|location|directions|photo|picture|screenshot|document|file|details|receipt|invoice|contact|number|code|form|email|name|information)\b/i.test(text)) return true;
  // Genuine action requests must be separately articulated in the quote.
  if (/\b(?:please\s+)?(?:call\s+me|reply\s+to|bring\s+(?:me|the|your|that)|pick\s+me\s+up|remind\s+me|let\s+me\s+know|book\s+(?:the|a)|schedule\s+(?:the|a)|register\s+(?:me|for)|confirm\s+(?:the|your)|meet\s+me|upload\s+(?:the|your)|submit\s+(?:the|your)|follow\s+up\s+with)\b/i.test(text)) return true;
  return false;
}
export function removeShadowPaymentTasks(items, { onlyOpen = false } = {}) {
  if (!Array.isArray(items)) return [];
  const money = items.filter(x => x?.kind === "money" && typeof x.evidence === "string");
  if (!money.length) return items.slice();
  return items.filter(item => {
    if (!item || item.kind !== "task") return true;
    if (onlyOpen && item.status !== "open") return true;
    if (distinctNonPaymentRequest(item.evidence)) return true;
    return !money.some(payment => samePaymentEvidence(item.evidence, payment.evidence));
  });
}
