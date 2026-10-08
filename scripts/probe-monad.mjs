import { CHAIN } from "../public/payments.js";
const RPC = process.env.MONAD_TESTNET_RPC || CHAIN.rpc;
let seq = 1;
async function rpc(method, params = []) {
  const r = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: seq++, method, params }),
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) throw new Error("RPC HTTP " + r.status);
  const data = await r.json();
  if (data.error) throw new Error("RPC "+ method + " error "+ data.error.code);
  return data.result;
}
try {
  const chain = await rpc("eth_chainId");
  if (BigInt(chain) !== 10143n) throw new Error("Wrong chain: " + chain);
  const code = await rpc("eth_getCode", [CHAIN.usdc, "latest"]);
  if (!code || code === "0x") throw new Error("Official USDC contract has no bytecode!");
  const decimalsRaw = await rpc("eth_call", [{ to: CHAIN.usdc, data: "0x313ce567" }, "latest"]);
  const decimals = Number(BigInt(decimalsRaw));
  if (decimals !== 6) throw new Error("USDC decimals mismatch: " + decimals);
  const block = await rpc("eth_blockNumber");
  console.log("PASS: Monad Testnet chain ID 10143 confirmed");
  console.log("PASS: Circle USDC contract bytecode present, decimals = 6");
  console.log("USDC contract: " + CHAIN.usdc);
  console.log("Current block: " + Number(BigInt(block)));
  console.log("Explorer: " + CHAIN.explorer);
} catch (e) {
  console.error("FAIL: " + e.message); process.exitCode = 1;
}