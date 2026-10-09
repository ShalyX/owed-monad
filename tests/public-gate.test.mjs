import test from "node:test";
import assert from "node:assert/strict";
import { createPublicGate } from "../lib/public-gate.mjs";
import { makeServer } from "../server.mjs";

function mockReq({method="POST",origin,site,ip="198.51.100.1",cfIp}={}){
 return {method,socket:{remoteAddress:ip},headers:{
  host:"owed.trycloudflare.com",
  ...(origin?{origin}:{}),
  ...(site?{"sec-fetch-site":site}:{}),
  ...(cfIp?{"cf-connecting-ip":cfIp}:{})
 }};
}
test("public demo throttles analysis per client and returns retry-after",()=>{
 let time=1000000;
 const gate=createPublicGate({publicDemo:true,perHour:2,now:()=>time});
 for(let i=0;i<2;i++){
  const a=gate.admit(mockReq(),"/api/analyze-text");
  assert.equal(a.ok,true);a.release();a.release();
 }
 const blocked=gate.admit(mockReq(),"/api/analyze-audio");
 assert.equal(blocked.status,429);
 assert.ok(blocked.retryAfter>=3500);
 time+=3600001;
 assert.equal(gate.admit(mockReq(),"/api/analyze-text").ok,true);
});
test("global and per IP simultaneous inference bounds apply, static files stay available",()=>{
 const gate=createPublicGate({publicDemo:true,globalActiveMax:2});
 const a=gate.admit(mockReq({ip:"192.0.2.1"}),"/api/analyze-text");
 assert.equal(a.ok,true);
 assert.equal(gate.admit(mockReq({ip:"192.0.2.1"}),"/api/analyze-text").status,429);
 const b=gate.admit(mockReq({ip:"192.0.2.2"}),"/api/analyze-text");
 assert.equal(b.ok,true);
 assert.equal(gate.admit(mockReq({ip:"192.0.2.3"}),"/api/analyze-text").status,429);
 assert.equal(gate.admit(mockReq(),"/styles.css").ok,true);
 a.release();b.release();
 assert.equal(gate.admit(mockReq({ip:"192.0.2.3"}),"/api/analyze-text").ok,true);
});
test("origin is checked before inference even in local mode",()=>{
 const gate=createPublicGate({publicDemo:false});
 assert.equal(gate.admit(mockReq({origin:"https://evil.example"}),"/api/analyze-text").status,403);
 assert.equal(gate.admit(mockReq({site:"cross-site"}),"/api/analyze-audio").status,403);
 assert.equal(gate.admit(mockReq({origin:"https://owed.trycloudflare.com"}),"/api/analyze-text").ok,true);
 assert.equal(gate.admit(mockReq({method:"GET",origin:"https://evil.example"}),"/api/config").ok,true);
});
test("public tunnel trusts only loopback CF client header, not arbitrary remote spoof",()=>{
 const gate=createPublicGate({publicDemo:true,perHour:1});
 const a=gate.admit(mockReq({ip:"127.0.0.1",cfIp:"203.0.113.7"}),"/api/analyze-text");a.release();
 assert.equal(gate.admit(mockReq({ip:"127.0.0.1",cfIp:"203.0.113.7"}),"/api/analyze-text").status,429);
 const b=gate.admit(mockReq({ip:"127.0.0.1",cfIp:"203.0.113.8"}),"/api/analyze-text");
 assert.equal(b.ok,true);b.release();
 const c=gate.admit(mockReq({ip:"192.0.2.4",cfIp:"203.0.113.7"}),"/api/analyze-text");
 assert.equal(c.ok,true);c.release();
 assert.equal(gate.admit(mockReq({ip:"192.0.2.4",cfIp:"203.0.113.8"}),"/api/analyze-text").status,429);
});
test("receipt requests use separate short quota without affecting analysis",()=>{
 const gate=createPublicGate({publicDemo:true,receiptPerMinute:1,perHour:3});
 const req=mockReq({method:"GET"});
 assert.equal(gate.admit(req,"/api/receipt").ok,true);
 assert.equal(gate.admit(req,"/api/receipt").status,429);
 assert.equal(gate.admit(mockReq(),"/api/analyze-text").ok,true);
});
test("HTTP public endpoint denies CSRF, throttles before inference, and serves assets",async()=>{
 const app=makeServer({publicDemo:true,perHour:1});
 await new Promise(ok=>app.listen(0,"127.0.0.1",ok));
 const base="http://127.0.0.1:"+app.address().port;
 try{
  const csrf=await fetch(base+"/api/analyze-text",{method:"POST",headers:{"content-type":"application/json","origin":"https://bad.example"},body:JSON.stringify({text:"You owe me $1"})});
  assert.equal(csrf.status,403);
  const first=await fetch(base+"/api/analyze-text",{method:"POST",headers:{"content-type":"text/plain"},body:"test"});
  assert.equal(first.status,415);
  const next=await fetch(base+"/api/analyze-text",{method:"POST",headers:{"content-type":"text/plain"},body:"test"});
  assert.equal(next.status,429);
  assert.ok(Number(next.headers.get("retry-after"))>=1);
  assert.equal((await fetch(base+"/")).status,200);
  assert.equal((await fetch(base+"/api/config")).status,200);
 }finally{await new Promise(ok=>app.close(ok));}
});
