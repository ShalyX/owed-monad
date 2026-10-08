import { readFile } from "node:fs/promises";
const base = process.env.OWED_TEST_URL || "http://127.0.0.1:3001";
const text = "Hey, you still owe me $2 for coffee. Please send the event link.";
let failed = 0;
try {
  const r = await fetch(base+"/api/analyze-text",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({text}),signal:AbortSignal.timeout(185000)
  });
  const data=await r.json();
  if(!r.ok)throw new Error("Text "+r.status+" "+data.error);
  console.log("LIVE_TEXT_RESPONSE="+JSON.stringify({title:data.title,obligations:data.obligations?.map(x=>({title:x.title,kind:x.kind,direction:x.direction,amount:x.amount,evidence:x.evidence}))}));
  const money=data.obligations?.find(x=>x.kind==="money"&&x.direction==="i_owe"&&x.amount===2&&text.includes(x.evidence));
  const task=data.obligations?.find(x=>x.kind==="task"&&text.includes(x.evidence));
  if(!money)throw new Error("Live model did not ground the $2 owed money item.");
  if(!task)throw new Error("Live model did not identify the link follow-up.");
  console.log("PASS_LIVE_TEXT_EXTRACTS_MONEY_AND_TASK");
}catch(e){console.error("FAIL_LIVE_TEXT="+e.message);failed++}
try {
  const raw=await readFile("/opt/owed-worker/voice-smoke.wav");
  const form=new FormData();
  form.append("audio",new File([raw],"voice-smoke.wav",{type:"audio/wav"}));
  const r=await fetch(base+"/api/analyze-audio",{
    method:"POST",body:form,signal:AbortSignal.timeout(185000)
  });
  const data=await r.json();
  if(!r.ok)throw new Error("Audio "+r.status+" "+data.error);
  if(!data.transcript?.toLowerCase().includes("coffee"))throw new Error("Whisper transcript did not identify the audio.");
  console.log("LIVE_AUDIO_RESPONSE="+JSON.stringify({transcript:data.transcript,obligations:data.obligations?.map(x=>({title:x.title,kind:x.kind,direction:x.direction,amount:x.amount,evidence:x.evidence}))}));
  console.log("PASS_LIVE_AUDIO_TRANSCRIPTION_AND_EXTRACT");
}catch(e){console.error("FAIL_LIVE_AUDIO="+e.message);failed++}
if(failed)process.exitCode=1;
