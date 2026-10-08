import test from "node:test";
import assert from "node:assert/strict";
import { explicitSpokenPayments } from "../lib/spoken-obligations.mjs";
import { cleanAnalysis } from "../lib/obligations.mjs";
import { makeServer } from "../server.mjs";
import { createServer } from "node:http";

const direct10="Hey there, send me my ten dollars right now.";
const equipment250="Hello, just calling to remind you about the backpack and headphones you selected. So the total for both is two hundred and fifty dollars, and you can just send it in now.";
const advice250="Sometimes you need to plan your spending carefully. For the desk and chair you are considering, you should be needing around two hundred and fifty dollars to sort this out.";
const empty=()=>({title:"Voice note",summary:"",obligations:[]});
test("direct spoken ten-dollar request is extracted, payable only as a request to the user",()=>{
  const matches=explicitSpokenPayments(direct10);
  assert.equal(matches.length,1);
  assert.equal(matches[0].amount,10);
  assert.equal(matches[0].direction,"i_owe");
  const result=cleanAnalysis(empty(),direct10,"audio");
  assert.equal(result.obligations.length,1);
  assert.equal(result.obligations[0].amount,10);
  assert.equal(result.obligations[0].recipientAddress,"");
  assert.equal(result.obligations[0].txHash,"");
  assert.ok(direct10.includes(result.obligations[0].evidence));
  const self=cleanAnalysis(empty(),direct10,"recording","recording");
  assert.equal(self.obligations[0].direction,"owed_to_me");
});
test("contextual spoken total plus send-it request produces one grounded $250 item",()=>{
  const result=cleanAnalysis(empty(),equipment250,"audio","incoming");
  assert.equal(result.obligations.length,1);
  assert.equal(result.obligations[0].amount,250);
  assert.equal(result.obligations[0].direction,"i_owe");
  assert.ok(equipment250.includes(result.obligations[0].evidence));
});
test("advice about a $250 kit cost is not a demand to pay",()=>{
  assert.deepEqual(explicitSpokenPayments(advice250),[]);
  assert.equal(cleanAnalysis(empty(),advice250,"audio").obligations.length,0);
});
test("no guessed amount when colloquial speech could mean two fifty or two dollars fifty",()=>{
  const t="You can send two fifty dollars in now.";
  const result=cleanAnalysis(empty(),t,"audio");
  assert.equal(result.obligations.length,1);
  assert.equal(result.obligations[0].amount,null);
  assert.equal(result.obligations[0].direction,"i_owe");
});
test("no debt from hypothetical speech, sender promises or isolated quoted prices",()=>{
  for (const text of ["If you owe me ten dollars, you could send it in now.",
    "I will send the photos tomorrow. The lunch cost ten dollars.",
    "You'll need 250 dollars for the gear.",
    "The soccer boots cost two hundred dollars.",
    "Be competitive and pay attention to the next level."]) {
    assert.equal(explicitSpokenPayments(text).length,0,text);
  }
});
test("a wrong or missing model money amount is corrected only by source-quoted demand",()=>{
  const raw={title:"Request",obligations:[{title:"Return my money",kind:"money",direction:"i_owe",amount:150,
    evidence:"send me my ten dollars right now."}]};
  const result=cleanAnalysis(raw,direct10);
  assert.equal(result.obligations.length,1);
  assert.equal(result.obligations[0].amount,10);
});

test("voice upload exposes transcript on bad AI output and safely recovers direct requests",async()=>{
  let currentTranscript=direct10;
  let responseMode="invalid-structure";
  const worker=createServer(async(req,res)=>{
    for await(const _ of req){}
    res.setHeader("content-type","application/json");
    if(req.url==="/asr")res.end(JSON.stringify({text:currentTranscript}));
    else res.end(JSON.stringify({choices:[{message:{content:responseMode==="empty-valid"?JSON.stringify(empty()):JSON.stringify({title:"Unusable",items:[]})}}]}));
  });
  await new Promise(ok=>worker.listen(0,"127.0.0.1",ok));
  const old={HF_TOKEN:process.env.HF_TOKEN,HF_CHAT_ENDPOINT:process.env.HF_CHAT_ENDPOINT,
    HF_WHISPER_ENDPOINT:process.env.HF_WHISPER_ENDPOINT,LOCAL_INFERENCE_URL:process.env.LOCAL_INFERENCE_URL};
  delete process.env.LOCAL_INFERENCE_URL;
  process.env.HF_TOKEN="test-voice-token";
  process.env.HF_CHAT_ENDPOINT="http://127.0.0.1:"+worker.address().port+"/chat";
  process.env.HF_WHISPER_ENDPOINT="http://127.0.0.1:"+worker.address().port+"/asr";
  const app=makeServer();
  await new Promise(ok=>app.listen(0,"127.0.0.1",ok));
  const base="http://127.0.0.1:"+app.address().port;
  async function sendVoice(context="incoming"){
    const form=new FormData();
    form.append("audio",new File([new Uint8Array([82,73,70,70])],"voice-note.wav",{type:"audio/wav"}));
    form.set("context",context);form.set("capture","record");
    const r=await fetch(base+"/api/analyze-audio",{method:"POST",body:form});
    return {status:r.status,data:await r.json()};
  }
  try{
    const paid=await sendVoice();
    assert.equal(paid.status,200);
    assert.equal(paid.data.obligations.length,1);
    assert.equal(paid.data.obligations[0].amount,10);
    assert.equal(paid.data.obligations[0].direction,"i_owe");
    assert.equal(paid.data.source,"recording");
    assert.equal(paid.data.transcript,direct10);
    assert.match(paid.data.analysisNote,/incomplete/);
    const self=await sendVoice("recording");
    assert.equal(self.data.obligations[0].direction,"owed_to_me");
    currentTranscript=advice250;
    const advice=await sendVoice();
    assert.equal(advice.status,502);
    assert.match(advice.data.error,/Review the transcript/);
    assert.equal(advice.data.transcript,advice250);
    responseMode="empty-valid";
    const none=await sendVoice();
    assert.equal(none.status,200);
    assert.deepEqual(none.data.obligations,[]);
    assert.equal(none.data.transcript,advice250);
    currentTranscript=direct10;
    const fromEmpty=await sendVoice();
    assert.equal(fromEmpty.status,200);
    assert.equal(fromEmpty.data.obligations[0].amount,10);
  }finally{
    await new Promise(ok=>app.close(ok));
    await new Promise(ok=>worker.close(ok));
    for(const [key,val] of Object.entries(old)) if(val===undefined)delete process.env[key];else process.env[key]=val;
  }
});
