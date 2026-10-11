// Speaker-labelled chats need an identity selected by the user.
// These labels identify claimed chat participants, not wallet owners.
export function parseGroupTurns(value) {
  const text=String(value||"");
  const turns=[], names=new Map();
  let offset=0, labelled=0;
  for(const raw of text.split("\n")){
    const start=offset; offset+=raw.length+1;
    const match=/^\s*([@]?[\p{L}][\p{L}\p{M}0-9_. '-]{0,30})\s*:\s*(.+?)\s*$/u.exec(raw);
    if (match && !/^https?$/i.test(match[1])) {
      const speaker=match[1].trim().replace(/^@/,"");
      const body=match[2].trim();
      if (!body) continue;
      const key=speaker.toLocaleLowerCase();
      if(!names.has(key))names.set(key,speaker);
      labelled++;
      turns.push({speaker:names.get(key),body,evidence:raw.trim(),start,end:start+raw.length});
    }else if(raw.trim()&&turns.length) {
      // Unlabelled continuation belongs to the previous speaker, not a new one.
      turns[turns.length-1].body+=" "+raw.trim();
      turns[turns.length-1].evidence+="\n"+raw;
      turns[turns.length-1].end=start+raw.length;
    }
  }
  return names.size>=2 && labelled>=2 ? {participants:[...names.values()],turns} : null;
}
export function validatedGroupIdentity(text,participant) {
  const group=parseGroupTurns(text);
  if(!group)return null;
  const selected=String(participant||"").trim().toLocaleLowerCase();
  if(selected==="__observer__")return {...group,participant:null,observer:true};
  const chosen=group.participants.find(n=>n.toLocaleLowerCase()===selected);
  if(!chosen)return {...group,participant:null,observer:false};
  return {...group,participant:chosen,observer:false};
}
