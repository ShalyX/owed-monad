// Browser-only normalization; don't fetch attachments or truncate evidence.
const header=/^\s*(?:\[\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\s*,?\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\s*\]\s*|(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\s*,?\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\s*[-–]\s*)([^:]{1,55}):\s*(.*)$/i;
const systemLine=/^(?:messages (?:and calls |)are end.to.end encrypted|you (?:created|added|removed|changed)|(?:this|the) group was created|missed (?:voice|video) call|image omitted|video omitted|audio omitted|document omitted)/i;
function clean(s){return s.replace(/\r\n?/g,"\n").replace(/[\u200e\u200f\u202a-\u202e]/g,"").replace(/^\uFEFF/,"");}
export function normalizeChatExport(raw,{maxLength=12000}={}){
 const source=clean(String(raw||"")),lines=source.split("\n"),entries=[];
 let active=null,ignored=0,recognized=0;
 for(let i=0;i<lines.length;i++){
  const found=header.exec(lines[i]);
  if(found){
   recognized++;
   const speaker=found[5].trim();
   if(!speaker||/^(?:https?|system)$/i.test(speaker)||systemLine.test(found[6])){active=null;ignored++;continue;}
   active={speaker,timestamp:[found[1]||found[3],found[2]||found[4]].join(" "),
     content:found[6].trim(),originalStart:i+1};
   entries.push(active);
  }else if(active&&lines[i].trim()&&!/^\s*\[(?:media omitted|sticker omitted)\]/i.test(lines[i])){
   active.content+="\n"+lines[i];
  }else if(!active&&lines[i].trim())ignored++;
 }
 const participants=[...new Set(entries.map(x=>x.speaker))];
 if(recognized<2||participants.length<2||entries.length<2)return {recognized:false,reason:"No multi-person WhatsApp export found.",original:source};
 const normalized=entries.map(x=>x.speaker+": "+x.content).join("\n");
 if(normalized.length>maxLength)return {recognized:true,tooLong:true,original:source,
   participantCount:participants.length,count:entries.length,normalizedLength:normalized.length,maxLength};
 return {recognized:true,tooLong:false,normalized,original:source,participants,
   entries:entries.map(({speaker,timestamp,originalStart})=>({speaker,timestamp,originalStart})),
   count:entries.length,systemSkipped:ignored,format:"WhatsApp-style export"};
}
export function isChatTextFile(file){
 const name=String(file?.name||"").toLowerCase();
 return /\.(?:txt|text)$/i.test(name)&&(!file.type||/text\/plain|application\/octet-stream/i.test(file.type));
}
