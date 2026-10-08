import { CHAIN, receiptMatches, isAddress } from "./payments.js";

export function makeReceiptProof(data, obligation) {
  if (!data || !obligation || typeof obligation.txHash !== "string") return null;
  const chainId = data.chainId;
  if (typeof chainId !== "string" || !/^0x[0-9a-f]+$/i.test(chainId) || Number.parseInt(chainId, 16) !== 10143) return null;
  if (!/^0x[a-fA-F0-9]{64}$/.test(obligation.txHash)) return null;
  if (!isAddress(obligation.payer) || !isAddress(obligation.recipientAddress)) return null;
  if (obligation.status !== "settled") return null;
  const receipt = data.receipt;
  if (!receipt || String(receipt.transactionHash || "").toLowerCase() !== obligation.txHash.toLowerCase()) return null;
  if (!receiptMatches(receipt, obligation.payer, obligation.recipientAddress, obligation.amount)) return null;
  return {
    txHash: obligation.txHash,
    from: obligation.payer,
    to: obligation.recipientAddress,
    amount: obligation.amount,
    token: CHAIN.usdc,
    block: typeof receipt.blockNumber === "string" && /^0x[0-9a-f]+$/i.test(receipt.blockNumber)
      ? BigInt(receipt.blockNumber).toString() : null,
    timestamp: typeof data.blockTimestamp === "string" && /^0x[0-9a-f]+$/i.test(data.blockTimestamp)
      ? Number(BigInt(data.blockTimestamp)) * 1000 : null
  };
}
