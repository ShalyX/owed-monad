import { taskIdentity } from "./atomic-tasks.js";

// Re-analysis may recover a previously missed item. Keep existing user decisions,
// especially completed tasks and onchain receipts, while appending only new items.
const canonical = (value) => String(value || "").toLowerCase()
  .replace(/[^a-z0-9$]+/g," ").replace(/\s+/g," ").trim();
function evidenceOverlap(left,right) {
  const a=canonical(left),b=canonical(right);
  if (!a || !b) return false;
  return a===b || (Math.min(a.length,b.length)>=12 && (a.includes(b)||b.includes(a)));
}
export function missingObligations(existing,updated) {
  const old = Array.isArray(existing?.obligations) ? existing.obligations : [];
  const next = Array.isArray(updated?.obligations) ? updated.obligations : [];
  const additions=[];
  for (const candidate of next) {
    if (!candidate || !["money","task"].includes(candidate.kind)) continue;
    const already = [...old,...additions].some(item=>
      item?.kind===candidate.kind &&
      evidenceOverlap(item.evidence,candidate.evidence) &&
      (candidate.kind==="task"
        ? (taskIdentity(item)===taskIdentity(candidate) ||
          (item.status==="done" && taskIdentity(item).startsWith("compound:") && evidenceOverlap(item.evidence,candidate.evidence)))
        : item.amount===candidate.amount));
    if (!already) additions.push(candidate);
  }
  return additions;
}
