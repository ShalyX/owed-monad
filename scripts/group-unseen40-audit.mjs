import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {makeServer} from "../server.mjs";
const source=JSON.parse(await readFile(new URL("../audits/group-unseen40-frozen-20261011.json",import.meta.url),"utf8"));
const cases=source.cases;
const digest=createHash("sha256").update(JSON.stringify(cases)).digest("hex");
const server=makeServer({publicDemo:false});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port;
const output=process.env.OWED_UNSEEN_OUTPUT||"/tmp/owed-group-unseen40-baseline-20261011.json";
const results=[];
const matches=(item,expected)=>item.kind==="money"&&item.direction===expected.direction&&typeof item.amount==="number"&&Math.abs(item.amount-expected.amount)<1e-8;
console.log("FROZEN",JSON.stringify({count:cases.length,digest,release:source.releaseUnderTest,target:base}));
for(const tc of cases){
 const start=Date.now();
 let status=0,parsed={},error=null;
 try{
  const res=await fetch(base+"/api/analyze-text",{method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({text:tc.transcript,context:"incoming",participant:tc.participant}),
   signal:AbortSignal.timeout(30000)});
  status=res.status;parsed=await res.json();
 }catch(e){error=String(e);}
 const obs=Array.isArray(parsed.obligations)?parsed.obligations:[];
 const money=obs.filter(x=>x.kind==="money").map(x=>({kind:x.kind,direction:x.direction,amount:x.amount,title:x.title,evidence:x.evidence,recipientName:x.recipientName}));
 const tasks=obs.filter(x=>x.kind==="task").map(x=>({kind:x.kind,title:x.title,evidence:x.evidence,taskKey:x.taskKey}));
 let unusedMoney=[...money],unusedTasks=[...tasks];
 const moneyMatched=tc.expected.money.map(x=>{const idx=unusedMoney.findIndex(y=>matches(y,x));if(idx<0)return false;unusedMoney.splice(idx,1);return true;});
 const tasksMatched=tc.expected.tasks.map(phrase=>{
  const idx=unusedTasks.findIndex(x=>(x.title+" "+x.evidence).toLocaleLowerCase().includes(phrase.toLocaleLowerCase()));
  if(idx<0)return false;unusedTasks.splice(idx,1);return true;
 });
 const extraPayable=money.filter(x=>x.direction==="i_owe"&&!tc.expected.money.some(y=>matches(x,y)));
 const pass=!error&&status===tc.expected.status&&(status===422||(
  moneyMatched.every(Boolean)&&tasksMatched.every(Boolean)&&unusedMoney.length===0&&unusedTasks.length===0));
 const outcome={id:tc.id,label:tc.label,status,expectedStatus:tc.expected.status,pass,money,moneyExpected:tc.expected.money,
  tasks,tasksExpected:tc.expected.tasks,missingMoney:moneyMatched.filter(x=>!x).length,
  missingTasks:tasksMatched.filter(x=>!x).length,extraMoney:unusedMoney.length,extraTasks:unusedTasks.length,
  extraPayable:extraPayable.length,error,note:parsed.analysisNote||"",durationMs:Date.now()-start};
 results.push(outcome);
 console.log(JSON.stringify({id:tc.id,pass,status,money:money.map(x=>[x.direction,x.amount]),tasks:tasks.map(x=>x.title),
  extraPayable:extraPayable.length,missingMoney:outcome.missingMoney,missingTasks:outcome.missingTasks,
  extraMoney:outcome.extraMoney,extraTasks:outcome.extraTasks,error}));
 await writeFile(output,JSON.stringify({frozenDigest:digest,release:source.releaseUnderTest,base,results,completed:results.length},null,2));
}
const summary={total:results.length,strictPass:results.filter(x=>x.pass).length,
 totalFailures:results.filter(x=>!x.pass).length,extraPayable:results.reduce((a,b)=>a+b.extraPayable,0),
 failed:results.filter(x=>!x.pass).map(x=>x.id),statusErrors:results.filter(x=>x.status!==x.expectedStatus).map(x=>x.id)};
console.log("GROUP_BLIND_SUMMARY",JSON.stringify(summary));
await new Promise(resolve=>server.close(resolve));
await writeFile(output,JSON.stringify({frozenDigest:digest,release:source.releaseUnderTest,base,results,completed:results.length,summary},null,2));
if(summary.totalFailures)process.exitCode=1;
