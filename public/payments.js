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
const NETWORK_SETUP = "Add Monad Testnet in your wallet's network settings: chain ID 10143, RPC https://testnet-rpc.monad.xyz, currency MON. Then switch to Monad Testnet and retry.";
function walletErrorFields(error) {
  return [error, error?.data, error?.data?.originalError, error?.cause].filter(Boolean);
}
function isUnrecognizedChain(error) {
  return walletErrorFields(error).some((entry) =>
    String(entry.code ?? "") === "4902" ||
    /unrecognized chain|unknown chain|chain .*not (?:added|configured|found)|network .*not (?:added|configured|found)/i.test(String(entry.message || "")));
}
function isWalletRejection(error) {
  return walletErrorFields(error).some((entry) =>
    String(entry.code ?? "") === "4001" ||
    /user (?:rejected|denied|cancelled|canceled)/i.test(String(entry.message || "")));
}
function chainIsMonad(id) {
  return typeof id === "string" && /^0x[0-9a-f]+$/i.test(id) && Number.parseInt(id, 16) === 10143;
}
async function requestMonadSwitch(provider) {
  return provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN.id }] });
}
export async function switchToMonad(provider) {
  if (chainIsMonad(await provider.request({ method: "eth_chainId" }))) return;
  try {
    await requestMonadSwitch(provider);
  } catch (error) {
    if (isWalletRejection(error)) throw new Error("Network switch cancelled in the wallet. No payment was sent.");
    if (!isUnrecognizedChain(error)) throw error;

    // EIP-1193 providers disagree on where the 4902 error code is nested.
    // Some also say "unrecognized chain" without providing a 4902 code.
    const params = [{
      chainId: CHAIN.id,
      chainName: CHAIN.name,
      rpcUrls: [CHAIN.rpc],
      nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
      blockExplorerUrls: [CHAIN.explorer]
    }];
    let added = false;
    try {
      await provider.request({ method: "wallet_addEthereumChain", params });
      added = true;
    } catch (addError) {
      if (isWalletRejection(addError)) throw new Error("Network addition cancelled in the wallet. No payment was sent.");
      if (!isUnrecognizedChain(addError)) {
        throw new Error("Wallet could not add Monad Testnet automatically. " + NETWORK_SETUP);
      }
      // Some wallet implementations reverse the suggestion ("switch first").
      // Retry the switch once; if still unsupported, show manual instructions.
    }
    if (!chainIsMonad(await provider.request({ method: "eth_chainId" }))) {
      try {
        await requestMonadSwitch(provider);
      } catch (retryError) {
        if (isWalletRejection(retryError)) throw new Error("Network switch cancelled in the wallet. No payment was sent.");
        throw new Error((added ? "Monad Testnet was added but your wallet could not switch to it. " : "Your wallet did not recognize the network. ") + NETWORK_SETUP);
      }
    }
  }
  if (!chainIsMonad(await provider.request({ method: "eth_chainId" }))) {
    throw new Error("Wallet is not on Monad Testnet. " + NETWORK_SETUP);
  }
}
export async function getWalletBalances(provider, address) {
  if (!isAddress(address)) throw new Error("Wallet address unavailable.");
  const tokenData = "0x70a08231" + address.slice(2).toLowerCase().padStart(64, "0");
  const [nativeHex, usdcHex] = await Promise.all([
    provider.request({ method: "eth_getBalance", params: [address, "latest"] }),
    provider.request({ method: "eth_call", params: [{ to: CHAIN.usdc, data: tokenData }, "latest"] })
  ]);
  return { mon: BigInt(nativeHex), usdc: BigInt(usdcHex) };
}
export async function readReceipt(provider, hash) {
  return provider.request({ method: "eth_getTransactionReceipt", params: [hash] });
}