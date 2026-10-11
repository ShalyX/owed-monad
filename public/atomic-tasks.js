import { sourceStatements } from "./source-statements.js";

// Task cards represent one independently completable action, not an entire
// sentence. A source sentence may support multiple atomic tasks.
const verbs=new Set(["send","share","forward","email","upload","bring","submit"]);
const canonical=s=>String(s||"").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
const cleanObject=s=>s.trim().replace(/[.!?;]+$/,"").replace(/^(?:the|your|my|our|a|an)\s+/i,"").trim();
function parseCoordinatedObjects(quote){
  const statement=String(quote||"").trim();
  if(statement.length>230||/[\n?!;]/.test(statement))return null;
  // One delivery verb governs two concrete objects. This does not split
  // conjunctions buried inside names ("a photo of Tunde and Sam").
  const start=/\b(send|share|forward|email|upload|bring|submit)\s+(?:(?:me|us|them|him|her)\s+)?/i.exec(statement);
  if(!start)return null;
  const verb=start[1].toLowerCase();
  if(!verbs.has(verb))return null;
  const rest=statement.slice(start.index+start[0].length).replace(/[.!]+$/,"");
  const split=/\s+and\s+(?=(?:the|your|my|our|a|an)\s+)/i.exec(rest);
  if(!split)return null;
  const left=cleanObject(rest.slice(0,split.index));
  const right=cleanObject(rest.slice(split.index+split[0].length));
  if(!left||!right||left.length>65||right.length>65||/\b(?:if|when|unless|or)\b/i.test(left+" "+right))return null;
  // Avoid statements where one of the halves isn't an independent deliverable.
  if(left.split(/\s+/).length>8||right.split(/\s+/).length>8)return null;
  return {verb,objects:[left,right]};
}
export function atomizeTasks(items){
 const output=[],seen=new Set();
 for(const item of items||[]){
   if(item?.kind!=="task"){output.push(item);continue;}
   const split=item.taskKey ? null : parseCoordinatedObjects(item.evidence);
   const parts=split?split.objects.map((object,index)=>({...item,
      id:item.id ? item.id+"::"+(index+1) : undefined,
      title:split.verb[0].toUpperCase()+split.verb.slice(1)+" "+object,
      taskKey:split.verb+":"+canonical(object)})):[{...item,taskKey:item.taskKey||"task:"+canonical(item.title)}];
   for(const part of parts){
     const identity=part.taskKey+"|"+canonical(part.evidence);
     if(seen.has(identity))continue;
     seen.add(identity);
     output.push(part);
   }
 }
 return output;
}
export function discoverCompoundTasks(source){
 const result=[];
 for(const span of sourceStatements(source)){
   const quote=span.text.trim();
   if(/\b(?:if|unless|hypothetically|pretend|for example|not to|don't)\b/i.test(quote))continue;
   const parts=atomizeTasks([{kind:"task",status:"open",title:"Send requested items",evidence:quote,direction:"i_owe"}]);
   if(parts.length===2 && parts.every(x=>x.taskKey?.includes(":")))result.push(...parts);
 }
 return result;
}
export function atomizeOpenTasks(items){
 return (items||[]).flatMap(item=>item?.kind==="task"&&item.status==="open"?atomizeTasks([item]):[item]);
}
export function taskIdentity(item) {
 if(item?.kind!=="task")return "";
 if(item.taskKey)return item.taskKey;
 const generated=atomizeTasks([item]);
 return generated.length===1?generated[0].taskKey:"compound:"+canonical(item.evidence);
}
