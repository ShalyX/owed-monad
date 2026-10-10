import { CHAIN, isAddress, transferData, receiptMatches } from "./payments.js";

// Used by both fresh submissions and recovery from browser reloads.
// Hash uniqueness is local to the browser inbox, not an assertion about external debts.
export const validHash = (hash) => /^0x[0-9a-f]{64}$/i.test(String(hash || ""));
export function transferClaimed(groups, hash, exceptId = "") {
  if (!validHash(hash) || !Array.isArray(groups)) return false;
  return groups.some(group => (group.obligations || []).some(item =>
    item?.id !== exceptId && item?.kind === "money" &&
    item?.txHash?.toLowerCase() === hash.toLowerCase() &&
    ["submitting","pending","review","settled"].includes(item.status)));
}
export function beginWalletSubmission(item, payer, recipient, now = new Date()) {
  if (!item || !["open","failed"].includes(item.status) || !isAddress(payer) || !isAddress(recipient)) return false;
  item.status = "submitting";
  item.payer = payer;
  item.recipientAddress = recipient;
  item.startedAt = now.toISOString();
  item.txHash = "";
  return true;
}
export function walletBroadcast(item, hash, now = new Date()) {
  if (!item || item.status !== "submitting" || !validHash(hash)) return false;
  item.status = "pending";
  item.txHash = hash;
  item.submittedAt = now.toISOString();
  return true;
}
export function undoRejectedSubmission(item) {
  if (!item || item.status !== "submitting" || item.txHash) return false;
  item.status = "open";
  delete item.startedAt;
  return true;
}
export function attachRecoveryHash(item, hash, groups, now = new Date()) {
  if (!item || !["submitting","pending","review"].includes(item.status) ||
      !isAddress(item.payer) || !isAddress(item.recipientAddress) ||
      !validHash(hash) || transferClaimed(groups,hash,item.id)) return false;
  item.status = "pending";
  item.txHash = hash;
  item.submittedAt ||= now.toISOString();
  return true;
}
// Always use a fresh server-side RPC response. A saved hash or a wallet-provided
// success flag does not prove payment. No UI may silently settle from local storage.
export function classifyChainReceipt(data, item) {
  if (!validHash(item?.txHash) || !isAddress(item?.payer) ||
      !isAddress(item?.recipientAddress)) return "mismatch";
  if (data?.chainId !== "0x279f") return "mismatch";
  const receipt = data.receipt;
  if (receipt === null) return "pending";
  if (!receipt || String(receipt.transactionHash||"").toLowerCase() !== item.txHash.toLowerCase()) return "mismatch";
  const tx = data.transaction;
  if (!tx || String(tx.hash||"").toLowerCase() !== item.txHash.toLowerCase() ||
      String(tx.from||"").toLowerCase() !== item.payer.toLowerCase() ||
      String(tx.to||"").toLowerCase() !== CHAIN.usdc.toLowerCase() ||
      String(tx.input || tx.data || "").toLowerCase() !== transferData(item.recipientAddress,item.amount).toLowerCase())
    return "mismatch";
  if (receipt.status === "0x0") return "failed";
  return receiptMatches(receipt,item.payer,item.recipientAddress,item.amount) ? "settled" : "mismatch";
}
