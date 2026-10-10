// Ten realistic user-facing Owed conversations; live HTTP inference, not mocked.
import { writeFile } from "node:fs/promises";
const url=process.env.OWED_AUDIT_URL || "http://127.0.0.1:3001/api/analyze-text";
const cases=[
  {id:"01",name:"Bolt plus separate link",text:"Bro I paid for the Bolt yesterday because your app was acting up 😂. Your part was $8. Just send it whenever you can. Also, don't forget to send me that apartment link we were checking out. I already sorted the booking for Saturday."},
  {id:"02",name:"Tiny USDC repayment",text:"Yo, remember that coffee bet? You still owe me 0.01 USDC 😂. Send it to me on Monad when you get a chance. No rush though, just reminding you before I forget."},
  {id:"03",name:"Split dinner bill",text:"Heyy, the dinner bill came to $60 altogether. Since it was just the three of us and we agreed to split equally, everybody's share is $20. I covered the whole thing at the restaurant, so you can just send me your $20 when you're free."},
  {id:"04",name:"Partial payment and correction",text:"Just checked what we spent yesterday. You still owe me $18 for the ride. Actually, make it $12, I forgot you already sent me $6 last night. My bad 😂. Just send the remaining $12."},
  {id:"05",name:"Voluntary request",text:"Guy abeg, you fit help me with like $5? 😭 I'm trying to sort out transport for tomorrow and I'm a bit short. If you can't, no wahala at all. I'll pay you back next week if you send it."},
  {id:"06",name:"Debt owed to user",text:"Hey, I haven't forgotten the $25 I borrowed from you last weekend. I know I promised to return it yesterday but my salary delayed. I'll send it on Monday, please don't vex 😭."},
  {id:"07",name:"Conditional ticket",text:"So the movie tickets are $15 each. If you decide to come with us on Friday, just send me $15 after I confirm there's still a seat available. Don't pay anything yet though, I'll let you know tomorrow."},
  {id:"08",name:"Cancelled lunch debt",text:"Oh I was going to remind you about the $10 for lunch yesterday. You still owe me $10, but actually never mind, forget it. My treat. You've covered me plenty of times before 😂."},
  {id:"09",name:"Already paid plus meeting",text:"I just checked my wallet and saw the $30 you sent yesterday. We're good now, that's everything you owed me from the shopping. Thanks for sorting it out. Btw are we still meeting on Sunday?"},
  {id:"10",name:"Group chat shared Airbnb",text:"Amaka: Guys I've paid for the Airbnb. It was $120 total.\nTunde: Niceee. So that's $40 each for the three of us right?\nShaly: Yeah but I already sent you $15 last night, Amaka.\nAmaka: Oh true, just saw it. So Shaly you only have $25 left to send me.\nTunde: I'll sort out my own $40 tomorrow.\nAmaka: Shaly also please send me the check-in details you got from the host.\nShaly: Okay I'll forward them tonight."}
];
const out=[];
for(const x of cases){
  const t=Date.now();
  let status=0, result;
  try {
    const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text:x.text,context:"incoming"}),signal:AbortSignal.timeout(190000)});
    status=response.status;
    result=await response.json();
  }catch(error){result={error:String(error)};}
  out.push({...x,status,latencyMs:Date.now()-t,response:result});
  console.log(JSON.stringify({id:x.id,name:x.name,status,seconds:Math.round((Date.now()-t)/1000),error:result?.error,note:result?.analysisNote,items:result?.obligations?.map(i=>({kind:i.kind,direction:i.direction,amount:i.amount,intent:i.intent,title:i.title,evidence:i.evidence,contextNote:i.contextNote}))}));
  await writeFile(process.env.OWED_AUDIT_OUTPUT || "/tmp/owed-realistic-audit-20261010.json",JSON.stringify({url,startedAt:"2026-10-10",cases:out},null,2));
  if(status===429){console.error("Rate limited; stopped rather than claiming remaining cases tested.");break;}
}
console.log("COMPLETE",out.length,"of",cases.length);
if(out.length!==10||out.some(x=>x.status!==200))process.exitCode=1;
