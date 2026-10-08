import { CHAIN, isAddress, microUsdc, transferData, receiptMatches, switchToMonad, readReceipt, getWalletBalances } from "./payments.js";
import { completeTask, reopenTask, dismissMoney, reopenDismissed, restoreLegacyMoney, clearFinishedTasks } from "./actions.js";
import { makeReceiptProof } from "./receipt.js";
import { avatarSvg, friendScene } from "./characters.js";
import { showSettlementMoment } from "./delight.js";
import { showDiscoveryMoment } from "./discovery.js";
import { showActionMoment } from "./moments.js";

const $ = (id) => document.getElementById(id);
const KEY = "owed-v1-inbox";
let restoredLegacyMoneyCount = 0;
const state = { groups: load(), filter: "all", file: null, recorded: null, recorder: null, chunks: [], timer: null, startedAt: 0, processing: false, paymentId: null, receiptId: null, receiptEpoch: 0, wallet: "" };
$("friendStage").innerHTML = friendScene();
$("analysisBuddy").innerHTML = avatarSvg("the-planner");
const SAMPLE_TEXT = "Hey, you still owe me $12 for the cab and $6 for lunch. Also, can you send me that venue address? I'll send you the photos tomorrow.";
function load() {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(x)) return [];
    restoredLegacyMoneyCount = restoreLegacyMoney(x);
    if (restoredLegacyMoneyCount) localStorage.setItem(KEY, JSON.stringify(x));
    return x;
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
  $("analysisStage").classList.toggle("hidden", !v);
  $("analysisTitle").textContent = v ? "Working through your moment…" : "Finding the loose ends…";
  $("analysisDetail").textContent = /Transcrib/i.test(message)
    ? "Processing your audio first, then looking for explicit commitments."
    : "Looking for clear requests in your message. Nothing is recorded until analysis completes.";
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
  if (!group.isSample) showDiscoveryMoment(group);
  showNotice(group.obligations.length
    ? "✦ Found " + group.obligations.length + (group.obligations.length === 1 ? " little thing" : " little things") + " worth remembering. Check the evidence before taking action."
    : "All clear! No explicit obligations in that conversation.");
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
function momentIcon(x) {
  const name = (x.title || "").toLowerCase();
  if (/coffee|latte|tea|cafe/.test(name)) return "☕";
  if (/lunch|dinner|food|pizza|restaurant/.test(name)) return "🍕";
  if (/ticket|concert|show|gig|event/.test(name)) return "🎟";
  if (/trip|travel|flight|cab|ride|uber/.test(name)) return "✈";
  if (/grocery|groceries|shopping|supplies/.test(name)) return "🛒";
  if (/link|address|message|reply|email/.test(name)) return "💌";
  return x.kind === "money" ? "💸" : "✦";
}
function statusFor(x) {
  if (x.status === "settled" && /^0x[a-f\d]{64}$/i.test(x.txHash || "")) return ["verified","✓ Verified onchain"];
  if (x.status === "settled") return ["review","Receipt needs review"];
  if (x.status === "pending") return ["pending","⏳ Verifying"];
  if (x.status === "dismissed") return ["dismissed","Dismissed · not paid"];
  if (x.status === "done" && x.kind === "task") return ["completed","✓ Task done"];
  if (x.status === "failed") return ["review","Try again"];
  if (x.kind === "money" && x.direction !== "i_owe") return ["review",x.direction === "owed_to_me" ? "Owed to you" : "Review"];
  return ["open",x.kind === "money" ? "Still open" : "To do"];
}
function itemMarkup(x,i=0) {
  const payout = x.kind === "money" && x.direction === "i_owe" && x.amount !== null;
  const sample = !!x.group.isSample;
  const [statusKey,statusLabel] = statusFor(x);
  const actionId = escapeHTML(x.id);
  let controls = "";
  if (x.status === "pending") {
    controls = '<button class="small-btn" data-action="check" data-id="' + actionId + '">↻ Check payment</button>';
  } else if (x.status === "settled" && /^0x[a-f\d]{64}$/i.test(x.txHash || "")) {
    controls = '<button class="small-btn solid" data-action="receipt" data-id="' + actionId + '">View receipt <span>↗</span></button>';
  } else if (x.status === "dismissed") {
    controls = '<button class="small-btn" data-action="reopen" data-id="' + actionId + '">↶ Reopen</button>';
  } else if (x.status === "done" && x.kind === "task") {
    controls = '<button class="small-btn ghost" data-action="reopen-task" data-id="' + actionId + '">↶ Reopen task</button>';
  } else if (x.status === "done" || x.status === "settled") {
    controls = '<span class="status-text">Receipt needs review</span>';
  } else if (payout) {
    controls = sample
      ? '<span class="sample-tag">✦ Example only · not payable</span>'
      : '<button class="small-btn solid" data-action="pay" data-id="' + actionId + '">Pay in USDC <span>↗</span></button><button class="small-btn ghost" data-action="dismiss" data-id="' + actionId + '">Dismiss · no payment</button>';
  } else if (x.kind === "task") {
    controls = '<button class="small-btn solid" data-action="complete" data-id="' + actionId + '">Mark it done ✓</button>';
  } else {
    controls = '<button class="small-btn ghost" data-action="dismiss" data-id="' + actionId + '">Dismiss · no payment</button>';
  }
  const price = x.kind === "money" && x.amount != null ? '<strong class="item-price">' + money(x.amount) + '</strong>' : "";
  const meta = x.group.source === "audio" ? "Voice note" : x.group.source === "recording" ? "Your recording" : "Message";
  const avatar = avatarSvg(x.group.id || x.group.fingerprint || x.group.title);
  const source = escapeHTML(x.group.title || "Your conversation");
  const statusSummary = x.status === "dismissed" ? '<p class="outcome-note">No USDC payment was made for this item.</p>' : "";
  return '<article class="obligation status-'+statusKey+'" style="--i:'+Math.min(i,15)+'">'+
    '<div class="card-top"><div class="item-icon" aria-hidden="true">'+momentIcon(x)+'</div><div class="card-titles"><div class="item-title">'+escapeHTML(x.title)+'</div>'+
    '<div class="card-meta">'+escapeHTML(meta)+' · '+source+'</div></div><div class="card-amount">'+price+
    '<span class="state-pill '+statusKey+'">'+escapeHTML(statusLabel)+'</span></div></div>'+
    '<div class="card-story"><div class="small-avatar">'+avatar+'</div><div class="story-copy"><span class="story-label">FROM YOUR CONVERSATION</span>'+
    '<p class="item-evidence">“'+escapeHTML(x.evidence)+'”</p></div><span class="story-spark" aria-hidden="true">✧</span></div>'+
    '<div class="card-bottom"><div class="item-category"><span class="kind-dot"></span>'+escapeHTML(category(x))+
    (sample ? ' <span class="sample-tag">EXAMPLE</span>' : '')+'</div><div class="item-actions">'+controls+'</div></div>'+
    statusSummary+'</article>';
}
function render() {
  const all = allItems();
  const active = all.filter((x) => !["settled", "done", "dismissed"].includes(x.status));
  const openMoney = active.filter((x) => x.kind === "money" && x.direction === "i_owe" && x.amount != null && !x.group.isSample);
  $("openCount").textContent = String(active.length).padStart(2, "0");
  $("moneyCount").textContent = money(openMoney.reduce((s, x) => s + x.amount, 0));
  $("doneCount").textContent = String(all.filter((x) => x.status === "settled" || (x.kind === "task" && x.status === "done")).length).padStart(2, "0");
  const shown = all.filter((x) => state.filter === "all" || (state.filter === "settled" ? x.kind === "money" && x.status === "settled" : x.kind === state.filter));
  $("inboxSummary").textContent = state.filter === "settled" ? "YOUR RECEIPTS" : shown.length + (shown.length === 1 ? " MOMENT" : " MOMENTS");
  const inbox = $("inbox");
  const emptyTitle = state.filter === "settled" ? "No receipts yet!" : all.length ? "Nothing in this filter ✳" : "All clear, for now!";
  const emptyBody = state.filter === "settled" ? "Verified Monad payments will appear here. Dismissed items are never counted as paid." : all.length ? "Try another filter, or add another moment." : "Drop in a chat, upload a voice note or record a reminder. We'll find the little things worth remembering.";
  inbox.innerHTML = shown.length ? shown.map(itemMarkup).join("") :
    '<div class="empty"><div class="empty-art"><span class="empty-face">'+avatarSvg("empty-inbox")+'</span><span class="empty-confetti">✦</span><span class="empty-heart">♥</span></div><h3>' + emptyTitle +
    '</h3><p>' + emptyBody + '</p><a class="empty-cta" href="#capture">Add a moment ↗</a></div>';
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
  if (!x || x.kind !== "money" || x.direction !== "i_owe" || x.amount === null || !["open", "failed"].includes(x.status)) return;
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
function formatReceiptAmount(amount) {
  return "$" + Number(amount).toFixed(6).replace(/0+$/, "").replace(/\.$/, "") + " USDC";
}
function openReceipt(id) {
  const item = itemById(id);
  if (!item || item.kind !== "money" || item.status !== "settled" ||
      !/^0x[a-fA-F0-9]{64}$/.test(item.txHash || "")) return;
  state.receiptId = item.id;
  $("receiptTitle").textContent = item.title;
  $("receiptAmount").textContent = formatReceiptAmount(item.amount);
  $("receiptPayer").textContent = item.payer || "—";
  $("receiptRecipient").textContent = item.recipientAddress || "—";
  $("receiptToken").textContent = CHAIN.usdc;
  $("receiptHash").textContent = item.txHash;
  $("receiptExplorer").href = CHAIN.explorer + "/tx/" + encodeURIComponent(item.txHash);
  $("receiptCopy").textContent = "Copy transaction hash ↗";
  $("receiptDialog").showModal();
  refreshReceipt(id);
}
async function refreshReceipt(id) {
  const item = itemById(id);
  if (!item || state.receiptId !== id || !$("receiptDialog").open) return;
  const epoch = ++state.receiptEpoch;
  const current = () => state.receiptEpoch === epoch && state.receiptId === id && $("receiptDialog").open;
  $("receiptSeal").className = "receipt-seal";
  $("receiptSeal").textContent = "↗";
  $("receiptState").className = "receipt-state";
  $("receiptState").textContent = "Checking the chain…";
  $("receiptStatus").textContent = "Checking…";
  $("receiptBlock").textContent = "—";
  $("receiptTime").textContent = "—";
  $("receiptMessage").className = "receipt-message";
  $("receiptMessage").textContent = "Fetching a fresh receipt from Monad Testnet RPC. No wallet connection is required.";
  $("receiptRefresh").disabled = true;
  try {
    const response = await fetch("/api/receipt?tx=" + encodeURIComponent(item.txHash), {
      headers: { "accept": "application/json" }, signal: AbortSignal.timeout(18000)
    });
    if (!response.ok) throw new Error("Could not reach Monad Testnet to verify this receipt.");
    const data = await response.json();
    if (!current()) return;
    const proof = makeReceiptProof(data, item);
    if (!proof) throw new Error("We could not match a successful Circle USDC Transfer event to this saved payment.");
    $("receiptSeal").className = "receipt-seal verified";
    $("receiptSeal").textContent = "✓";
    $("receiptState").textContent = "VERIFIED ON MONAD";
    $("receiptStatus").textContent = "✓ Confirmed · onchain";
    $("receiptBlock").textContent = proof.block ? "#" + proof.block : "—";
    $("receiptTime").textContent = proof.timestamp && Number.isFinite(proof.timestamp)
      ? new Date(proof.timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Unavailable";
    $("receiptMessage").textContent = "Verified against the recorded transaction: token contract, payer, recipient, amount and Transfer event all match.";
  } catch (error) {
    if (!current()) return;
    $("receiptSeal").className = "receipt-seal unavailable";
    $("receiptSeal").textContent = "!";
    $("receiptState").className = "receipt-state unavailable";
    $("receiptState").textContent = "Could not reverify";
    $("receiptStatus").textContent = "Verification unavailable";
    $("receiptMessage").className = "receipt-message unavailable";
    $("receiptMessage").textContent = (error?.message || "Blockchain verification unavailable.") + " The fields above are from your browser's saved record. Check the explorer or retry; no new payment is needed.";
  } finally {
    if (current()) $("receiptRefresh").disabled = false;
  }
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
      const wasPending = x.status === "pending";
      x.status = "settled"; x.settledAt = new Date().toISOString(); save(); render();
      if (wasPending) showSettlementMoment(() => openReceipt(x.id));
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
  if (!x || !["open", "failed"].includes(x.status)) return;
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
function animateAction(button, id) {
  const card = button.closest(".obligation");
  if (card && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    card.classList.add("is-exiting");
    card.setAttribute("aria-busy", "true");
    window.setTimeout(() => {
      if (card.isConnected) render();
    }, 245);
  } else {
    render();
  }
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
    if (!window.confirm("Remove finished non-payment tasks from this browser? Your verified USDC payments and receipts will be kept.")) return;
    state.groups = clearFinishedTasks(state.groups);
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
    if (btn.dataset.action === "receipt") return openReceipt(item.id);
    if (btn.dataset.action === "complete") {
      if (!completeTask(item)) return showNotice("Only non-payment tasks can be marked completed.", true);
      save();
      animateAction(btn, item.id);
      showActionMoment({kind:"task", personSeed:item.id, onUndo:() => {
        if (reopenTask(item)) { save(); render(); showNotice("Task reopened. Nothing was paid."); }
      }});
      return;
    }
    if (btn.dataset.action === "reopen-task") {
      if (!reopenTask(item)) return;
      save(); render(); showNotice("Task reopened. Nothing was paid."); return;
    }
    if (btn.dataset.action === "dismiss") {
      if (item.kind !== "money" || !["open", "failed"].includes(item.status)) return;
      if (!window.confirm("Dismiss this money item from your open list?\n\nNo USDC will be sent. This does NOT mean the debt has been paid. You can reopen it later.")) return;
      if (!dismissMoney(item)) return showNotice("This money item cannot be dismissed while payment is pending.", true);
      save();
      animateAction(btn, item.id);
      showActionMoment({kind:"money",personSeed:item.id,onUndo:() => {
        if (reopenDismissed(item)) { save(); render(); showNotice("Money item reopened. No payment was recorded."); }
      }});
      return;
    }
    if (btn.dataset.action === "reopen") {
      if (!reopenDismissed(item)) return;
      save(); render(); showNotice("Money item reopened. No payment was recorded."); return;
    }
  });
  $("confirmPayment").addEventListener("click", confirmPayment);
  $("payDialog").addEventListener("close", () => { state.paymentId = null; $("recipientVerified").checked = false; });
  $("receiptDialog").addEventListener("close", () => { state.receiptId = null; state.receiptEpoch++; });
  $("receiptRefresh").addEventListener("click", () => { if (state.receiptId) refreshReceipt(state.receiptId); });
  $("receiptCopy").addEventListener("click", async () => {
    const item = itemById(state.receiptId);
    if (!item?.txHash) return;
    try {
      await navigator.clipboard.writeText(item.txHash);
      $("receiptCopy").textContent = "✓ Hash copied";
    } catch {
      $("receiptCopy").textContent = "Copy unavailable · select hash above";
    }
  });
  if (window.ethereum?.on) {
    window.ethereum.on("accountsChanged", () => { state.wallet = ""; $("walletBtn").textContent = "Connect wallet ↗"; });
    window.ethereum.on("chainChanged", () => { state.wallet = ""; $("walletBtn").textContent = "Connect wallet ↗"; });
  }
}
wireEvents();
render();
if (restoredLegacyMoneyCount) showNotice("Reopened " + restoredLegacyMoneyCount + " money item(s) previously marked complete without a verified payment. You can now pay or dismiss each one.");
for (const x of allItems().filter((a) => a.status === "pending")) checkReceiptFor(x, false);
