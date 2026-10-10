// Headless-browser check for wallet connection UX. Wallet is mocked; NEVER signs or sends.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const base = process.env.OWED_TEST_URL || "http://127.0.0.1:3033/";
const chrome = process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const dir = await mkdtemp(join(tmpdir(), "owed-wallet-ux-"));
const port = 19942;
const child = spawn(chrome, [
  "--headless=new", "--no-first-run", "--disable-extensions", "--disable-gpu",
  "--remote-allow-origins=*", "--window-size=1400,900",
  "--remote-debugging-port=" + port, "--user-data-dir=" + dir, "about:blank"
], { stdio: "ignore" });
let ws, server;
try {
  // Local app serves the same frontend without making inference or wallet calls.
  if (base.startsWith("http://127.0.0.1:3033/")) {
    server = spawn(process.execPath, ["server.mjs"], { env: { ...process.env, HOST: "127.0.0.1", PORT: "3033" }, stdio: "ignore" });
  }
  let page;
  for (let i = 0; i < 90; i++) {
    try {
      const tabs = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
      page = tabs.find((tab) => tab.type === "page");
      if (page) break;
    } catch {}
    await sleep(200);
  }
  if (!page) throw Error("Chrome debugging tab not ready");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.addEventListener("open", ok, { once: true }); ws.addEventListener("error", fail, { once: true }); });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(String(event.data));
    const p = pending.get(msg.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(msg.id);
    if (msg.error || msg.result?.exceptionDetails) p.reject(Error(JSON.stringify(msg.error || msg.result.exceptionDetails)));
    else p.resolve(msg.result?.result?.value ?? msg.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error(method + " timeout")); }, 15000);
    pending.set(n, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const js = (expression) => call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  await call("Page.enable");
  await call("Runtime.enable");
  const injected = `(() => {
    const account = "0x1111111111111111111111111111111111111111";
    window.__walletTest = { sent: 0, account, chain: "0x279f", listeners: {} };
    window.ethereum = {
      isMetaMask: true,
      on(name, cb) { window.__walletTest.listeners[name] = cb; },
      async request({method}) {
        if (method === "eth_accounts" || method === "eth_requestAccounts") return [account];
        if (method === "eth_chainId") return window.__walletTest.chain;
        if (method === "eth_getBalance") return "0xde0b6b3a7640000";
        if (method === "eth_call") return "0xf4240";
        if (method === "eth_sendTransaction") { window.__walletTest.sent++; throw Error("Browser test cannot sign"); }
        throw Error("Unexpected method " + method);
      }
    };
  })();`;
  await call("Page.addScriptToEvaluateOnNewDocument", { source: injected });
  let ready = false;
  for (let i = 0; i < 55; i++) {
    try {
      await call("Page.navigate", { url: base });
      for (let n = 0; n < 8; n++) {
        const state = await js("({url:location.href, ready:!!document.querySelector('#walletStatus')})");
        if (state.ready && state.url.startsWith(base)) { ready = true; break; }
        await sleep(250);
      }
      if (ready) break;
    } catch {}
    await sleep(250);
  }
  if (!ready) throw Error("Local Owed page failed to load");
  const walletReady = async () => {
    for (let i = 0; i < 50; i++) {
      const state = await js("({visible:!document.querySelector('#walletStatus').classList.contains('hidden'),net:document.querySelector('#walletStatusNetwork').textContent,step:document.querySelector('#walletStatusNext').textContent,button:document.querySelector('#walletNextAction').textContent})");
      if (state.visible && state.net.includes("USDC")) return state;
      await sleep(100);
    }
    throw Error("Wallet summary did not become visible");
  };
  const first = await walletReady();
  if (!first.step.includes("No payable money requests") || !first.net.includes("1.00 USDC")) throw Error("Empty-inbox connected guidance failed: " + JSON.stringify(first));
  console.log("PASS_WALLET_CONNECTED_EMPTY_INBOX " + JSON.stringify(first));
  await js("document.querySelector('#walletNextAction').click()");
  const focus = await js("document.activeElement?.id");
  if (focus !== "conversation") throw Error("Add-conversation CTA did not focus input");
  const sample = {
    id: "wallet-smoke-group", fingerprint: "wallet-smoke-group", source: "text",
    title: "Coffee repayment", transcript: "You still owe me 0.01 USDC for coffee.",
    isSample: false,
    obligations: [{ id: "wallet-smoke-payment", kind: "money", direction: "i_owe",
      title: "Pay back coffee", amount: 0.01, evidence: "You still owe me 0.01 USDC for coffee.", status: "open" }]
  };
  await js("localStorage.setItem('owed-v1-inbox', JSON.stringify([" + JSON.stringify(sample) + "]))");
  await call("Page.reload", { ignoreCache: true });
  const second = await walletReady();
  if (!second.step.includes("Pay back coffee") || !second.button.includes("Review money request")) throw Error("Wallet next payment guidance failed: " + JSON.stringify(second));
  await js("document.querySelector('#walletNextAction').click()");
  const modal = await js("({open:document.querySelector('#payDialog').open,amount:document.querySelector('#dialogAmount').textContent,verified:document.querySelector('#recipientVerified').checked,recipient:document.querySelector('#recipientAddress').value,sent:window.__walletTest.sent})");
  if (!modal.open || !modal.amount.includes("0.01") || modal.verified || modal.recipient || modal.sent) throw Error("Unsafe payment review: " + JSON.stringify(modal));
  console.log("PASS_WALLET_CONNECTED_PAYMENT_REVIEW " + JSON.stringify(modal));
  await js("window.__walletTest.chain='0x1';window.__walletTest.listeners.chainChanged?.('0x1');true");
  await sleep(150);
  const wrong = await js("({net:document.querySelector('#walletStatusNetwork').textContent,sent:window.__walletTest.sent})");
  if (!wrong.net.includes("not on Monad") || wrong.sent) throw Error("Wrong network not surfaced safely: " + JSON.stringify(wrong));
  console.log("PASS_WRONG_CHAIN_WARNING " + JSON.stringify(wrong));
  await js("window.__walletTest.listeners.accountsChanged?.([]);true");
  const disconnected = await js("({hidden:document.querySelector('#walletStatus').classList.contains('hidden'),label:document.querySelector('#walletBtn').textContent,sent:window.__walletTest.sent})");
  if (!disconnected.hidden || !disconnected.label.includes("Connect wallet") || disconnected.sent) throw Error("Disconnect UI failed: " + JSON.stringify(disconnected));
  console.log("PASS_DISCONNECT_WITHOUT_PAYMENT " + JSON.stringify(disconnected));
} finally {
  if (ws?.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify({ id: 99999, method: "Browser.close" })); } catch {}
  }
  try { ws?.close(); } catch {}
  try { child.kill(); } catch {}
  try { server?.kill(); } catch {}
  await sleep(450);
  // Chrome on Windows sometimes holds its lockfile briefly after process shutdown.
  try { await rm(dir, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 }); }
  catch (error) { console.warn("Chrome profile cleanup deferred: " + error.code); }
}
