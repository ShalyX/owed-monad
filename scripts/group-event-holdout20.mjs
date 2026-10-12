import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {resolveGroupConversation} from "../lib/group-obligations.mjs";
const source=JSON.parse(await readFile(new URL("../audits/group-event-holdout20-frozen-20261013.json",import.meta.url),"utf8"));
const digest=createHash("sha256").update(JSON.stringify(source.cases)).digest("hex");
const results=[];
for(const tc of source.cases){
 let data,status=200;try{data=resolveGroupConversation(tc.text,tc.participant)}catch(e){status=e.status||500;data={obligations:[],error:e.message}}
 const money=(data?.obligations||[]).filter(x=>x.kind==="money").map(x=>({direction:x.direction,amount:x.amount,status:x.status}));
 const tasks=(data?.obligations||[]).filter(x=>x.kind==="task").map(x=>({title:x.title,status:x.status}));
 const unmatched=[...money];
 const mmiss=tc.expected.money.filter(x=>{const idx=unmatched.findIndex(y=>y.direction===x.direction&&y.amount===x.amount&&y.status===x.status);if(idx<0)return true;unmatched.splice(idx,1);return false});
 const tmiss=tc.expected.tasks.filter(x=>!tasks.some(y=>y.title.toLowerCase().includes(x.toLowerCase())));
 const extras=unmatched;
 const pass=status===tc.expected.status&&!mmiss.length&&!tmiss.length&&!extras.length&&tasks.length===tc.expected.tasks.length;
 results.push({id:tc.id,pass,status,money,tasks,mmiss,tmiss,extras});
 console.log(JSON.stringify({id:tc.id,pass,status,money,tasks,missMoney:mmiss.length,missTasks:tmiss.length,extraMoney:extras.length}));
}
const summary={strict:results.filter(x=>x.pass).length,total:results.length,
 failures:results.filter(x=>!x.pass).map(x=>x.id),
 wrongOpenDebts:results.reduce((n,x)=>n+x.extras.filter(y=>y.direction==="i_owe"&&y.status==="open").length,0)};
console.log("HOLDOUT",JSON.stringify({digest,...summary}));
await writeFile(new URL("../audits/group-event-holdout20-result-20261013.json",import.meta.url),JSON.stringify({digest,summary,results},null,2));
