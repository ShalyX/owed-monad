/**
 * Finish a non-settled item without pretending a blockchain transfer happened.
 * Works for uncertain money items and ordinary tasks alike.
 */
export function resolveManually(item, now = new Date()) {
  if (!item || typeof item !== "object") return false;
  if (!["open", "failed"].includes(item.status)) return false;
  item.status = "done";
  item.resolution = "manual";
  item.completedAt = now.toISOString();
  return true;
}
