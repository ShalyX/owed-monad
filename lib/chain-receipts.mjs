// Server-side, read-only Monad Testnet RPC adapter.
// Values are verified again against the specific payment client-side.
const MONAD_RPC = "https://testnet-rpc.monad.xyz";
const RECEIPT_HASH = /^0x[0-9a-fA-F]{64}$/;
export const isReceiptHash = (hash) => RECEIPT_HASH.test(String(hash || ""));

export async function rpcCall(method, params, fetchImpl = fetch, endpoint = MONAD_RPC) {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error("Monad RPC unavailable (" + response.status + ").");
  const data = await response.json();
  if (!data || data.error || !Object.hasOwn(data, "result")) {
    throw new Error("Monad RPC could not provide verification details.");
  }
  return data.result;
}

export async function getChainReceipt(txHash, fetchImpl = fetch, endpoint = MONAD_RPC) {
  if (!isReceiptHash(txHash)) {
    throw Object.assign(new Error("Invalid transaction hash."), { status: 400 });
  }
  const call = (method, params) => rpcCall(method, params, fetchImpl, endpoint);
  const chainId = await call("eth_chainId", []);
  if (typeof chainId !== "string" || Number.parseInt(chainId, 16) !== 10143) {
    throw new Error("RPC chain mismatch. Monad Testnet verification unavailable.");
  }
  const [receipt, transaction] = await Promise.all([
    call("eth_getTransactionReceipt", [txHash]),
    call("eth_getTransactionByHash", [txHash])
  ]);
  if (receipt === null) return { chainId, receipt: null, transaction: null, blockTimestamp: null };
  if (!receipt || String(receipt.transactionHash || "").toLowerCase() !== txHash.toLowerCase()) {
    throw new Error("RPC returned a mismatched transaction receipt.");
  }
  if (!transaction || String(transaction.hash || "").toLowerCase() !== txHash.toLowerCase() ||
      String(transaction.blockHash || "").toLowerCase() !== String(receipt.blockHash || "").toLowerCase()) {
    throw new Error("RPC returned a missing or mismatched transaction body.");
  }
  let blockTimestamp = null;
  if (typeof receipt.blockNumber === "string") {
    try {
      const block = await call("eth_getBlockByNumber", [receipt.blockNumber, false]);
      if (block?.hash?.toLowerCase() === String(receipt.blockHash || "").toLowerCase() &&
          typeof block.timestamp === "string" && /^0x[0-9a-f]+$/i.test(block.timestamp)) {
        blockTimestamp = block.timestamp;
      }
    } catch {
      // Optional timestamp may fail independently; never invent one.
    }
  }
  return { chainId, receipt, transaction, blockTimestamp };
}
