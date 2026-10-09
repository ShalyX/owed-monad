// Small, bounded admission gate for a public demo on a resource-limited VPS.
// Assumes Owed HTTP service binds to 127.0.0.1, with only a trusted tunnel in front.
import { isIP } from "node:net";
function clientId(req, publicDemo) {
  const remote = String(req.socket?.remoteAddress||"unknown");
  const tunnel = /^(?:::ffff:)?127\.|^::1$/.test(remote);
  const forwarded = String(req.headers["cf-connecting-ip"]||"").trim();
  return publicDemo && tunnel && isIP(forwarded) ? forwarded : remote;
}
export function createPublicGate({
  publicDemo = process.env.OWED_PUBLIC_DEMO === "1",
  now = () => Date.now(),
  perHour = 12, 
  globalActiveMax = 2,
  perIpActiveMax = 1,
  receiptPerMinute = 45
} = {}) {
  const usage=new Map();
  let active=0;
  function admit(req,pathname) {
    const isAnalysis=req.method==="POST" &&
      (pathname==="/api/analyze-text"||pathname==="/api/analyze-audio");
    const isReceipt=req.method==="GET" && pathname==="/api/receipt";
    if(!isAnalysis&&!isReceipt) return {ok:true,release:()=>{}};
    if (req.method === "POST") {
      const site=String(req.headers["sec-fetch-site"]||"");
      if(site==="cross-site")return {ok:false,status:403,message:"Cross-site analysis requests are not allowed."};
      const origin=req.headers.origin,host=req.headers.host;
      if(origin) {
        try {
          const parsed=new URL(origin);
          if(!host||parsed.host!==host||!["http:","https:"].includes(parsed.protocol))
            return {ok:false,status:403,message:"This origin is not allowed."};
        } catch {return {ok:false,status:403,message:"Invalid request origin."};}
      }
    }
    if(!publicDemo) return {ok:true,release:()=>{}};
    const key=clientId(req,publicDemo);
    const bucket=pathname==="/api/receipt"?"r":"a";
    const id=bucket+":"+key;
    const time=now(),period=bucket==="r"?60000:3600000;
    const quota=bucket==="r"?receiptPerMinute:perHour;
    for(const [name,record] of usage) {
      if(record.ticks.every(t=>t<=time-3600000)&&record.active===0)usage.delete(name);
    }
    if(usage.size>2500 && !usage.has(id))return {ok:false,status:503,message:"Demo is busy. Please retry later.",retryAfter:60};
    const record=usage.get(id)||{ticks:[],active:0};
    record.ticks=record.ticks.filter(t=>t>time-period);
    const oldest=record.ticks[0]||time;
    if(record.ticks.length>=quota)return {
      ok:false,status:429,message:"Demo request limit reached. Please try again later.",
      retryAfter:Math.max(1,Math.ceil((oldest+period-time)/1000))
    };
    if(isAnalysis && (active>=globalActiveMax||record.active>=perIpActiveMax))
      return {ok:false,status:429,message:"Owed is analyzing another moment. Try again shortly.",retryAfter:30};
    record.ticks.push(time);
    if(isAnalysis){active++;record.active++;}
    usage.set(id,record);
    let released=false;
    return {ok:true,release:()=>{
      if(released)return;released=true;
      if(isAnalysis){active=Math.max(0,active-1);record.active=Math.max(0,record.active-1);}
    }};
  }
  return {admit};
}
