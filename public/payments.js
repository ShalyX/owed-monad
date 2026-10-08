export const CHAIN = Object.freeze({
  id: "0x279f", name: "Monad Testnet", symbol: "MON",
  rpc: "https://testnet-rpc.monad.xyz",
  explorer: "https://testnet.monadvision.com",
  usdc: "0x534b2f3A21130d7a60830c2Df862319e593943A3"
});
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export function isAddress(s) { return /^0x[a-fA-F0-9]{40}$/.test(String(s || "")); }
export function microUsdc(amount) {
  const value = String(amount);
  if (!/^(?:0|[1-9]\d{0,4})(?:\.\d{1,6})?$/.test(value)) throw new Error("USDC amount must be positive with up to 6 decimals.");
  const [whole, fraction = ""] = value.split(".");
  const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
  if (units <= 0n || units > 10000000000n) throw new Error("Amount outside the supported safety limit.");
  return units;
}
export function transferData(address, amount) {
  if (!isAddress(address)) throw new Error("Invalid recipient wallet address.");
  return "0xa9059cbb" + address.slice(2).toLowerCase().padStart(64, "0") + microUsdc(amount).toString(16).padStart(64, "0");
}
export function receiptMatches(receipt, from, recipient, amount) {
  if (!receipt || receipt.status !== "0x1" || !isAddress(from) || !isAddress(recipient)) return false;
  if (String(receipt.from || "").toLowerCase() !== from.toLowerCase()) return false;
  if (String(receipt.to || "").toLowerCase() !== CHAIN.usdc.toLowerCase()) return false;
  const units = microUsdc(amount);
  return Array.isArray(receipt.logs) && receipt.logs.some((log) => {
    if (String(log.address || "").toLowerCase() !== CHAIN.usdc.toLowerCase()) return false;
    if (!Array.isArray(log.topics) || log.topics.length < 3 || String(log.topics[0]).toLowerCase() !== TRANSFER) return false;
    try {
      const sentFrom = "0x" + String(log.topics[1]).slice(-40);
      const sentTo = "0x" + String(log.topics[2]).slice(-40);
      return sentFrom.toLowerCase() === from.toLowerCase() &&
        sentTo.toLowerCase() === recipient.toLowerCase() &&
        BigInt(log.data) === units;
    } catch { return false; }
  });
}
export async function switchToMonad(provider) {
  const id = await provider.request({ method: "eth_chainId" });
  if (String(id).toLowerCase() === CHAIN.id) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN.id }] });
  } catch (error) {
    if (error.code !== 4902) throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [{
      chainId: CHAIN.id, chainName: CHAIN.name,
      rpcUrls: [CHAIN.rpc], nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
      blockExplorerUrls: [CHAIN.explorer]
    }] });
  }
  const after = await provider.request({ method: "eth_chainId" });
  if (String(after).toLowerCase() !== CHAIN.id) throw new Error("Wallet is not on Monad Testnet.");
}
export async function readReceipt(provider, hash) {
  return provider.request({ method: "eth_getTransactionReceipt", params: [hash] });
}