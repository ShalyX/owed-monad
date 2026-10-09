// End-to-end HTTPS demo smoke: real browser + real inference, NO wallet signature.
import {spawn} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {setTimeout as sleep} from "node:timers/promises";
const url=process.env.OWED_PUBLIC_URL;
if(!/^https:\/\/[a-z0-9.-]+\/$/.test(url||""))throw Error("Set OWED_PUBLIC_URL to the public HTTPS root ending in /");
const bin=process.env.CHROME_BIN||"/root/.agent-browser/browsers/chrome-152.0.7977.64/chrome";
const dir=await mkdtemp("/tmp/owed-https-smoke-");
const port=19859;
const browser=spawn(bin,[
 "--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-gpu",
 "--disable-extensions","--no-first-run","--window-size=1366,820",
 "--remote-debugging-port="+port,"--user-data-dir="+dir,url
],{detached:true,stdio:"ignore"});
let socket;
try{
 let page;
 for(let i=0;i<65;i++){
  try{const tabs=await(await fetch("http://127.0.0.1:"+port+"/json/list")).json();
   page=tabs.find(x=>x.type==="page"&&x.url===url);if(page)break;}catch{}
  await sleep(250);
 }
 if(!page)throw Error("Public browser page not available");
 socket=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((ok,no)=>{socket.addEventListener("open",ok,{once:true});socket.addEventListener("error",no,{once:true})});
 let seq=0;
 const pending=new Map();
 socket.addEventListener("message",e=>{
  const res=JSON.parse(String(e.data)),p=pending.get(res.id);if(!p)return;
  clearTimeout(p.timer);pending.delete(res.id);
  if(res.error||res.result?.exceptionDetails)p.reject(Error(JSON.stringify(res.error||res.result?.exceptionDetails)));
  else p.resolve(res.result?.result?.value??res.result);
 });
 const call=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+" timeout"))},25000);
  pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
 });
 const js=(expression)=>call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
 await call("Runtime.enable");
 let ready=false;
 for(let i=0;i<70;i++){
  try{ready=await js("document.readyState==='complete' && !!document.querySelector('#analyzeText')");if(ready)break;}catch{}
  await sleep(250);
 }
 if(!ready)throw Error("Public UI not loaded");
 const first=await js("({secure:window.isSecureContext,origin:location.origin,styles:document.styleSheets.length,hasWallet:!!window.ethereum?.request})");
 console.log("HTTPS_BROWSER="+JSON.stringify(first));
 if(!first.secure||first.styles<2)throw Error("Public browser not secure or missing styles");
 await js("document.querySelector('#conversation').value='You owe me $0.01 for coffee. Please send me the meetup address.';document.querySelector('#analyzeText').click();true");
 let found=false;
 for(let i=0;i<110;i++){
  const state=await js("({busy:document.querySelector('#analyzeText').disabled,cards:document.querySelectorAll('article.obligation').length,notice:document.querySelector('#notice').textContent})");
  if(!state.busy){
   console.log("PUBLIC_ANALYSIS="+JSON.stringify(state));
   found=state.cards>=2;break;
  }
  await sleep(550);
 }
 if(!found)throw Error("Public HTTPS analysis did not render two obligations");
 const counted=await js("({money:document.querySelectorAll('article.obligation [data-action=pay]').length,tasks:document.querySelectorAll('article.obligation [data-action=complete]').length})");
 console.log("PUBLIC_ACTIONS="+JSON.stringify(counted));
 if(counted.money<1||counted.tasks<1)throw Error("Public page lacks expected actionable items");
 await js("document.querySelector('.discovery-moment')?.remove();document.querySelector('[data-action=pay]').click();true");
 const dialog=await js("({open:document.querySelector('#payDialog').open,amount:document.querySelector('#dialogAmount').textContent,verified:document.querySelector('#recipientVerified').checked,recipient:document.querySelector('#recipientAddress').value})");
 console.log("PUBLIC_PAYMENT_REVIEW="+JSON.stringify(dialog));
 if(!dialog.open||dialog.verified||dialog.recipient||!dialog.amount.includes("0.01"))throw Error("Public wallet review unsafe or missing");
 await js("document.querySelector('#confirmPayment').click();true");
 const denied=await js("({open:document.querySelector('#payDialog').open,notice:document.querySelector('#paymentNotice').textContent})");
 console.log("PUBLIC_NO_TRANSFER="+JSON.stringify(denied));
 if(!denied.open||!denied.notice.includes("Enter a valid 0x"))throw Error("No-recipient gate broken");
 console.log("PASS_PUBLIC_HTTPS_CAPTURE_REVIEW_PAY_GATE");
}finally{
 try{socket?.close();}catch{}
 try{process.kill(-browser.pid,"SIGTERM");}catch{try{browser.kill();}catch{}}
 await sleep(150);
 await rm(dir,{recursive:true,force:true});
}
