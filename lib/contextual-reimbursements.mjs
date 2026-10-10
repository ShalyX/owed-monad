import { sourceStatements } from "../public/source-statements.js";

// A source-grounded bridge for "Your part was $8. Just send it." No money
// is inferred from a price, a standalone share, or a non-payment request.
// This deliberately handles only adjacent, unambiguous reimbursement language.
const sharePhrase = /\byour\s+(?:part|share|portion)\s+(?:was|is|comes\s+to)\s+/i;
const numeric = /^(?:\$\s*(\d{1,5}(?:\.\d{1,6})?)(?!\d|\.\d)|(\d{1,5}(?:\.\d{1,6})?)\s*(?:USD|USDC|dollars?)\b)/i;
const amountAnywhere = /(?:\$\s*\d+(?:\.\d+)?|\b\d+(?:\.\d+)?\s*(?:USD|USDC|dollars?)\b)/gi;
const paymentRequest = /^(?:(?:hey|bro|yo|also)[,\s]+)?(?:(?:please|just)\s+|(?:can|could|would)\s+you\s+(?:please\s+)?|you\s+can\s+(?:just\s+)?)?(?:send|pay|transfer)\s+(?:it|your\s+(?:part|share)|(?:me\s+)?(?:the\s+)?(?:money|amount|balance|rest))\b/i;
const conditional = /\b(?:if|unless|once|after|when|only\s+if|provided\s+that|suppose|imagine|hypothetically|for\s+example)\b/i;
const relayed = /\b(?:said|told|quoted|forwarded|someone\s+asked|heard\s+that)\b/i;
const uncertain = /\b(?:about|around|approximately|roughly|maybe|probably|estimated?|perhaps)\b/i;
const cancelled = /\b(?:never\s*mind|nevermind|forget\s+(?:it|that)|my\s+treat|no\s+need\s+to\s+(?:send|pay)|(?:don't|do\s+not|shouldn't)\s+(?:send|pay)|(?:you|they|he|she)\s+(?:already\s+)?(?:paid|sent|settled)|(?:you|they|he|she)\s+(?:have|has)\s+(?:already\s+)?(?:paid|sent|settled))\b/i;

export function contextualReimbursements(source, perspective = "incoming") {
  const text = String(source || "").trim().slice(0, 12000);
  const sentences = sourceStatements(text);
  const result = [];
  for (let i = 0; i < sentences.length; i++) {
    const segment = sentences[i];
    const sentence = segment.text.trim();
    const share = sharePhrase.exec(sentence);
    if (!share || conditional.test(sentence) || relayed.test(sentence) || cancelled.test(sentence)) continue;
    const before = sentence.slice(0, share.index);
    if (uncertain.test(before)) continue;
    const amountStart = share.index + share[0].length;
    const match = numeric.exec(sentence.slice(amountStart));
    if (!match) continue;
    const amount = Number(match[1] || match[2]);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000 || !Number.isInteger(amount * 1e6)) continue;
    // Reject amount choices / combined charges. There must be exactly one
    // exact monetary value in the same statement as "your part".
    if ([...sentence.matchAll(amountAnywhere)].length !== 1 || /\b(?:or|instead|rather)\s+(?:\$|\d)/i.test(sentence)) continue;
    const tail = sentence.slice(amountStart + match[0].length).trim();
    const inlineRequest = /^[,;]\s*(.+)$/.exec(tail);
    let end = segment.end;
    let request = inlineRequest?.[1] || "";
    if (!request && i + 1 < sentences.length) {
      request = sentences[i + 1].text.trim();
      end = sentences[i + 1].end;
    }
    if (!paymentRequest.test(request) || conditional.test(request) || cancelled.test(request)) continue;
    // The next sentence can withdraw the request or report that it was paid.
    const nextIndex = inlineRequest ? i + 1 : i + 2;
    const follow = sentences.slice(nextIndex, nextIndex + 2).map(s => s.text).join(" ");
    if (cancelled.test(follow) || relayed.test(before)) continue;
    const evidence = text.slice(segment.start, end).trim();
    if (!text.includes(evidence) || evidence.length > 260) continue;
    const direction = perspective === "recording" ? "owed_to_me" : "i_owe";
    result.push({
      kind: "money", direction, amount,
      title: direction === "i_owe" ? "Repay your share · $" + amount : "Receive your share · $" + amount,
      evidence, recipientName: "", currency: "USD",
      contextNote: "The source states your share and separately asks for payment. Confirm the details before sending."
    });
    if (result.length >= 6) break;
  }
  return result;
}
