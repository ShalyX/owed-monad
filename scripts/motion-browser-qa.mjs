import {spawn} from "node:child_process";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {setTimeout as sleep} from "node:timers/promises";
const base=process.env.OWED_BASE || "http://127.0.0.1:3001/";
const bin=process.env.CHROME_BIN || "/root/.agent-browser/browsers/chrome-152.0.7977.64/chrome";
const profile=await mkdtemp("/tmp/owed-social-motion-");
const port=19945;
const browser=spawn(bin,["--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--disable-extensions","--no-first-run","--disable-background-networking","--window-size=1440,900","--remote-debugging-port="+port,"--user-data-dir="+profile,base],{stdio:"ignore",detached:true});
let socket;let failures=0;
try{
 let target;
 for(let i=0;i<50;i++){try{const tabs=await (await fetch("http://127.0.0.1:"+port+"/json/list")).json();target=tabs.find(x=>x.type==="page"&&x.url.includes(":3001"));if(target)break}catch{}await sleep(300)}
 if(!target)throw Error("Headless browser failed to open Owed");
 socket=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((ok,no)=>{socket.addEventListener("open",ok,{once:true});socket.addEventListener("error",no,{once:true})});
 let seq=0;const pending=new Map(),errors=[];
 socket.addEventListener("message",e=>{const msg=JSON.parse(String(e.data));if(msg.method==="Runtime.exceptionThrown")errors.push(JSON.stringify(msg.params?.exceptionDetails).slice(0,500));const p=pending.get(msg.id);if(!p)return;clearTimeout(p.timer);pending.delete(msg.id);if(msg.error||msg.result?.exceptionDetails)p.reject(Error(JSON.stringify(msg.error||msg.result?.exceptionDetails).slice(0,500)));else p.resolve(msg.result?.result?.value??msg.result)});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+" CDP timeout"))},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}))});
 const js=(expression)=>call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
 await call("Runtime.enable");
 for(let i=0;i<40;i++){try{if(await js("document.readyState==='complete'&&!!document.querySelector('#inbox')"))break}catch{}await sleep(170)}
 const sceneStart=await js("document.querySelector('#sceneQuote').textContent");
 await js("document.querySelector('[data-friend-tip=\"2\"]').click();true");
 const sceneAfter=await js("({tip:document.querySelector('#sceneQuote').textContent,chosen:document.querySelector('[data-friend-tip=\"2\"]').getAttribute('aria-pressed'),buttonCount:document.querySelectorAll('.friend-cast button').length})");
 console.log("CHARACTER_REACTION="+JSON.stringify({before:sceneStart,after:sceneAfter}));
 if(sceneAfter.tip===sceneStart||sceneAfter.chosen!=="true"||sceneAfter.buttonCount!==4)throw Error("Illustrated crew does not respond to a tap");
 await js("document.querySelector('[data-mode=record]').click();true");
 const recorder=await js("({visible:!document.querySelector('#recordPanel').classList.contains('hidden'),waveBars:document.querySelectorAll('.record-waves i').length,importHidden:document.querySelector('#importPanel').classList.contains('hidden')})");
 console.log("RECORD_TAB="+JSON.stringify(recorder));
 if(!recorder.visible||recorder.waveBars!==5||!recorder.importHidden)throw Error("Record tab missing or waveform markup invalid");
 await js("document.querySelector('[data-mode=import]').click();true");
 if(!await js("!document.querySelector('#importPanel').classList.contains('hidden')"))throw Error("Import tab not opening");
 await js("document.querySelector('[data-mode=paste]').click();true");
 if(!await js("!document.querySelector('#pastePanel').classList.contains('hidden')"))throw Error("Paste tab not restored");
 const fixture=[{id:"smoke-group",title:"Realistic test message",source:"text",fingerprint:"temporary-browser-smoke",createdAt:new Date().toISOString(),obligations:[
 {id:"smoke-task",title:"Send the venue link",kind:"task",direction:"i_owe",status:"open",evidence:"Send the venue link",amount:null},
 {id:"smoke-money",title:"Coffee payback",kind:"money",direction:"i_owe",status:"open",evidence:"You owe me $0.01",amount:0.01,txHash:""},
 {id:"shadow-task",title:"Send payment details",kind:"task",direction:"i_owe",status:"open",evidence:"You owe me $0.01",amount:null}
 ]}];
 await js("localStorage.setItem('owed-v1-inbox',"+JSON.stringify(JSON.stringify(fixture))+");location.reload();true");
 let ready=false;
 for(let i=0;i<45;i++){try{ready=await js("!!document.querySelector('button[data-action=\"complete\"][data-id=\"smoke-task\"]')");if(ready)break;}catch{}await sleep(150)}
 if(!ready)throw Error("Task card did not render");
 const legacyReconciled=await js("(()=>{const g=JSON.parse(localStorage.getItem('owed-v1-inbox'))[0];return {ids:g.obligations.map(x=>x.id),visible:!!document.querySelector('[data-item-id=shadow-task]'),notice:document.querySelector('#notice').textContent}})()");
 console.log("LEGACY_PAYMENT_SHADOW_CLEANUP="+JSON.stringify(legacyReconciled));
 if(legacyReconciled.ids.length!==2||legacyReconciled.ids.includes("shadow-task")||legacyReconciled.visible||!legacyReconciled.notice.includes("Tidied up"))throw Error("Existing browser inbox duplicate payment task was not removed");
 const snap=()=>js("(()=>{const g=JSON.parse(localStorage.getItem('owed-v1-inbox'))[0];return {task:g.obligations[0].status,money:g.obligations[1].status,transaction:g.obligations[1].txHash||'',open:document.querySelector('#openCount').textContent,done:document.querySelector('#doneCount').textContent,notice:document.querySelector('.action-moment')?.textContent||'',class:document.querySelector('.action-moment')?.className||''}})()");
 await js("document.querySelector('button[data-action=\"complete\"][data-id=\"smoke-task\"]').click();true");
 const completed=await snap();console.log("TASK_COMPLETE="+JSON.stringify(completed));
 if(completed.task!=="done"||!completed.notice.includes("Task completed. Nothing was paid.")||!completed.class.includes("action-task")||completed.money!=="open")throw Error("Task completion feedback not accurate");
 await sleep(350);
 const countMotion=await js("({open:document.querySelector('#openCount').textContent,done:document.querySelector('#doneCount').textContent,animated:document.querySelector('.metric-done').classList.contains('is-counting')})");
 console.log("TASK_COUNT_MOTION="+JSON.stringify(countMotion));
 if(Number(countMotion.open)!==1||Number(countMotion.done)!==1||!countMotion.animated)throw Error("Count animation did not accompany task completion");
 await js("document.querySelector('.action-undo').click();true");
 let undone=await snap();console.log("TASK_UNDO="+JSON.stringify(undone));
 if(undone.task!=="open"||undone.money!=="open")throw Error("Task undo failed");
 // State may still be displayed for 245ms after fold-out.
 await sleep(350);
 await js("window.confirm=()=>true;document.querySelector('button[data-action=\"dismiss\"][data-id=\"smoke-money\"]').click();true");
 const dismissed=await snap();console.log("MONEY_DISMISS="+JSON.stringify(dismissed));
 if(dismissed.money!=="dismissed"||!dismissed.notice.includes("no payment sent")||!dismissed.class.includes("action-dismissed")||dismissed.transaction)throw Error("Dismissal incorrectly treated as payment");
 await js("document.querySelector('.action-undo').click();true");
 undone=await snap();console.log("MONEY_UNDO="+JSON.stringify(undone));
 if(undone.task!=="open"||undone.money!=="open"||undone.transaction||Number(undone.done)!==0||Number(undone.open)!==2)throw Error("Reopened money item not correct");
 await sleep(350);
 await js("document.querySelector('button[data-filter=settled]').click();true");
 // Test the real loading UX, but mock only the inference endpoint, not a live model.
 const response={id:"smoke-result",title:"Coffee message",source:"text",fingerprint:"smoke-fake-result",createdAt:new Date().toISOString(),obligations:[{id:"smoke-new",title:"Reply to the message",kind:"task",direction:"i_owe",status:"open",evidence:"Reply to me",amount:null}]};
 await js("window.fetch=(original=>((input,options)=>String(input)==='/api/analyze-text'?new Promise(resolve=>{window.__finishSmoke=()=>resolve(new Response("+JSON.stringify(JSON.stringify(response))+",{status:200,headers:{'content-type':'application/json'}}))}):original(input,options)))(window.fetch);document.querySelector('#conversation').value='Can you reply to me by Saturday?';document.querySelector('#analyzeText').click();true");
 await sleep(120);
 const processing=await js("({visible:!document.querySelector('#analysisStage').classList.contains('hidden'),busy:document.querySelector('#analyzeText').disabled,claim:document.querySelector('#analysisDetail').textContent})");
 console.log("ANALYSIS_LOADING="+JSON.stringify(processing));
 if(!processing.visible||!processing.busy||!processing.claim.includes("Nothing is recorded until"))throw Error("Analysis loading not meaningful or accurate");
 await js("window.__finishSmoke();true");
 let found=false;
 for(let i=0;i<35;i++){found=await js("!!document.querySelector('.discovery-moment')&&!document.querySelector('#analyzeText').disabled&&document.querySelector('#analysisStage').classList.contains('hidden')");if(found)break;await sleep(90)}
 console.log("ANALYSIS_DISCOVERY_VISIBLE="+found);
 if(!found)throw Error("Extraction reveal not working");
 await js("document.querySelector('.discovery-view').click();true");
 const handoff=await js("({target:document.activeElement?.dataset?.itemId,spotlight:document.activeElement?.classList.contains('is-spotlight'),view:document.querySelector('.filter.active')?.dataset.filter})");
 console.log("DISCOVERY_TO_CARD_HANDOFF="+JSON.stringify(handoff));
 if(handoff.target!=="smoke-new"||!handoff.spotlight||handoff.view!=="all")throw Error("Discovery did not focus the actual newly extracted obligation");
 await js("document.querySelector('button[data-action=pay][data-id=smoke-money]').click();true");
 const payContext=await js("({open:document.querySelector('#payDialog').open,title:document.querySelector('#dialogTitle').textContent,context:document.querySelector('#dialogContext').textContent,icon:document.querySelector('#dialogContextIcon').textContent,recipient:document.querySelector('#recipientAddress').value,authorized:!!document.querySelector('#recipientVerified').checked})");
 console.log("OBLIGATION_TO_PAYMENT_CONTEXT="+JSON.stringify(payContext));
 if(!payContext.open||payContext.title!=="Coffee payback"||payContext.context!=="Realistic test message"||payContext.icon!=="☕"||payContext.authorized)throw Error("Payment handoff lost source context or auto-confirmed recipient");
 await js("document.querySelector('#payDialog').close();true");
 // Presentation-only smoke check: this invokes the standalone visual, NOT the payment logic.
 await js("import('/delight.js').then(m=>{m.showSettlementMoment(()=>{});return true})");
 const cheer=await js("({avatars:document.querySelectorAll('.settlement-moment .settlement-friends svg').length,confetti:!!document.querySelector('.settlement-confetti'),label:document.querySelector('.settlement-words strong')?.textContent})");
 console.log("PAYMENT_CELEBRATION_PRESENTATION_ONLY="+JSON.stringify(cheer));
 if(cheer.avatars!==2||!cheer.confetti||!cheer.label.includes('All settled'))throw Error("Verified-payment celebration visual incomplete");
 await js("document.querySelector('.settlement-moment')?.remove();true");
 const screenshot=await call("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
 const out="/tmp/owed-motion-desktop.png";
 if(screenshot?.data){await writeFile(out,Buffer.from(screenshot.data,"base64"));console.log("DESKTOP_SCREENSHOT="+out)}
 await call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await sleep(330);
 const mobile=await js("({width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,cardWidth:document.querySelector('.obligation').getBoundingClientRect().width,toast:!!document.querySelector('.discovery-moment')})");
 console.log("MOBILE_LAYOUT="+JSON.stringify(mobile));
 if(mobile.scrollWidth>mobile.width+5||mobile.cardWidth>mobile.width)throw Error("Mobile horizontal overflow");
 const dock=await js("(()=>{const buttons=[...document.querySelectorAll('.dock-link')],rects=buttons.map(b=>b.getBoundingClientRect());return {display:getComputedStyle(document.querySelector('.mobile-dock')).display,count:document.querySelector('#dockCount').textContent,buttons:rects.map(r=>({height:r.height,width:r.width})),bottom:document.querySelector('.mobile-dock').getBoundingClientRect().bottom,screen:window.innerHeight}})()");
 console.log("MOBILE_DOCK="+JSON.stringify(dock));
 if(dock.display==="none"||dock.buttons.length!==3||dock.buttons.some(b=>b.height<44)||dock.bottom>dock.screen+2)throw Error("Mobile dock is not usable");
 await js("document.querySelector('[data-dock=receipts]').click();true");
 const receiptsNav=await js("({filter:document.querySelector('.filter.active')?.dataset.filter,active:document.querySelector('[data-dock=receipts]').classList.contains('active')})");
 console.log("MOBILE_RECEIPT_NAV="+JSON.stringify(receiptsNav));
 if(receiptsNav.filter!=="settled"||!receiptsNav.active)throw Error("Mobile Receipts nav does not select archive");
 await js("document.querySelector('[data-dock=inbox]').click();true");
 if(!await js("document.querySelector('.filter.active')?.dataset.filter==='all'"))throw Error("Mobile Inbox nav didn't restore full inbox");
 await js("document.querySelector('[data-dock=capture]').click();true");
 if(!await js("document.querySelector('[data-dock=capture]').classList.contains('active')"))throw Error("Mobile Capture nav didn't activate");
 await js("document.querySelector('#conversation').focus();true");
 const keyboardDock=await js("getComputedStyle(document.querySelector('.mobile-dock')).display");
 console.log("MOBILE_COMPOSING_DOCK="+keyboardDock);
 if(keyboardDock!=="none")throw Error("Dock obstructs text entry");
 await js("document.querySelector('#conversation').blur();true");
 await call("Emulation.setDeviceMetricsOverride",{width:320,height:750,deviceScaleFactor:1,mobile:true});
 await sleep(200);
 const narrow=await js("({screen:innerWidth,scrollWidth:document.documentElement.scrollWidth,cast:document.querySelector('.friend-stage').getBoundingClientRect().width,dockVisible:getComputedStyle(document.querySelector('.mobile-dock')).display!=='none'})");
 console.log("NARROW_MOBILE="+JSON.stringify(narrow));
 if(narrow.scrollWidth>narrow.screen+5||!narrow.dockVisible)throw Error("Narrow mobile layout overflows or hides navigation");
 await call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await sleep(100);
 await call("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
 const reduced=await js("({reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,avatar:getComputedStyle(document.querySelector('.cast-member')).animationName,card:getComputedStyle(document.querySelector('.obligation')).animationName})");
 console.log("REDUCED_MOTION="+JSON.stringify(reduced));
 if(!reduced.reduced||reduced.avatar!=="none"||reduced.card!=="none")throw Error("Reduced-motion preference ignored");
 const shot=await call("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
 if(shot?.data){const p="/tmp/owed-motion-mobile.png";await writeFile(p,Buffer.from(shot.data,"base64"));console.log("MOBILE_SCREENSHOT="+p)}
 // Receipt context is tested using a synthetic browser-only settled item.
 // The read-only RPC is mocked as having no receipt, so it MUST NOT be labelled verified.
 const archived={id:"receipt-group",title:"Coffee conversation with friends",source:"text",fingerprint:"browser-receipt-fixture",createdAt:new Date().toISOString(),
   obligations:[{id:"synthetic-receipt",kind:"money",direction:"i_owe",title:"Coffee payback",amount:.01,evidence:"you owe me $0.01",status:"settled",txHash:"0x"+"c".repeat(64),payer:"0x"+"1".repeat(40),recipientAddress:"0x"+"2".repeat(40)}]};
 await js("localStorage.setItem('owed-v1-inbox',"+JSON.stringify(JSON.stringify([archived]))+");location.reload();true");
 let receiptVisible=false;
 for(let i=0;i<30;i++){try{receiptVisible=await js("!!document.querySelector('button[data-action=receipt][data-id=synthetic-receipt]')");if(receiptVisible)break}catch{}await sleep(130)}
 if(!receiptVisible)throw Error("Saved receipt action not rendered");
 await js("window.fetch=(original=>async(input,options)=>String(input).startsWith('/api/receipt?')?new Response(JSON.stringify({chainId:'0x279f',receipt:null,blockTimestamp:null}),{status:200,headers:{'content-type':'application/json'}}):original(input,options))(window.fetch);true");
 await js("document.querySelector('button[data-action=receipt][data-id=synthetic-receipt]').click();true");
 let archiveProof;
 for(let i=0;i<30;i++){
   archiveProof=await js("({open:document.querySelector('#receiptDialog').open,context:document.querySelector('#receiptMomentLabel').textContent,icon:document.querySelector('#receiptMomentIcon').textContent,state:document.querySelector('#receiptState').textContent})");
   if(archiveProof?.state==="Could not reverify")break;
   await sleep(130);
 }
 console.log("ARCHIVED_RECEIPT_CONTEXT_UNVERIFIED="+JSON.stringify(archiveProof));
 if(!archiveProof?.open||archiveProof.context!=="Coffee conversation with friends"||archiveProof.icon!=="☕"||archiveProof.state!=="Could not reverify")throw Error("Saved receipt lost context or falsely claimed onchain verification");
 await js("document.querySelector('#receiptDialog').close();true");
 // Audio-specific regression: the UI must show exactly what the recognizer heard,
 // allow editing and replay with the correct speaker context, and avoid false "All clear".
 await js("document.querySelector('[data-mode=import]').click();true");
 await js("document.querySelector('#importPerspective').value='incoming';true");
 const audioFixture="Hi there, please send me my ten dollars right now.";
 const zeroVoice={title:"No obligation",transcript:audioFixture,perspective:"incoming",source:"audio",obligations:[]};
 await js("window.__voiceFixture="+JSON.stringify(JSON.stringify(zeroVoice))+";window.fetch=(base=>async(url,opts)=>{if(String(url)==='/api/analyze-audio'){window.__voiceContext=opts.body.get('context');window.__voiceCapture=opts.body.get('capture');return new Response(window.__voiceFixture,{status:200,headers:{'content-type':'application/json'}})}if(String(url)==='/api/analyze-text'){const input=JSON.parse(opts.body);window.__retryPayload=input;return new Response(JSON.stringify({id:'reviewed',title:'Ten dollars',fingerprint:'reviewed-fixture',transcript:input.text,source:'text',obligations:[{id:'reviewed-item',kind:'money',direction:'i_owe',title:'Ten dollar repayment',evidence:'send me my ten dollars',amount:10,status:'open'}]}),{status:200,headers:{'content-type':'application/json'}})}return base(url,opts)})(window.fetch);true");
 await js("(()=>{const d=new DataTransfer();d.items.add(new File([new Uint8Array([82,73,70,70])],'clip.wav',{type:'audio/wav'}));const el=document.querySelector('#audioFile');el.files=d.files;el.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#analyzeFile').click();return true})()");
 let voice;
 for(let i=0;i<35;i++){
   voice=await js("({shown:!document.querySelector('#transcriptReview').classList.contains('hidden'),transcript:document.querySelector('#transcriptText').value,visibleText:document.querySelector('#transcriptVisible').textContent,context:window.__voiceContext,capture:window.__voiceCapture,notice:document.querySelector('#notice').textContent})");
   if(voice.shown)break;
   await sleep(160);
 }
 console.log("VOICE_TRANSCRIPT_REVIEW="+JSON.stringify(voice));
 if(!voice.shown||voice.transcript!==audioFixture||voice.visibleText!==audioFixture||voice.context!=="incoming"||voice.capture!=="import"||!voice.notice.includes("NOT proof"))throw Error("Speech result is not visibly correctable");
 await js("document.querySelector('#transcriptText').value='Hi there, please send me my ten dollars right now.';document.querySelector('#retryTranscript').click();true");
 let corrected;
 for(let i=0;i<25;i++){
   corrected=await js("({context:window.__retryPayload?.context,text:window.__retryPayload?.text,recorded:JSON.parse(localStorage.getItem('owed-v1-inbox')||'[]').some(g=>g.fingerprint==='reviewed-fixture')})");
   if(corrected.recorded)break;
   await sleep(150);
 }
 console.log("RECHECK_CORRECTED_SPEECH="+JSON.stringify(corrected));
 if(corrected.context!=="incoming"||corrected.text!==audioFixture||!corrected.recorded)throw Error("Corrected transcript was not reanalyzed as an incoming message");
 await js("document.querySelector('[data-mode=record]').click();true");
 const selfChoice=await js("({defaultContext:document.querySelector('#recordPerspective').value,choices:document.querySelector('#recordPerspective').options.length})");
 console.log("RECORD_SPEAKER_SELECTION="+JSON.stringify(selfChoice));
 if(selfChoice.defaultContext!=="incoming"||selfChoice.choices!==2)throw Error("Built-in recording must offer incoming / self-reminder distinction");
 // Synthetic source-address handoff. The wallet itself must never be called.
 const walletA="0x"+"a".repeat(40),walletB="0x"+"b".repeat(40);
 const makeSource=(transcript)=>[{id:"address-group",source:"text",title:"Payback message",fingerprint:"address-fixture",transcript,obligations:[{id:"address-pay",title:"Payback",kind:"money",direction:"i_owe",status:"open",amount:10,evidence:"you owe me $10",recipientAddress:""}]}];
 await js("localStorage.setItem('owed-v1-inbox',"+JSON.stringify(JSON.stringify(makeSource("You owe me $10. Please send $10 USDC to "+walletA)))+");location.reload();true");
 let readyPayment=false;
 for(let i=0;i<40;i++){try{readyPayment=await js("!!document.querySelector('button[data-action=pay][data-id=address-pay]')");if(readyPayment)break}catch{}await sleep(120)}
 if(!readyPayment)throw Error("Synthetic payment record didn't load");
 await js("window.ethereum={request:async()=>{window.__unexpectedWalletCalls=(window.__unexpectedWalletCalls||0)+1;throw Error('Wallet must not be called without verification')}};document.querySelector('button[data-action=pay][data-id=address-pay]').click();true");
 const autoHint=await js("({open:document.querySelector('#payDialog').open,prefill:document.querySelector('#recipientAddress').value,checked:document.querySelector('#recipientVerified').checked,suggestions:document.querySelectorAll('.source-address-choice').length,status:document.querySelector('#sourceAddressStatus').textContent})");
 console.log("SOURCE_ADDRESS_PREFILL="+JSON.stringify(autoHint));
 if(!autoHint.open||autoHint.prefill!==walletA||autoHint.checked||autoHint.suggestions!==1)throw Error("Single explicit source address was not safely prefilled");
 await js("document.querySelector('#confirmPayment').click();true");
 const blocked=await js("({walletCalls:window.__unexpectedWalletCalls||0,notice:document.querySelector('#paymentNotice').textContent,checked:document.querySelector('#recipientVerified').checked})");
 console.log("ADDRESS_REQUIRES_CONFIRMATION="+JSON.stringify(blocked));
 if(blocked.walletCalls!==0||!blocked.notice.includes("independently verify")||blocked.checked)throw Error("Prefill must not authorize a payment");
 await js("document.querySelector('#recipientVerified').checked=true;document.querySelector('#recipientAddress').value='0x'+'c'.repeat(40);document.querySelector('#recipientAddress').dispatchEvent(new Event('input',{bubbles:true}));true");
 if(await js("document.querySelector('#recipientVerified').checked"))throw Error("Manual address edits must invalidate earlier verification");
 await js("document.querySelector('#payDialog').close();true");
 await js("localStorage.setItem('owed-v1-inbox',"+JSON.stringify(JSON.stringify(makeSource("You owe me $10. Addresses discussed: "+walletA+" and "+walletB)))+");location.reload();true");
 for(let i=0;i<35;i++){if(await js("!!document.querySelector('button[data-action=pay][data-id=address-pay]')"))break;await sleep(110)}
 await js("document.querySelector('button[data-action=pay][data-id=address-pay]').click();true");
 const many=await js("({prefill:document.querySelector('#recipientAddress').value,checked:document.querySelector('#recipientVerified').checked,choices:document.querySelectorAll('.source-address-choice').length})");
 console.log("MULTI_ADDRESS_NO_GUESS="+JSON.stringify(many));
 if(many.prefill||many.checked||many.choices!==2)throw Error("Multiple addresses must never be silently selected");
 await js("document.querySelectorAll('.source-address-choice')[1].click();true");
 const userPick=await js("({chosen:document.querySelector('#recipientAddress').value,verified:document.querySelector('#recipientVerified').checked})");
 if(userPick.chosen!==walletB||userPick.verified)throw Error("Choosing address must be explicit and unverified");
 await js("document.querySelector('#payDialog').close();true");
 await js("localStorage.setItem('owed-v1-inbox',"+JSON.stringify(JSON.stringify(makeSource("You owe me $10. I'll send you my wallet details later.")))+");location.reload();true");
 for(let i=0;i<35;i++){if(await js("!!document.querySelector('button[data-action=pay][data-id=address-pay]')"))break;await sleep(110)}
 await js("document.querySelector('button[data-action=pay][data-id=address-pay]').click();true");
 const absent=await js("({value:document.querySelector('#recipientAddress').value,panelHidden:document.querySelector('#sourceAddressPanel').classList.contains('hidden'),verified:document.querySelector('#recipientVerified').checked})");
 console.log("NO_ADDRESS_NOT_GUESSED="+JSON.stringify(absent));
 if(absent.value||!absent.panelHidden||absent.verified)throw Error("Missing addresses must remain blank");
 await js("document.querySelector('#payDialog').close();true");
 if(errors.length)throw Error("Browser exceptions: "+errors.join("; "));
 console.log("PASS_BROWSER_TASK_MONEY_UNDO_DISCOVERY_MOBILE_REDUCED_MOTION");
}catch(e){failures++;console.log("BROWSER_QA_FAILURE="+e.message)}
finally{socket?.close();try{process.kill(-browser.pid,"SIGTERM")}catch{}await sleep(550);await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:150}).catch(()=>{})}
if(failures)process.exitCode=1;
