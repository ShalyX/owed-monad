// Real public HTTPS fresh-profile test; no injected wallet and no transactions.
import {spawn} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {setTimeout as sleep} from "node:timers/promises";
const url=process.env.OWED_PUBLIC_URL;
if(!/^https:\/\/[a-z0-9.-]+\/$/.test(url||""))throw Error("OWED_PUBLIC_URL HTTPS root required");
const bin=process.env.CHROME_BIN||"/root/.agent-browser/browsers/chrome-152.0.7977.64/chrome";
const dir=await mkdtemp("/tmp/owed-review-");
const port=19876;
const browser=spawn(bin,["--headless=new","--no-sandbox","--disable-dev-shm-usage",
 "--disable-gpu","--disable-extensions","--no-first-run","--window-size=1280,880",
 "--remote-debugging-port="+port,"--user-data-dir="+dir,url],{detached:true,stdio:"ignore"});
let socket;
try{
 let page;
 for(let i=0;i<70;i++){try{const tabs=await(await fetch("http://127.0.0.1:"+port+"/json/list")).json();page=tabs.find(x=>x.type==="page"&&x.url===url);if(page)break;}catch{}await sleep(250);}
 if(!page)throw Error("Chrome page unavailable");
 socket=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((ok,no)=>{socket.addEventListener("open",ok,{once:true});socket.addEventListener("error",no,{once:true});});
 let seq=0;
 const pending=new Map();
 socket.addEventListener("message",event=>{
  const msg=JSON.parse(String(event.data)),p=pending.get(msg.id);if(!p)return;
  clearTimeout(p.timer);pending.delete(msg.id);
  if(msg.error||msg.result?.exceptionDetails)p.reject(Error(JSON.stringify(msg.error||msg.result?.exceptionDetails)));
  else p.resolve(msg.result?.result?.value??msg.result);
 });
 const call=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+" timeout"))},25000);
  pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
 });
 const js=expression=>call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
 await call("Runtime.enable");
 for(let i=0;i<65;i++){if(await js("!!document.querySelector('#groupIdentityPanel')&&document.readyState==='complete'"))break;await sleep(250);}
 const initial=await js("({secure:window.isSecureContext,empty:document.querySelectorAll('article.obligation').length,wallet:!!window.ethereum?.request})");
 if(!initial.secure||initial.empty||initial.wallet)throw Error("Not a clean secure no-wallet profile: "+JSON.stringify(initial));
 console.log("PASS_FRESH_IDENTITY_PROFILE");
 async function fill(text) {
  return js("(()=>{const t=document.querySelector('#conversation');t.value="+JSON.stringify(text)+";t.dispatchEvent(new Event('input',{bubbles:true}));return {groupVisible:!document.querySelector('#groupIdentityPanel').classList.contains('hidden'),options:[...document.querySelector('#groupParticipant').options].map(x=>x.value)}})()");
 }
 async function select(name){return js("(()=>{const s=document.querySelector('#groupParticipant');s.value="+JSON.stringify(name)+";s.dispatchEvent(new Event('change',{bubbles:true}));return s.value})()")}
 async function submit(){await js("document.querySelector('#analyzeText').click();true")}
 async function waitFor(predicate,limit=70){
  for(let i=0;i<limit;i++){const state=await js(predicate);if(state)return state;await sleep(350);}
  throw Error("Timed out waiting for browser state");
 }
 const whatsApp=[
"12/10/2026, 9:15 pm - Amaka: Guys, I covered the taxi.",
"12/10/2026, 9:17 pm - Tunde: How much?",
"12/10/2026, 9:18 pm - Amaka: Tunde, please send me $7.50 for your part.",
"12/10/2026, 9:19 pm - Tunde: Alright."
].join("\n");
 await js("document.querySelector('[data-mode=import]').click();true");
 await js("(()=>{const f=new File(["+JSON.stringify(whatsApp)+"],'WhatsApp Chat with Amaka.txt',{type:'text/plain'});const data=new DataTransfer();data.items.add(f);const input=document.querySelector('#chatTextFile');input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#previewChatText').click();return true})()");
 const panel=await waitFor("(()=>{const p=document.querySelector('#groupIdentityPanel');return !p.classList.contains('hidden')&&[...document.querySelector('#groupParticipant').options].some(o=>o.value==='Tunde')})()");
 if(!panel)throw Error("WhatsApp speaker preview did not appear");
 console.log("PASS_WHATSAPP_IMPORT_SPEAKERS");
 await select("Tunde");await submit();
 await waitFor("JSON.parse(localStorage.getItem('owed-v1-inbox')||'[]').some(g=>g.groupContext?.participant==='Tunde')");
 let group=await js("JSON.stringify(JSON.parse(localStorage.getItem('owed-v1-inbox'))[0])");
 group=JSON.parse(group);
 if(group.originalChatExport!==whatsApp||group.obligations.length!==1||group.obligations[0].amount!==7.5)
  throw Error("Source not preserved or wrong group amount: "+JSON.stringify(group));
 const before=group.obligations[0].evidence;
 let card=await js("(()=>{const x=document.querySelector('[data-item-id]');return {hasCorrect:!!x.querySelector('[data-action=edit-review]'),hasPay:!!x.querySelector('[data-action=pay]')}})()");
 if(!card.hasCorrect||card.hasPay)throw Error("Review/pay buttons wrong "+JSON.stringify(card));
 console.log("PASS_GROUP_REVIEW_ONLY_AND_RAW_SOURCE");
 await js("document.querySelector('[data-action=edit-review]').click();true");
 let open=await js("({open:document.querySelector('#itemReviewDialog').open,source:document.querySelector('#reviewOriginalEvidence').textContent})");
 if(!open.open||open.source!==before)throw Error("Evidence editor altered quote "+JSON.stringify(open));
 await js("(()=>{document.querySelector('#reviewTitleInput').value='Corrected taxi share';document.querySelector('#reviewAmountInput').value='5.75';document.querySelector('#reviewDirection').value='owed_to_me';document.querySelector('#reviewStatus').value='needs_review';document.querySelector('#reviewNoteInput').value='Checked the message with Amaka';document.querySelector('#saveItemReview').click();true})()");
 group=JSON.parse(await js("JSON.stringify(JSON.parse(localStorage.getItem('owed-v1-inbox'))[0])"));
 const item=group.obligations[0];
 if(item.amount!==5.75||item.direction!=='owed_to_me'||item.status!=='needs_review'||item.evidence!==before||
    !item.manualReviewOnly||item.reviewHistory?.length!==1||item.sourceEvidence!==before)
  throw Error("Review not persisted safely "+JSON.stringify(item));
 console.log("PASS_EVIDENCE_BACKED_CORRECTION");
 await call("Page.reload",{ignoreCache:true});await sleep(500);
 await waitFor("document.querySelector('[data-action=edit-review]')!==null");
 card=await js("({hasPay:!!document.querySelector('[data-action=pay]'),hasReview:!!document.querySelector('[data-action=edit-review]'),hasWallet:!!window.ethereum?.request})");
 if(card.hasPay||!card.hasReview||card.hasWallet)throw Error("Corrected item became payable "+JSON.stringify(card));
 console.log("PASS_REVIEW_PERSISTS_NO_WALLET");
 await js("document.querySelector('[data-action=edit-review]').click();document.querySelector('#reviewChangeSpeaker').click();true");
 const changed=await js("({selected:document.querySelector('#groupParticipant').value,preview:document.querySelector('#conversation').value.includes('Amaka: Tunde, please send me $7.50'),modal:document.querySelector('#itemReviewDialog').open})");
 if(changed.selected||!changed.preview||changed.modal)throw Error("Speaker switch did not return to review "+JSON.stringify(changed));
 console.log("PASS_REANALYZE_SPEAKER_PERSPECTIVE");
 console.log("PASS_CHAT_IMPORT_REVIEW_HTTPS_BROWSER");
}finally{
 try{socket?.close();}catch{}
 try{process.kill(-browser.pid,"SIGTERM");}catch{try{browser.kill();}catch{}}
 await sleep(100);await rm(dir,{recursive:true,force:true});
}
