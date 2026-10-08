import { readFile, access } from "node:fs/promises";
import { makeServer } from "../server.mjs";
const app = makeServer();
await new Promise(resolve => app.listen(0, "127.0.0.1", resolve));
const root = "http://127.0.0.1:" + app.address().port;
try {
  if (!process.env.HF_TOKEN) throw new Error("Missing HF_TOKEN. Run scripts/set-hf-token.ps1 locally first.");
  const text = "Hey, you still owe me $2 for coffee. Please send the event link.";
  const r = await fetch(root + "/api/analyze-text", {
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text}),
    signal: AbortSignal.timeout(90000)
  });
  const json = await r.json();
  if (!r.ok) throw new Error("Gemma live HTTP "+r.status+" "+json.error);
  if (!json.obligations?.length) throw new Error("Gemma produced no grounded obligations.");
  console.log("PASS LIVE GEMMA: "+ json.obligations.map(x=>x.kind+":"+x.title+" amount="+x.amount).join(" | "));
  const file = process.argv[2];
  if (!file) { console.log("WHISPER NOT TESTED: provide local .wav/.m4a filename after -- to test actual speech"); process.exitCode = 2; }
  else {
    const buf = await readFile(file);
    const form = new FormData();
    form.append("audio",new File([buf],file.split(/[\\/]/).pop(), {type:file.toLowerCase().endsWith(".wav")?"audio/wav":"audio/mpeg"}));
    const ar = await fetch(root + "/api/analyze-audio",{method:"POST",body:form,signal:AbortSignal.timeout(110000)});
    const data = await ar.json();
    if (!ar.ok) throw new Error("Whisper live HTTP "+ar.status+" "+data.error);
    if (!data.transcript?.length) throw new Error("Whisper returned no transcript.");
    console.log("PASS LIVE WHISPER transcript: " + data.transcript.slice(0,160));
    console.log("PASS LIVE WHISPER -> GEMMA: " + data.obligations.length + " obligations");
  }
} catch(e) {console.error("FAIL LIVE INFERENCE: "+e.message);process.exitCode=1}
finally { await new Promise(resolve=>app.close(resolve)); }