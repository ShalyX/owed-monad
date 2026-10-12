import {readFile,writeFile} from "node:fs/promises";
import {resolveGroupConversation} from "../lib/group-obligations.mjs";
const source=JSON.parse(await readFile(new URL("../audits/group-unseen40-frozen-20261011.json",import.meta.url)));
const rows=[];
for(const tc of source.cases){
 let status=200,data={};
 try{data=resolveGroupConversation(tc.transcript,tc.participant)}
 catch(e){status=e.status||500;data={obligations:[],error:e.message}}
 const money=(data.obligations||[]).filter(x=>x.kind==="money").map(x=>({direction:x.direction,amount:x.amount,status:x.status,title:x.title}));
 const tasks=(data.obligations||[]).filter(x=>x.kind==="task").map(x=>x.title);
 const missingMoney=tc.expected.money.filter(w=>!money.some(x=>x.direction===w.direction&&x.amount===w.amount));
 const missingTasks=tc.expected.tasks.filter(w=>!tasks.some(x=>x.toLowerCase().includes(w.toLowerCase())));
 const extraMoney=money.filter(x=>!tc.expected.money.some(w=>w.direction===x.direction&&w.amount===x.amount));
 const pass=status===tc.expected.status&&!missingMoney.length&&!missingTasks.length&&!extraMoney.length&&tasks.length===tc.expected.tasks.length;
 const unsafe=money.filter(x=>x.direction==="i_owe"&&x.status==="open"&&!tc.expected.money.some(w=>w.direction===x.direction&&w.amount===x.amount));
 rows.push({id:tc.id,pass,status,money,tasks,missingMoney,missingTasks,extraMoney,unsafe:unsafe.length});
 console.log(JSON.stringify({id:tc.id,pass,status,money,tasks,missM:missingMoney.length,missT:missingTasks,unsafe:unsafe.length}));
}
const summary={strict:rows.filter(x=>x.pass).length,total:rows.length,unsafe:rows.reduce((n,x)=>n+x.unsafe,0),failures:rows.filter(x=>!x.pass).map(x=>x.id)};
console.log("REPLAY",JSON.stringify(summary));
await writeFile(new URL("../audits/group-unseen40-development-replay-20261013.json",import.meta.url),JSON.stringify({baseline:"d00a5bd",candidate:"event-reconciler",summary,rows},null,2));
