// Real public HTTPS fresh-profile test; no injected wallet and no transactions.
import {spawn} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {setTimeout as sleep} from "node:timers/promises";
const url=process.env.OWED_PUBLIC_URL;
if(!/^https:\/\/[a-z0-9.-]+\/$/.test(url||""))throw Error("OWED_PUBLIC_URL HTTPS root required");
const bin=process.env.CHROME_BIN||"/root/.agent-browser/browsers/chrome-152.0.7977.64/chrome";
const dir=await mkdtemp("/tmp/owed-identity-");
const port=19872;
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
 const taxi="Kemi: I covered the $36 hotel taxi. That's $12 each for Kemi, Zara and Alex.\nZara: Alex, send Kemi your $12, I already sent mine.\nAlex: Alright, I'll do that.";
 let panel=await fill(taxi);
 if(!panel.groupVisible||!["Kemi","Zara","Alex"].every(x=>panel.options.includes(x)))throw Error("Missing group identity choices: "+JSON.stringify(panel));
 await submit();
 let notice=await js("document.querySelector('#notice').textContent");
 if(!notice.includes("Choose which group-chat participant"))throw Error("Unselected group wasn't blocked: "+notice);
 let before=await js("document.querySelectorAll('article.obligation').length");if(before)throw Error("Unselected group generated cards");
 console.log("PASS_GROUP_IDENTITY_REQUIRED");
 await select("Alex");await submit();
 await waitFor("(()=>{const g=JSON.parse(localStorage.getItem('owed-v1-inbox')||'[]');return g.some(x=>x.groupContext?.participant==='Alex')})()");
 let groups=await js("JSON.parse(localStorage.getItem('owed-v1-inbox'))");
 let alex=groups.find(g=>g.groupContext?.participant==="Alex");
 if(alex.obligations.length!==1||alex.obligations[0].kind!=="money"||alex.obligations[0].amount!==12||alex.obligations[0].direction!=="i_owe")
  throw Error("Alex wrong debt: "+JSON.stringify(alex.obligations));
 const payable=await js("document.querySelectorAll('[data-action=pay]').length");
 if(payable!==1)throw Error("Direct group debt not payable after explicit selection: "+payable);
 console.log("PASS_NAMED_ALEX_ONLY_12_NOT_36");
 const dialog=await js("(()=>{document.querySelector('[data-action=pay]').click();return {open:document.querySelector('#payDialog').open,checked:document.querySelector('#recipientVerified').checked,recipient:document.querySelector('#recipientAddress').value}})()");
 if(!dialog.open||dialog.checked||dialog.recipient)throw Error("Group pay recipient was implicitly authorized: "+JSON.stringify(dialog));
 await js("document.querySelector('#payDialog').close();true");
 const airbnb="Amaka: Guys I've paid for the Airbnb. It was $120 total.\nTunde: That's $40 each for the three of us, right?\nShaly: I already sent $15 last night.\nAmaka: Oh true, just saw it. So Shaly you only have $25 left to send me.\nTunde: I'll sort my own $40 tomorrow.\nAmaka: Shaly also please send me the check-in details you got from the host.";
 panel=await fill(airbnb);
 if(!panel.groupVisible||!panel.options.includes("Shaly"))throw Error("Shaly option not detected");
 await select("Shaly");await submit();
 await waitFor("JSON.parse(localStorage.getItem('owed-v1-inbox')||'[]').some(x=>x.groupContext?.participant==='Shaly')");
 groups=await js("JSON.parse(localStorage.getItem('owed-v1-inbox'))");
 const shaly=groups.find(g=>g.groupContext?.participant==="Shaly");
 if(shaly.obligations.length!==2||shaly.obligations.filter(x=>x.kind==="money"&&x.amount===25).length!==1||
   shaly.obligations.filter(x=>x.kind==="task"&&/check-in/i.test(x.title)).length!==1)throw Error("Shaly money/task wrong "+JSON.stringify(shaly.obligations));
 console.log("PASS_NAMED_SHALY_25_AND_ONE_TASK");
 await select("Tunde");await submit();
 await sleep(250);
 groups=await js("JSON.parse(localStorage.getItem('owed-v1-inbox'))");
 if(groups.some(x=>x.groupContext?.participant==="Tunde"))throw Error("Tunde was assigned another person's debt");
 console.log("PASS_TUNDE_NOT_CHARGED");
 const combined="You still owe me $2.25 for printing. Also send me the final event flyer and the location link.";
 panel=await fill(combined);
 if(panel.groupVisible)throw Error("Single message wrongly treated as group");
 await submit();
 await waitFor("(()=>{const g=JSON.parse(localStorage.getItem('owed-v1-inbox')||'[]');return g.some(x=>!x.groupContext&&x.transcript.startsWith('You still owe me $2.25'))})()",130);
 groups=await js("JSON.parse(localStorage.getItem('owed-v1-inbox'))");
 const notes=groups.find(g=>!g.groupContext&&g.transcript===combined);
 const tasks=notes.obligations.filter(x=>x.kind==="task");
 if(tasks.length!==2||new Set(tasks.map(x=>x.id)).size!==2||new Set(tasks.map(x=>x.taskKey)).size!==2)
   throw Error("Atomic task extraction wrong: "+JSON.stringify(notes.obligations));
 console.log("PASS_TWO_INDEPENDENT_ACTIONS");
 const taskId=tasks[0].id;
 await js("document.querySelector('[data-item-id="+JSON.stringify(taskId)+"] [data-action=complete]').click();true");
 await sleep(400);
 const result=await js("JSON.parse(localStorage.getItem('owed-v1-inbox'))");
 const saved=result.find(g=>g.transcript===combined);
 if(saved.obligations.find(x=>x.id===taskId).status!=="done"||saved.obligations.filter(x=>x.kind==="task"&&x.status==="open").length!==1)
    throw Error("Finishing one task completed both");
 await call("Page.reload",{ignoreCache:true});await sleep(600);
 const restored=await js("JSON.parse(localStorage.getItem('owed-v1-inbox'))");
 const again=restored.find(x=>x.transcript===combined);
 if(again.obligations.filter(x=>x.kind==="task"&&x.status==="done").length!==1||
    again.obligations.filter(x=>x.kind==="task"&&x.status==="open").length!==1)
    throw Error("Independent task states not preserved after reload: "+JSON.stringify(again.obligations));
 console.log("PASS_INDEPENDENT_COMPLETION_SURVIVES_RELOAD");
 console.log("PASS_GROUP_AND_ATOMIC_HTTPS_BROWSER");
}finally{
 try{socket?.close();}catch{}
 try{process.kill(-browser.pid,"SIGTERM");}catch{try{browser.kill();}catch{}}
 await sleep(100);await rm(dir,{recursive:true,force:true});
}
