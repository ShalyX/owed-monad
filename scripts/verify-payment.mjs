import { CHAIN, isAddress, transferData, receiptMatches } from "../public/payments.js";
const [hash, from, to, amount] = process.argv.slice(2);
if (!/^0x[0-9a-fA-F]{64}$/.test(hash || "") || !isAddress(from) || !isAddress(to) || !amount) {
  console.error("Usage: npm run verify:payment -- 0xTXHASH 0xPAYER 0xRECIPIENT 0.01");
  process.exit(2);
}
let seq = 1;
async function rpc(method, params) {
  const r = await fetch(process.env.MONAD_TESTNET_RPC || CHAIN.rpc, {
    method: "POST", headers: { "content-type":"application/json" },
    body: JSON.stringify({jsonrpc:"2.0", id:seq++, method, params}),
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) throw new Error("RPC HTTP "+r.status);
  const d = await r.json();
  if (d.error) throw new Error(method +" "+ d.error.code);
  return d.result;
}
try {
  if (BigInt(await rpc("eth_chainId", [])) !== 10143n) throw new Error("Not Monad Testnet");
  const [tx,receipt] = await Promise.all([
    rpc("eth_getTransactionByHash", [hash]),
    rpc("eth_getTransactionReceipt", [hash])
  ]);
  if (!receipt) throw new Error("Pending: no receipt yet");
  if (!tx) throw new Error("No transaction body found");
  if (String(tx.from).toLowerCase() !== from.toLowerCase() ||
      String(tx.to).toLowerCase() !== CHAIN.usdc.toLowerCase() ||
      String(tx.input || tx.data).toLowerCase() !== transferData(to,amount).toLowerCase() ||
      !receiptMatches(receipt,from,to,amount)) {
    throw new Error("Receipt or transaction does NOT match requested USDC transfer");
  }
  console.log("VERIFIED: actual Circle USDC Transfer on Monad Testnet");
  console.log("TX " + CHAIN.explorer + "/tx/" + hash);
  console.log("Block " + Number(BigInt(receipt.blockNumber)));
  console.log("Amount " + amount + " USDC");
} catch(e) {console.error("UNVERIFIED: " + e.message);process.exitCode=1}
