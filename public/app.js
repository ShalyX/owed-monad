import { CHAIN, isAddress, microUsdc, transferData, receiptMatches, switchToMonad, readReceipt, getWalletBalances } from "./payments.js";
import { completeTask, reopenTask, dismissMoney, reopenDismissed, restoreLegacyMoney, clearFinishedTasks } from "./actions.js";
import { makeReceiptProof } from "./receipt.js";
import { avatarSvg, friendScene } from "./characters.js";
import { showSettlementMoment } from "./delight.js";
import { showDiscoveryMoment } from "./discovery.js";
import { showActionMoment } from "./moments.js";
import { removeShadowPaymentTasks } from "./obligation-dedupe.js";
import { legacyPaymentWarning } from "./financial-context.js";
import { findSourceAddresses } from "./address-hints.js";

const $ = (id) => document.getElementById(id);
const KEY = "owed-v1-inbox";
// A saved browser status is not chain proof. Proofs are session-scoped and rechecked against the public RPC.
const verifiedReceipts = new Set();
let restoredLegacyMoneyCount = 0;
let collapsedDuplicateTaskCount = 0;
const state = { groups: load(), filter: "all", file: null, recorded: null, recorder: null, chunks: [], timer: null, startedAt: 0, processing: false, paymentId: null, receiptId: null, receiptEpoch: 0, wallet: "", lastVoicePerspective: "incoming" };
$("friendStage").innerHTML = friendScene();
$("analysisBuddy").innerHTML = avatarSvg("the-planner");
const FRIEND_TIPS = [
  "“Good friends. Clearer plans.” ✳",
  "“The best reminder is a kind one.” ♥",
  "“Keep the little promises visible.” ✦",
  "“Only a real payment counts as paid.” ✓"
];
function showFriendTip(index) {
  if (!Number.isInteger(index) || index < 0 || index >= FRIEND_TIPS.length) return;
  $("sceneQuote").textContent = FRIEND_TIPS[index];
  document.querySelectorAll("[data-friend-tip]").forEach((face) => {
    const selected = Number(face.dataset.friendTip) === index;
    face.classList.toggle("cast-selected", selected);
    face.setAttribute("aria-pressed", String(selected));
  });
  $("sceneQuote").classList.remove("quote-reaction");
  void $("sceneQuote").offsetWidth;
  $("sceneQuote").classList.add("quote-reaction");
}
const SAMPLE_TEXT = "Hey, you still owe me $12 for the cab and $6 for lunch. Also, can you send me that venue address? I'll send you the photos tomorrow.";
function load() {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(x)) return [];
    restoredLegacyMoneyCount = restoreLegacyMoney(x);
    for (const group of x) {
      if (!Array.isArray(group?.obligations)) continue;
      const repaired = removeShadowPaymentTasks(group.obligations, { onlyOpen: true });
      collapsedDuplicateTaskCount += group.obligations.length - repaired.length;
      if (repaired.length !== group.obligations.length) group.obligations = repaired;
    }
    if (restoredLegacyMoneyCount || collapsedDuplicateTaskCount) localStorage.setItem(KEY, JSON.stringify(x));
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
  $("retryTranscript").disabled = v;
  $("analysisStage").classList.toggle("hidden", !v);
  $("analysisTitle").textContent = v ? "Working through your moment…" : "Finding the loose ends…";
  $("analysisDetail").textContent = /Transcrib/i.test(message)
    ? "Processing your audio first, then looking for explicit commitments."
    : "Looking for clear requests in your message. Nothing is recorded until analysis completes.";
  if (message) showNotice(message);
}
function showTranscriptReview(transcript, perspective="incoming") {
  if (!transcript?.trim()) return;
  state.lastVoicePerspective = perspective;
  $("transcriptText").value = transcript.slice(0,12000);
  $("transcriptVisible").textContent = transcript.slice(0,12000);
  $("transcriptReview").classList.remove("hidden");
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
  if (!group.isSample) showDiscoveryMoment(group, () => focusObligation(group.obligations[0]?.id));
  showNotice(group.analysisNote || (group.obligations.length
    ? "✦ Found " + group.obligations.length + (group.obligations.length === 1 ? " little thing" : " little things") + " worth remembering. Check the evidence before taking action."
    : "No explicit request found. If this was a voice note, please check the transcript before assuming nothing is owed."));
}
async function analyzeText(perspective = "incoming", transcriptOverride = null) {
  const text = typeof transcriptOverride === "string" ? transcriptOverride.trim() : $("conversation").value.trim();
  if (text.length < 8) return showNotice("Paste a conversation first (at least 8 characters).", true);
  setProcessing(true, "Reading the conversation and extracting explicit obligations…");
  try {
    const response = await fetch("/api/analyze-text", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, context: perspective }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Analysis failed.");
    if (result.obligations?.length) addGroup(result);
    else showNotice(result.analysisNote || "No clear obligation found. Review the words and speaker context before treating this as all clear.");
  } catch (e) { showNotice(e.message, true); }
  finally { setProcessing(false); }
}
async function analyzeAudio(file, context = "incoming", capture = "import") {
  if (!file) return showNotice("Choose or record an audio note first.", true);
  if (file.size > 18 * 1024 * 1024) return showNotice("Keep the voice note under 18 MB.", true);
  $("transcriptReview").classList.add("hidden");
  setProcessing(true, "Transcribing and extracting explicit obligations…");
  try {
    const form = new FormData();
    form.append("audio", file, file.name || "recording.webm");
    form.set("context", context);
    form.set("capture", capture);
    const response = await fetch("/api/analyze-audio", { method: "POST", body: form });
    const result = await response.json();
    if (result.transcript) showTranscriptReview(result.transcript, context);
    if (!response.ok) throw new Error(result.error || "Audio analysis failed.");
    if (result.obligations?.length) {
      addGroup(result);
      showNotice("We found " + result.obligations.length + " possible obligation(s). Compare each quote with what Owed heard before acting.");
    } else {
      showNotice((result.analysisNote ? result.analysisNote + " " : "") + "Speech was recognized, but no obligation was confirmed. Check the words before treating this as all clear.");
      $("transcriptReview").scrollIntoView({block:"nearest",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
    }
  } catch (e) { showNotice(e.message, true); }
  finally { setProcessing(false); }
}
function category(x) {
  if (x.intent === "voluntary_request") return x.direction === "i_owe" ? "Asked you for help" : "You requested help";
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
  if (x.status === "settled" && verifiedReceipts.has(x.id)) return ["verified","✓ Verified onchain"];
  if (x.status === "settled") return ["review","Receipt needs recheck"];
  if (x.status === "pending") return ["pending","⏳ Verifying"];
  if (x.status === "dismissed") return ["dismissed","Dismissed · not paid"];
  if (x.status === "done" && x.kind === "task") return ["completed","✓ Task done"];
  if (x.status === "failed") return ["review","Try again"];
  if (x.intent === "voluntary_request") return ["open",x.direction === "i_owe" ? "Your choice" : "You asked"];
  if (x.kind === "money" && x.direction !== "i_owe") return ["review",x.direction === "owed_to_me" ? "Owed to you" : "Review"];
  return ["open",x.kind === "money" ? "Still open" : "To do"];
}
function itemMarkup(x,i=0) {
  const reviewWarning = x.kind === "money" && ["open","failed"].includes(x.status)
    ? legacyPaymentWarning(x,x.group?.transcript || "") : null;
  const payout = x.kind === "money" && x.direction === "i_owe" && x.amount !== null && !reviewWarning;
  const sample = !!x.group.isSample;
  const [baseStatus,baseLabel] = statusFor(x);
  const [statusKey,statusLabel] = reviewWarning ? ["review","Review before paying"] : [baseStatus,baseLabel];
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
      : '<button class="small-btn solid" data-action="pay" data-id="' + actionId + '">' + (x.intent === "voluntary_request" ? "Send by choice" : "Pay in USDC") + ' <span>↗</span></button><button class="small-btn ghost" data-action="dismiss" data-id="' + actionId + '">' + (x.intent === "voluntary_request" ? "Pass · no payment" : "Dismiss · no payment") + '</button>';
  } else if (x.kind === "task") {
    controls = '<button class="small-btn solid" data-action="complete" data-id="' + actionId + '">Mark it done ✓</button>';
  } else {
    controls = '<button class="small-btn ghost" data-action="dismiss" data-id="' + actionId + '">Dismiss · no payment</button>';
  }
  const price = x.kind === "money" && x.amount != null ? '<strong class="item-price">' + money(x.amount) + '</strong>' : "";
  const meta = x.group.source === "audio" ? "Voice note" : x.group.source === "recording" ? "Your recording" : "Message";
  const avatar = avatarSvg(x.group.id || x.group.fingerprint || x.group.title);
  const source = escapeHTML(x.group.title || "Your conversation");
  const evidenceLabel = x.group.source === "audio" || x.group.source === "recording"
    ? "FROM THE TRANSCRIPT · CHECK THE WORDS" : "FROM YOUR CONVERSATION";
  const statusSummary = x.status === "dismissed" ? '<p class="outcome-note">No USDC payment was made for this item.</p>' : "";
  const contextMessage = reviewWarning || x.contextNote || "";
  const contextMarkup = contextMessage ? '<p class="financial-context-note">'+escapeHTML(contextMessage)+'</p>' : "";
  return '<article class="obligation status-'+statusKey+'" data-item-id="'+actionId+'" tabindex="-1" style="--i:'+Math.min(i,15)+'">'+
    '<div class="card-top"><div class="item-icon" aria-hidden="true">'+momentIcon(x)+'</div><div class="card-titles"><div class="item-title">'+escapeHTML(x.title)+'</div>'+
    '<div class="card-meta">'+escapeHTML(meta)+' · '+source+'</div></div><div class="card-amount">'+price+
    '<span class="state-pill '+statusKey+'">'+escapeHTML(statusLabel)+'</span></div></div>'+
    '<div class="card-story"><div class="small-avatar">'+avatar+'</div><div class="story-copy"><span class="story-label">'+escapeHTML(evidenceLabel)+'</span>'+
    '<p class="item-evidence">“'+escapeHTML(x.evidence)+'”</p>'+contextMarkup+'</div><span class="story-spark" aria-hidden="true">✧</span></div>'+
    '<div class="card-bottom"><div class="item-category"><span class="kind-dot"></span>'+escapeHTML(category(x))+
    (sample ? ' <span class="sample-tag">EXAMPLE</span>' : '')+'</div><div class="item-actions">'+controls+'</div></div>'+
    statusSummary+'</article>';
}
function focusObligation(id) {
  if (!id) return false;
  const hasItem = state.groups.some(group => group.obligations?.some(item => item.id === id));
  if (!hasItem) return false;
  if (state.filter !== "all") { state.filter = "all"; render(); }
  const card = [...document.querySelectorAll(".obligation[data-item-id]")].find(node => node.dataset.itemId === id);
  if (!card) return false;
  card.classList.remove("is-spotlight");
  void card.offsetWidth;
  card.classList.add("is-spotlight");
  card.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  card.focus({ preventScroll: true });
  window.setTimeout(() => card.classList.remove("is-spotlight"), 2600);
  return true;
}
function updateMetric(id, value) {
  const element = $(id);
  const previous = element.textContent;
  element.textContent = value;
  if (previous !== value && element.dataset.countReady) {
    const tile = element.closest(".metric");
    tile?.classList.remove("is-counting");
    void tile?.offsetWidth;
    tile?.classList.add("is-counting");
  }
  element.dataset.countReady = "true";
}
function render() {
  const all = allItems();
  const active = all.filter((x) => !["settled", "done", "dismissed"].includes(x.status));
  const openMoney = active.filter((x) => x.kind === "money" && x.direction === "i_owe" && x.intent !== "voluntary_request" && x.amount != null && !x.group.isSample && !legacyPaymentWarning(x,x.group?.transcript || ""));
  updateMetric("openCount", String(active.length).padStart(2, "0"));
  $("dockCount").textContent = String(active.length);
  $("dockCount").setAttribute("aria-label", active.length + (active.length === 1 ? " open item" : " open items"));
  updateMetric("moneyCount", money(openMoney.reduce((s, x) => s + x.amount, 0)));
  updateMetric("doneCount", String(all.filter((x) => x.status === "settled" || (x.kind === "task" && x.status === "done")).length).padStart(2, "0"));
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
  $("recorderVisual").classList.add("is-recording");
  $("recordStatus").textContent = "Listening to your moment…";
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
  $("recorderVisual").classList.remove("is-recording");
  $("recordStatus").textContent = "Ready to find the loose ends ✦";
}
function showSourceAddressHints(sourceGroup, input) {
  const panel = $("sourceAddressPanel");
  const list = $("sourceAddressList");
  list.replaceChildren();
  const found = findSourceAddresses(sourceGroup?.transcript || "");
  panel.classList.toggle("hidden", found.addresses.length === 0);
  if (!found.addresses.length) return;
  const multiple = found.addresses.length > 1 || found.additional > 0;
  const status = $("sourceAddressStatus");
  status.textContent = multiple
    ? "Several addresses found. Choose only after confirming the recipient."
    : found.auto ? "A payment destination was explicitly written in the chat." : "An address was mentioned. Check whether it belongs to the recipient.";
  for (const candidate of found.addresses) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "source-address-choice";
    const top = document.createElement("span");
    top.className = "source-address-choice-top";
    const label = document.createElement("strong");
    label.textContent = candidate.label;
    const action = document.createElement("span");
    action.textContent = "Use address ↗";
    top.append(label, action);
    const address = document.createElement("code");
    address.textContent = candidate.address;
    const quote = document.createElement("small");
    quote.textContent = candidate.excerpt;
    button.append(top, address, quote);
    button.addEventListener("click", () => {
      input.value = candidate.address;
      $("recipientVerified").checked = false;
      for (const choice of list.children) choice.classList.toggle("chosen", choice === button);
      status.textContent = "Selected from the message. Verify the recipient independently before sending.";
      hideNotice($("paymentNotice"));
    });
    list.append(button);
    if (found.auto === candidate.address) {
      input.value = candidate.address;
      button.classList.add("chosen");
      action.textContent = "Pre-filled ✦";
    }
  }
  if (found.additional) {
    const note = document.createElement("p");
    note.className = "source-address-extra";
    note.textContent = found.additional + " more address(es) were found. Copy the intended one from the conversation and verify it independently.";
    list.append(note);
  }
}
function payDialog(id) {
  const x = itemById(id);
  if (!x || x.kind !== "money" || x.direction !== "i_owe" || x.amount === null || !["open", "failed"].includes(x.status)) return;
  const sourceGroup = state.groups.find((g) => g.obligations?.some((o) => o.id === id));
  if (sourceGroup?.isSample) return showNotice("Sample obligations cannot be paid. Analyze your own conversation first.", true);
  const contextWarning = legacyPaymentWarning(x,sourceGroup?.transcript || "");
  if (contextWarning) return showNotice(contextWarning,true);
  state.paymentId = id;
  $("dialogContextIcon").textContent = momentIcon(x);
  $("dialogContext").textContent = sourceGroup?.title || "Saved conversation";
  $("dialogTitle").textContent = x.intent === "voluntary_request" ? "Send $" + x.amount + " by choice" : x.title;
  $("paymentIntentNote").textContent = x.intent === "voluntary_request"
    ? "This person asked for help. You don't owe them this money. Sending USDC is entirely optional."
    : "";
  $("paymentIntentNote").classList.toggle("hidden",x.intent !== "voluntary_request");
  $("dialogEvidence").textContent = 'From conversation: “' + x.evidence + '”';
  $("dialogAmount").textContent = money(x.amount);
  $("recipientAddress").value = x.recipientAddress || "";
  $("recipientVerified").checked = false;
  showSourceAddressHints(sourceGroup, $("recipientAddress"));
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
  const sourceGroup = state.groups.find(g => g.obligations?.some(o => o.id === id));
  $("receiptMomentIcon").textContent = momentIcon(item);
  $("receiptMomentLabel").textContent = sourceGroup?.title || "Saved conversation";
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
async function verifySavedReceipt(item) {
  if (!item || item.status !== "settled" || !/^0x[a-fA-F0-9]{64}$/.test(item.txHash || "")) return false;
  try {
    const response = await fetch("/api/receipt?tx=" + encodeURIComponent(item.txHash), {
      headers: { "accept": "application/json" }, signal: AbortSignal.timeout(18000)
    });
    if (!response.ok) throw new Error("Receipt lookup unavailable");
    const valid = !!makeReceiptProof(await response.json(), item);
    if (valid) verifiedReceipts.add(item.id);
    else verifiedReceipts.delete(item.id);
    return valid;
  } catch {
    verifiedReceipts.delete(item.id);
    return false;
  } finally { render(); }
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
    verifiedReceipts.add(item.id);
    render();
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
    verifiedReceipts.delete(item.id);
    render();
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
      void verifySavedReceipt(x);
      if (wasPending) showSettlementMoment(() => openReceipt(x.id), x.title);
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
  const sourceGroup = state.groups.find(group => group.obligations?.some(item => item.id === x.id));
  const contextWarning = legacyPaymentWarning(x,sourceGroup?.transcript || "");
  if (contextWarning) return showNotice(contextWarning,true,note);
  const recipient = $("recipientAddress").value.trim();
  if (!isAddress(recipient)) return showNotice("Enter a valid 0x recipient address.", true, note);
  if (!$("recipientVerified").checked) return showNotice("You must independently verify the recipient address before sending.", true, note);
  if (state.processing) return;
  let units;
  try { units = microUsdc(x.amount); } catch (e) { return showNotice(e.message, true, note); }
  const approved = window.confirm((x.intent === "voluntary_request" ? "Optional help request (not a debt)" : "Confirm payment") + " on Monad TESTNET\n\n" + money(x.amount) + " USDC\nTo: " + recipient + "\n\nHave you verified this is the intended recipient?");
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
  $("friendStage").addEventListener("click", (event) => {
    const castButton = event.target.closest("[data-friend-tip]");
    if (castButton) showFriendTip(Number(castButton.dataset.friendTip));
  });
  document.querySelectorAll(".dock-link").forEach((link) => link.addEventListener("click", (event) => {
    const destination = link.dataset.dock;
    document.querySelectorAll(".dock-link").forEach((item) => {
      const current = item === link;
      item.classList.toggle("active", current);
      if (current) item.setAttribute("aria-current", "location");
      else item.removeAttribute("aria-current");
    });
    if (destination === "receipts") {
      state.filter = "settled";
      render();
      $("my-inbox").scrollIntoView({behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start"});
    } else if (destination === "inbox" && state.filter !== "all") {
      state.filter = "all";
      render();
    }
  }));
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  $("conversation").addEventListener("input", () => { $("charCount").textContent = $("conversation").value.length.toLocaleString() + " / 12,000"; });
  $("analyzeText").addEventListener("click", () => analyzeText());
  $("retryTranscript").addEventListener("click", () => analyzeText(state.lastVoicePerspective, $("transcriptText").value));
  $("audioFile").addEventListener("change", (event) => {
    state.file = event.target.files?.[0] || null;
    $("fileLabel").textContent = state.file ? state.file.name : "MP3 · M4A · WAV · WEBM · up to 18 MB";
  });
  $("analyzeFile").addEventListener("click", () => analyzeAudio(state.file, $("importPerspective").value, "import"));
  $("analyzeRecording").addEventListener("click", () => analyzeAudio(state.recorded, $("recordPerspective").value, "record"));
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
  document.querySelectorAll(".filter").forEach((b) => b.addEventListener("click", () => {
    state.filter = b.dataset.filter;
    render();
    const target = state.filter === "settled" ? "receipts" : "inbox";
    document.querySelectorAll(".dock-link").forEach((link) => {
      link.classList.toggle("active", link.dataset.dock === target);
      if (link.dataset.dock === target) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }));
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
  $("recipientAddress").addEventListener("input", () => {
    $("recipientVerified").checked = false;
    const panel = $("sourceAddressPanel");
    if (!panel.classList.contains("hidden")) {
      $("sourceAddressStatus").textContent = "Address edited. Verify these exact characters with the recipient.";
      panel.querySelectorAll(".source-address-choice").forEach(button => button.classList.remove("chosen"));
    }
  });
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
if (collapsedDuplicateTaskCount) showNotice("Tidied up " + collapsedDuplicateTaskCount + " duplicate open to-do(s) describing an existing money request. Your payments, finished tasks, and receipts were kept.");
for (const x of allItems().filter((a) => a.status === "pending")) checkReceiptFor(x, false);
// Limit automatic lookups so restoring a large local inbox cannot exhaust public receipt quotas.
(async () => {
  for (const item of allItems().filter((a) => a.status === "settled").slice(0, 8)) {
    await verifySavedReceipt(itemById(item.id));
  }
})();
