// Real VPS inference audit: posts only text, never invokes wallet endpoints.
import { writeFile } from "node:fs/promises";
const BASE=process.env.OWED_BASE||"http://127.0.0.1:3001";
const scenarios=[
 ["voluntary_help","Hey bro, could you spare me $3 for lunch? I'm short this afternoon.",{voluntary:[3]}],
 ["actual_debt","You still owe me $18 for fuel. Could you pay me on Friday?",{pay:[18]}],
 ["other_person_owes","I owe you $12 for lunch. I'll transfer it tonight.",{receivable:[12],pay:[]}],
 ["group_split","We split the $90 dinner bill three ways. You owe me your share.",{pay:[30]}],
 ["estimate_only","Hey, you'll probably need about $80 to repair the phone. Just letting you know.",{money:[]}],
 ["amount_correction","You owe me $40 for the cab. Actually make it $30 instead.",{pay:[30]}],
 ["conditional_money","Could you please pay me $25 when the shirts arrive?",{pay:[]}],
 ["withdrawn_request","Can you send me $7 to help with groceries? Never mind, I got it covered.",{money:[]}],
 ["retold_request","I told Sarah: can I borrow $10 from you? But she said no.",{money:[]}],
 ["reimbursement","Could you send me $5 back for the lunch I covered for you?",{pay:[5],voluntary:[]}],
 ["mixed_tasks","You owe me $12 for the tickets. Also please send me the venue address.",{pay:[12],taskAtLeast:1}],
 ["uncertain_amount","Can you send me $5 or $10? I'm not sure which yet.",{pay:[],taskAtMost:0}],
 ["two_debts","You still owe me $7 for lunch and $4 for coffee.",{pay:[7,4]}],
 ["future_event","If we get the tickets, you'll owe me $25. Please don't pay until I confirm.",{pay:[]}],
 ["past_payment","I already paid you $10 yesterday, just checking you got it.",{pay:[]}],
 ["revised_favor","Can I get a dollar from you? Actually, make it two dollars.",{pay:[]}],
 ["separate_request","Can you spare me $6 for food? Also remind me to bring the charger tomorrow.",{voluntary:[6],taskAtLeast:1}],
 ["conditional_plus_debt","You still owe me $9 for coffee. If I find the shoes, you can send me another $25 later.",{pay:[9]}]
];
const results=[];
const matches=(have,want)=>Array.isArray(want)?want.every(x=>have.some(v=>Math.abs(v-x)<1e-8)) && have.every(x=>want.some(v=>Math.abs(v-x)<1e-8)):true;
const selected=new Set((process.env.OWED_CASES||"").split(",").filter(Boolean));
for(const [id,input,expected] of scenarios.filter(x=>!selected.size||selected.has(x[0]))){ 
 const t=Date.now();let response,error;
 try{
  const res=await fetch(BASE+"/api/analyze-text",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text:input}),signal:AbortSignal.timeout(190000)});
  response=await res.json();if(!res.ok)throw Error(res.status+" "+(response.error||"unknown"));
 }catch(e){error=String(e.message)}
 const items=response?.obligations||[];
 const pay=items.filter(x=>x.kind==="money"&&x.direction==="i_owe"&&x.intent!=="voluntary_request"&&Number.isFinite(x.amount)).map(x=>x.amount);
 const voluntary=items.filter(x=>x.kind==="money"&&x.intent==="voluntary_request").map(x=>x.amount);
 const receivable=items.filter(x=>x.kind==="money"&&x.direction==="owed_to_me"&&x.intent!=="voluntary_request"&&Number.isFinite(x.amount)).map(x=>x.amount);
 const money=items.filter(x=>x.kind==="money").map(x=>x.amount);
 const tasks=items.filter(x=>x.kind==="task");
 const checks=[];
 if(expected.pay)checks.push(["pay",matches(pay,expected.pay)]);
 if(expected.voluntary)checks.push(["voluntary",matches(voluntary,expected.voluntary)]);
 if(expected.receivable)checks.push(["receivable",matches(receivable,expected.receivable)]);
 if(expected.money)checks.push(["money",matches(money,expected.money)]);
 if(expected.taskAtLeast)checks.push(["tasks",tasks.length>=expected.taskAtLeast]);
 if(Number.isInteger(expected.taskAtMost))checks.push(["no extra tasks",tasks.length<=expected.taskAtMost]);
 checks.push(["evidence",items.every(x=>input.toLowerCase().includes(String(x.evidence||"").toLowerCase()))]);
 checks.push(["no guessed wallet",items.every(x=>!x.recipientAddress)]);
 const passed=!error && checks.every(x=>x[1]);
 const record={id,input,expected,passed,checks,elapsedS:Math.round((Date.now()-t)/1000),error:error||null,note:response?.analysisNote||"",items:items.map(x=>({title:x.title,kind:x.kind,direction:x.direction,intent:x.intent,amount:x.amount,evidence:x.evidence,contextNote:x.contextNote}))};
 results.push(record);
 console.log(JSON.stringify({id,passed,elapsedS:record.elapsedS,pay,voluntary,receivable,tasks:tasks.length,note:record.note,error,checks},null,0));
}
const reportPath=process.env.OWED_AUDIT_REPORT||"C:/Users/USER/owed-monad/live-conversations-audit-results.json";
await writeFile(reportPath,JSON.stringify({startedAt:new Date().toISOString(),base:BASE,results},null,2));
console.log("TOTAL="+results.length+" PASS="+results.filter(x=>x.passed).length+" FAIL="+results.filter(x=>!x.passed).length+" REPORT="+reportPath);
