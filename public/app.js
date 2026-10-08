import { CHAIN, isAddress, microUsdc, transferData, receiptMatches, switchToMonad, readReceipt, getWalletBalances } from "./payments.js";

const $ = (id) => document.getElementById(id);
const KEY = "owed-v1-inbox";
const state = { groups: load(), filter: "all", file: null, recorded: null, recorder: null, chunks: [], timer: null, startedAt: 0, processing: false, paymentId: null, wallet: "" };
const SAMPLE_TEXT = "Hey, you still owe me $12 for the cab and $6 for lunch. Also, can you send me that venue address? I'll send you the photos tomorrow.";
function load() {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(x) ? x : [];
  } catch { return []; }
}
function save() { localStorage.setItem(KEY, JSON.stringify(state.groups)); }
function escapeHTML(x) {
  return String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function allItems() { return state.groups.flatMap((g) => (g.obligations || []).map((x) => ({ ...x, group: g }))); }
function itemById(id) {
  for (const g of state.groups) for (const item of g.obligations || []) if (item.id === id) return item;
  return null;
}
function money(x) { return "$" + Number(x || 0).toFixed(2); }
function showNotice(message, error = false, target = $("notice")) {
  target.textContent = message;
  target.className = "notice" + (error ? " error" : "");
  target.classList.remove("hidden");
}
function hideNotice(target = $("notice")) { target.textContent = ""; target.classList.add("hidden"); }
function setProcessing(v, message = "") {
  state.processing = v;
  $("analyzeText").disabled = v;
  $("analyzeFile").disabled = v;
  $("analyzeRecording").disabled = v;
  if (message) showNotice(message);
}
function addGroup(group) {
  if (!Array.isArray(group.obligations)) throw new Error("Invalid obligation data.");
  if (state.groups.some((g) => g.fingerprint === group.fingerprint)) {
    showNotice("This conversation is already in your inbox. No duplicates added.");
    return;
  }
  state.groups.unshift(group);
  save();
  render();
  showNotice(group.obligations.length
    ? "Added " + group.obligations.length + " obligation(s). Review before taking any action."
    : "Analyzed. No explicit obligations found in this conversation.");
}
async function analyzeText() {
  const text = $("conversation").value.trim();
  if (text.length < 8) return showNotice("Paste a conversation first (at least 8 characters).", true);
  setProcessing(true, "Reading the conversation and extracting explicit obligations…");
  try {
    const response = await fetch("/api/analyze-text", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Analysis failed.");
    addGroup(result);
  } catch (e) { showNotice(e.message, true); }
  finally { setProcessing(false); }
}
async function analyzeAudio(file, context = "incoming") {
  if (!file) return showNotice("Choose or record an audio note first.", true);
  if (file.size > 18 * 1024 * 1024) return showNotice("Keep the voice note under 18 MB.", true);
  setProcessing(true, "Transcribing and extracting explicit obligations…");
  try {
    const form = new FormData();
    form.append("audio", file, file.name || "recording.webm");
    form.set("context", context);
    const response = await fetch("/api/analyze-audio", { method: "POST", body: form });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Audio analysis failed.");
    addGroup(result);
  } catch (e) { showNotice(e.message, true); }
  finally { setProcessing(false); }
}
function category(x) {
  if (x.kind === "money" && x.direction === "i_owe") return "You owe";
  if (x.kind === "money" && x.direction === "owed_to_me") return "Owed to you";
  if (x.kind === "money") return "Uncertain amount";
  return "To-do";
}
function itemMarkup(x) {
  const done = x.status === "settled" || x.status === "done";
  const payout = x.kind === "money" && x.direction === "i_owe" && x.amount !== null;
  const sample = !!x.group.isSample;
  let controls = "";
  if (x.status === "pending") {
    controls = '<button class="small-btn" data-action="check" data-id="' + escapeHTML(x.id) + '">Check transaction ↗</button>';
  } else if (x.status === "settled" && x.txHash) {
    controls = '<a class="tx-link" href="' + CHAIN.explorer + '/tx/' + encodeURIComponent(x.txHash) + '" target="_blank" rel="noopener noreferrer">View verified receipt ↗</a>';
  } else if (done) {
    controls = '<span class="status-text done">✓ Completed</span>';
  } else if (payout) {
    controls = sample
      ? '<span class="sample-tag">Example · not payable</span>'
      : '<button class="small-btn solid" data-action="pay" data-id="' + escapeHTML(x.id) + '">Pay in USDC ↗</button>';
  } else if (x.kind === "task") {
    controls = '<button class="small-btn" data-action="complete" data-id="' + escapeHTML(x.id) + '">Mark complete ✓</button>';
  } else {
    controls = '<button class="small-btn" data-action="complete" data-id="' + escapeHTML(x.id) + '">Resolve manually ✓</button>';
  }
  const price = x.kind === "money" && x.amount !== null ? '<strong class="item-price">' + money(x.amount) + '</strong>' : "";
  const status = x.status === "pending" ? '<span class="status-text pending">Pending chain receipt</span>'
    : x.status === "failed" ? '<span class="status-text warning">Previous transaction failed</span>'
    : x.status === "done" ? '<span class="status-text done">Manually completed</span>' : "";
  return '<article class="obligation"><div class="obligation-head"><div><div class="item-category"><span class="mini-tag">' +
    escapeHTML(category(x)) + '</span>' + (sample ? '<span class="sample-tag">SAMPLE</span>' : "") +
    '</div><div class="item-title">' + escapeHTML(x.title) + '</div></div>' + price + '</div><p class="item-evidence">“' +
    escapeHTML(x.evidence) + '”</p><div class="item-actions"><span class="item-source">' +
    escapeHTML(x.group.title) + ' · ' + escapeHTML(x.group.source === "audio" ? "voice note" : "text") +
    '</span>' + controls + '</div>' + (status ? '<div class="status-row">' + status + '</div>' : '') + '</article>';
}
function render() {
  const all = allItems();
  const active = all.filter((x) => !["settled", "done"].includes(x.status));
  const openMoney = active.filter((x) => x.kind === "money" && x.direction === "i_owe" && x.amount != null && !x.group.isSample);
  $("openCount").textContent = String(active.length).padStart(2, "0");
  $("moneyCount").textContent = money(openMoney.reduce((s, x) => s + x.amount, 0));
  $("doneCount").textContent = String(all.length - active.length).padStart(2, "0");
  const shown = all.filter((x) => state.filter === "all" || x.kind === state.filter);
  const inbox = $("inbox");
  inbox.innerHTML = shown.length ? shown.map(itemMarkup).join("") :
    '<div class="empty"><div class="empty-mark">↗</div><h3>' + (all.length ? 'Nothing in this filter' : 'Nothing left hanging. Yet.') +
    '</h3><p>' + (all.length ? 'Try another filter or add a conversation.' : 'Paste a message, record a reminder or import a voice note to start finding the loose ends.') +
    '</p></div>';
  document.querySelectorAll(".filter").forEach((b) => b.classList.toggle("active", b.dataset.filter === state.filter));
}
function setMode(mode) {
  document.querySelectorAll(".tab").forEach((b) => {
    const active = b.dataset.mode === mode;
    b.classList.toggle("active", active); b.setAttribute("aria-selected", String(active));
  });
  ["paste", "record", "import"].forEach((x) => $(x + "Panel").classList.toggle("hidden", x !== mode));
  hideNotice();
}
function sample() {
  const group = {
    id: crypto.randomUUID(), title: "A friend · Dinner & plans", source: "text", transcript: SAMPLE_TEXT,
    summary: "A friend is asking for two reimbursements and a venue address.",
    fingerprint: "sample-owed-v1", isSample: true, createdAt: new Date().toISOString(),
    obligations: [
      { id: crypto.randomUUID(), title: "Pay back the cab", kind: "money", direction: "i_owe", amount: 12, evidence: "you still owe me $12 for the cab", status: "open" },
      { id: crypto.randomUUID(), title: "Pay back lunch", kind: "money", direction: "i_owe", amount: 6, evidence: "$6 for lunch", status: "open" },
      { id: crypto.randomUUID(), title: "Send the venue address", kind: "task", direction: "i_owe", amount: null, evidence: "can you send me that venue address?", status: "open" }
    ]
  };
  addGroup(group);
  showNotice("Example added for exploration only. No AI analysis or payment is being claimed.");
}
async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return showNotice("Microphone recording is unavailable in this browser.", true);
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
  state.chunks = [];
  state.recorder = new MediaRecorder(stream, type ? { mimeType: type } : {});
  state.recorder.ondataavailable = (e) => { if (e.data.size) state.chunks.push(e.data); };
  state.recorder.onstop = () => {
    const blob = new Blob(state.chunks, { type: state.recorder.mimeType || "audio/webm" });
    const ext = blob.type.includes("mp4") ? "m4a" : "webm";
    state.recorded = new File([blob], "owed-recording." + ext, { type: blob.type });
    $("recordPlayback").src = URL.createObjectURL(blob);
    $("recordPlayback").classList.remove("hidden");
    $("analyzeRecording").classList.remove("hidden");
    stream.getTracks().forEach((t) => t.stop());
  };
  state.recorder.start();
  state.startedAt = Date.now();
  $("recordBtn").textContent = "■ Stop recording";
  $("recordDot").classList.add("recording");
  $("recordStatus").textContent = "Recording";
  state.timer = setInterval(() => {
    const s = Math.floor((Date.now() - state.startedAt) / 1000);
    $("recordTime").textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }, 500);
}
function stopRecording() {
  if (state.recorder?.state === "recording") state.recorder.stop();
  clearInterval(state.timer);
  $("recordBtn").textContent = "● Record another note";
  $("recordDot").classList.remove("recording");
  $("recordStatus").textContent = "Recording ready to analyze";
}
function payDialog(id) {
  const x = itemById(id);
  if (!x || x.kind !== "money" || x.direction !== "i_owe" || x.amount === null || x.status === "pending" || x.status === "settled") return;
  if (state.groups.find((g) => g.obligations?.some((o) => o.id === id))?.isSample) return showNotice("Sample obligations cannot be paid. Analyze your own conversation first.", true);
  state.paymentId = id;
  $("dialogTitle").textContent = x.title;
  $("dialogEvidence").textContent = 'From conversation: “' + x.evidence + '”';
  $("dialogAmount").textContent = money(x.amount);
  $("recipientAddress").value = x.recipientAddress || "";
  $("recipientVerified").checked = false;
  hideNotice($("paymentNotice"));
  $("payDialog").showModal();
}
async function connectWallet() {
  if (!window.ethereum?.request) throw new Error("Install an EVM wallet (such as MetaMask or Rabby) to pay.");
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || !isAddress(accounts[0])) throw new Error("No wallet account selected.");
  state.wallet = accounts[0];
  $("walletBtn").innerHTML = escapeHTML(state.wallet.slice(0, 6) + "…" + state.wallet.slice(-4)) + " <span>↗</span>";
  return state.wallet;
}
async function checkReceiptFor(x, loud = true) {
  if (!window.ethereum?.request) {
    if (loud) showNotice("Connect the wallet used for the transaction to check its receipt.", true);
    return false;
  }
  if (!x.txHash || !isAddress(x.payer) || !isAddress(x.recipientAddress)) return false;
  try {
    const receipt = await readReceipt(window.ethereum, x.txHash);
    if (!receipt) {
      if (loud) showNotice("Transaction still pending on Monad Testnet. You can check again.", false);
      return false;
    }
    if (receiptMatches(receipt, x.payer, x.recipientAddress, x.amount)) {
      x.status = "settled"; x.settledAt = new Date().toISOString(); save(); render();
      if (loud) showNotice("Payment settled. Exact USDC Transfer event verified against the onchain receipt.");
      return true;
    }
    if (receipt.status === "0x0") {
      x.status = "failed"; x.txHash = ""; save(); render();
      if (loud) showNotice("Transaction failed onchain. Nothing was marked as settled.", true);
      return false;
    }
    if (loud) showNotice("Receipt did not match the expected token, sender, recipient or amount. Payment remains unverified.", true);
    return false;
  } catch (err) { if (loud) showNotice(err.message, true); return false; }
}
async function confirmPayment() {
  const x = itemById(state.paymentId);
  const note = $("paymentNotice");
  if (!x || x.status === "pending" || x.status === "settled") return;
  const recipient = $("recipientAddress").value.trim();
  if (!isAddress(recipient)) return showNotice("Enter a valid 0x recipient address.", true, note);
  if (!$("recipientVerified").checked) return showNotice("You must independently verify the recipient address before sending.", true, note);
  if (state.processing) return;
  let units;
  try { units = microUsdc(x.amount); } catch (e) { return showNotice(e.message, true, note); }
  const approved = window.confirm("Confirm payment on Monad TESTNET\n\n" + money(x.amount) + " USDC\nTo: " + recipient + "\n\nHave you verified this is the intended recipient?");
  if (!approved) return;
  $("confirmPayment").disabled = true;
  showNotice("Awaiting wallet authorization. No payment has been sent yet.", false, note);
  try {
    const from = await connectWallet();
    if (from.toLowerCase() === recipient.toLowerCase()) throw new Error("Self-payments are disabled.");
    await switchToMonad(window.ethereum);
    const balances = await getWalletBalances(window.ethereum, from);
    if (balances.usdc < units) throw new Error("Insufficient testnet USDC. Use Circle's Monad Testnet faucet linked below.");
    if (balances.mon <= 0n) throw new Error("No testnet MON for gas. Use the Monad faucet linked below.");
    const txHash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [{ from, to: CHAIN.usdc, value: "0x0", data: transferData(recipient, x.amount) }]
    });
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) throw new Error("Wallet returned no valid transaction hash.");
    x.status = "pending"; x.txHash = txHash; x.recipientAddress = recipient; x.payer = from;
    x.submittedAt = new Date().toISOString(); save(); render();
    $("payDialog").close();
    showNotice("Transaction submitted. Waiting for a verified USDC receipt…");
    for (let i = 0; i < 25 && x.status === "pending"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2200));
      if (await checkReceiptFor(x, false)) {
        showNotice("Verified payment confirmed on Monad Testnet. View the onchain receipt in your inbox.");
        break;
      }
    }
    if (x.status === "pending") showNotice("Still awaiting a matching receipt. You can check again from the inbox.");
  } catch (e) { showNotice(e.message || "Payment request failed.", true, note); }
  finally { $("confirmPayment").disabled = false; }
}
function wireEvents() {
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  $("conversation").addEventListener("input", () => { $("charCount").textContent = $("conversation").value.length.toLocaleString() + " / 12,000"; });
  $("analyzeText").addEventListener("click", analyzeText);
  $("audioFile").addEventListener("change", (event) => {
    state.file = event.target.files?.[0] || null;
    $("fileLabel").textContent = state.file ? state.file.name : "MP3 · M4A · WAV · WEBM · up to 18 MB";
  });
  $("analyzeFile").addEventListener("click", () => analyzeAudio(state.file));
  $("analyzeRecording").addEventListener("click", () => analyzeAudio(state.recorded, "recording"));
  $("recordBtn").addEventListener("click", async () => {
    try {
      if (state.recorder?.state === "recording") stopRecording();
      else await startRecording();
    } catch (e) { showNotice("Microphone error: " + e.message, true); }
  });
  $("demoBtn").addEventListener("click", sample);
  $("walletBtn").addEventListener("click", () => connectWallet().catch((e) => showNotice(e.message, true)));
  $("clearCompleted").addEventListener("click", () => {
    if (!window.confirm("Remove completed obligations from this browser's inbox?")) return;
    state.groups = state.groups.map((g) => ({ ...g, obligations: g.obligations.filter((x) => !["done", "settled"].includes(x.status)) })).filter((g) => g.obligations.length);
    save(); render();
  });
  document.querySelectorAll(".filter").forEach((b) => b.addEventListener("click", () => { state.filter = b.dataset.filter; render(); }));
  $("inbox").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const item = itemById(btn.dataset.id);
    if (!item) return;
    if (btn.dataset.action === "pay") return payDialog(item.id);
    if (btn.dataset.action === "check") return checkReceiptFor(item);
    if (btn.dataset.action === "complete" && item.kind !== "money" || btn.dataset.action === "complete" && item.direction !== "i_owe") {
      item.status = "done"; save(); render(); return;
    }
  });
  $("confirmPayment").addEventListener("click", confirmPayment);
  $("payDialog").addEventListener("close", () => { state.paymentId = null; $("recipientVerified").checked = false; });
  if (window.ethereum?.on) {
    window.ethereum.on("accountsChanged", () => { state.wallet = ""; $("walletBtn").textContent = "Connect wallet ↗"; });
    window.ethereum.on("chainChanged", () => { state.wallet = ""; $("walletBtn").textContent = "Connect wallet ↗"; });
  }
}
wireEvents();
render();
for (const x of allItems().filter((a) => a.status === "pending")) checkReceiptFor(x, false);
