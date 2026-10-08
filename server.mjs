import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { cleanAnalysis, parseModelOutput, PROMPT, COMPACT_PROMPT } from "./lib/obligations.mjs";
import { getChainReceipt } from "./lib/chain-receipts.mjs";

// Pick up a newly saved local token without a server restart; never log it.
function hfToken() {
  if (!process.env.HF_TOKEN) {
    try { process.loadEnvFile(".env"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return process.env.HF_TOKEN;
}

const PORT = Number(process.env.PORT || 3000);
const ROOT = resolve(process.cwd(), "public");
const MAX_AUDIO = 18 * 1024 * 1024;
const MAX_TEXT = 16000;
const HEADERS = { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-frame-options": "DENY", "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" };
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

function send(res, status, obj) {
  const data = JSON.stringify(obj);
  res.writeHead(status, { ...HEADERS, "content-type": "application/json; charset=utf-8" });
  res.end(data);
}
async function readBody(req, limit = MAX_TEXT) {
  const buffers = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Request exceeds size limit."), { status: 413 });
    buffers.push(chunk);
  }
  return Buffer.concat(buffers).toString("utf8");
}
async function chat(text, perspective = "incoming") {
  const local = process.env.LOCAL_INFERENCE_URL?.replace(/\/$/, "");
  const token = local ? process.env.OWED_WORKER_TOKEN : hfToken();
  if (!token) throw Object.assign(new Error(local ? "Private inference worker token is missing." : "HF_TOKEN is not configured. Configure inference to analyze your own conversations."), { status: 503 });
  const url = local ? local + "/v1/chat/completions" : process.env.HF_CHAT_ENDPOINT || "https://router.huggingface.co/v1/chat/completions";
  const response = await fetch(url, {
    method: "POST",
    headers: { "authorization": "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({
      model: local ? (process.env.OWED_TEXT_MODEL || "qwen2.5:0.5b") : (process.env.HF_GEMMA_MODEL || "google/gemma-3-12b-it"),
      messages: [{ role: "system", content: local ? COMPACT_PROMPT : PROMPT }, { role: "user", content: (perspective === "recording" ? "The USER is speaking in this self-recorded reminder. First-person promises and debts are the USER's own.\n\n" : "This is an INCOMING message from someone else to the user. Second-person asks and debts are the USER's obligations.\n\n") + "Analyze only this conversation:\n\n" + text }],
      temperature: 0.1,
      max_tokens: 1400
    }),
    signal: AbortSignal.timeout(local ? 185000 : 45000)
  });
  if (!response.ok) throw Object.assign(new Error(response.status === 402 ? "Hugging Face returned HTTP 402: inference credits or billing are required. Check your Hugging Face billing settings." : "Model provider failed (" + response.status + ")."), { status: response.status === 402 ? 402 : 502 });
  const data = await response.json();
  const answer = data?.choices?.[0]?.message?.content;
  if (typeof answer !== "string") throw Object.assign(new Error("Model response was missing."), { status: 502 });
  let parsed;
  try { parsed = parseModelOutput(answer); }
  catch { throw Object.assign(new Error("Model response was not valid JSON. Try again."), { status: 502 }); }
  return cleanAnalysis(parsed, text, "text", perspective);
}
async function audioToText(file) {
  const local = process.env.LOCAL_INFERENCE_URL?.replace(/\/$/, "");
  const token = local ? process.env.OWED_WORKER_TOKEN : hfToken();
  if (!token) throw Object.assign(new Error(local ? "Private inference worker token is missing." : "HF_TOKEN is not configured."), { status: 503 });
  const endpoint = local ? local + "/transcribe" : process.env.HF_WHISPER_ENDPOINT || "https://router.huggingface.co/hf-inference/models/" + (process.env.HF_WHISPER_MODEL || "openai/whisper-large-v3");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": file.type || "application/octet-stream" },
    body: Buffer.from(await file.arrayBuffer()),
    signal: AbortSignal.timeout(local ? 185000 : 60000)
  });
  if (!response.ok) throw Object.assign(new Error(response.status === 402 ? "Hugging Face returned HTTP 402 for Whisper: inference credits or billing are required." : "Transcription provider failed (" + response.status + ")."), { status: response.status === 402 ? 402 : 502 });
  const data = await response.json();
  if (!data?.text?.trim()) throw Object.assign(new Error("No speech detected."), { status: 422 });
  return String(data.text).slice(0, MAX_TEXT);
}
async function analyzeAudio(req) {
  // Bound the raw body before parsing multipart; do not persist audio or transcripts server-side.
  const buffer = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_AUDIO + 200000) throw Object.assign(new Error("Audio must be under 18 MB."), { status: 413 });
    buffer.push(chunk);
  }
  const web = new Request("http://localhost/audio", {
    method: "POST",
    headers: { "content-type": req.headers["content-type"] || "" },
    body: Buffer.concat(buffer)
  });
  const form = await web.formData();
  const file = form.get("audio");
  if (!(file instanceof File) || !file.size || file.size > MAX_AUDIO ||
      !(file.type.startsWith("audio/") || /\.(m4a|wav|mp3|ogg|webm|mp4)$/i.test(file.name))) {
    throw Object.assign(new Error("Upload an audio file under 18 MB."), { status: 415 });
  }
  const transcript = await audioToText(file);
  const perspective = String(form.get("context") || "") === "recording" ? "recording" : "incoming";
  const result = await chat(transcript, perspective);
  result.source = perspective === "recording" ? "recording" : "audio";
  return result;
}
async function staticFile(req, res, url) {
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = resolve(ROOT, "." + pathname);
  if (!file.startsWith(ROOT + sep)) return send(res, 403, { error: "Forbidden" });
  try {
    const data = await readFile(file);
    res.writeHead(200, { ...HEADERS, "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch { send(res, 404, { error: "Not found" }); }
}
export function makeServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, app: "Owed", inferenceConfigured: Boolean(process.env.LOCAL_INFERENCE_URL ? process.env.OWED_WORKER_TOKEN : hfToken()), inferenceProvider: process.env.LOCAL_INFERENCE_URL ? "private-vps" : "huggingface", network: "monad-testnet" });
      if (req.method === "GET" && url.pathname === "/api/config") return send(res, 200, { chainId: 10143, rpc: "https://testnet-rpc.monad.xyz", explorer: "https://testnet.monadvision.com", usdc: "0x534b2f3A21130d7a60830c2Df862319e593943A3", decimals: 6, livePayments: true, chain: "Monad Testnet" });
      if (req.method === "GET" && url.pathname === "/api/receipt") {
        const txHash = url.searchParams.get("tx");
        return send(res, 200, await getChainReceipt(txHash));
      }
      if (req.method === "POST" && url.pathname === "/api/analyze-text") {
        if (!(req.headers["content-type"] || "").includes("application/json")) return send(res, 415, { error: "Expected JSON" });
        const json = JSON.parse(await readBody(req));
        const content = String(json.text || "").trim();
        if (content.length < 8 || content.length > 12000) return send(res, 400, { error: "Enter a conversation between 8 and 12,000 characters." });
        return send(res, 200, await chat(content));
      }
      if (req.method === "POST" && url.pathname === "/api/analyze-audio") return send(res, 200, await analyzeAudio(req));
      if (req.method === "GET" || req.method === "HEAD") return staticFile(req, res, url);
      send(res, 405, { error: "Method not allowed" });
    } catch (e) {
      console.error("Owed request failed:", e instanceof Error ? e.message : String(e));
      send(res, e.status || (e.name === "SyntaxError" ? 400 : 500), { error: e instanceof Error ? e.message : "Unexpected error" });
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  makeServer().listen(PORT, process.env.HOST || "127.0.0.1", () => console.log("Owed listening on :" + PORT));
}