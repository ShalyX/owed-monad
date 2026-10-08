import { readFile } from "node:fs/promises";
import { makeServer } from "../server.mjs";
try { process.loadEnvFile(".env"); }
catch (e) { if (e.code !== "ENOENT") throw e; }
const app = makeServer();
await new Promise(resolve => app.listen(0, "127.0.0.1", resolve));
const root = "http://127.0.0.1:" + app.address().port;
const failures = [];
try {
  if (!(process.env.LOCAL_INFERENCE_URL && process.env.OWED_WORKER_TOKEN) && !process.env.HF_TOKEN) throw new Error("No inference provider configured.");
  const input = "Hey, you still owe me $2 for coffee. Please send the event link.";
  try {
    const r = await fetch(root + "/api/analyze-text", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: input }), signal: AbortSignal.timeout(90000)
    });
    const result = await r.json();
    if (!r.ok) throw new Error("HTTP " + r.status + ": " + result.error);
    if (!result.obligations?.length) throw new Error("No grounded obligations.");
    console.log("PASS LIVE GEMMA: " + result.obligations.map(x => x.kind + ": " + x.title + " / " + x.amount).join(" | "));
  } catch(e) { console.error("FAIL LIVE GEMMA: " + e.message); failures.push("Gemma"); }
  const path = process.argv[2];
  if (path) {
    try {
      const bytes = await readFile(path);
      const form = new FormData();
      form.append("audio", new File([bytes], "voice-smoke.wav", { type: "audio/wav" }));
      const r = await fetch(root + "/api/analyze-audio", {
        method: "POST", body: form, signal: AbortSignal.timeout(110000)
      });
      const result = await r.json();
      if (!r.ok) throw new Error("HTTP " + r.status + ": " + result.error);
      if (!result.transcript?.length) throw new Error("No transcript.");
      console.log("PASS LIVE WHISPER: " + result.transcript.slice(0,160));
      console.log("PASS LIVE WHISPER > GEMMA: " + result.obligations.length + " obligations");
    } catch (e) { console.error("FAIL LIVE WHISPER: " + e.message); failures.push("Whisper"); }
  } else { console.log("WHISPER NOT CHECKED: pass a local audio filename."); }
} catch(e) {console.error("LIVE TEST SETUP FAILED: " + e.message); failures.push("setup");}
finally { await new Promise(resolve => app.close(resolve)); }
if (failures.length) process.exitCode = 1;
