/**
 * A task can be completed without a wallet. Money cannot.
 * A dismissed money item is explicitly NOT a verified payment.
 */
const editable = (item) => item && typeof item === "object" && ["open", "failed"].includes(item.status);

export function completeTask(item, now = new Date()) {
  if (!editable(item) || item.kind !== "task") return false;
  item.status = "done";
  item.resolution = "task_completed";
  item.completedAt = now.toISOString();
  return true;
}

export function dismissMoney(item, now = new Date()) {
  if (!editable(item) || item.kind !== "money" || item.txHash) return false;
  item.status = "dismissed";
  item.resolution = "dismissed_without_payment";
  item.dismissedAt = now.toISOString();
  return true;
}

export function reopenDismissed(item) {
  if (!item || item.kind !== "money" || item.status !== "dismissed") return false;
  item.status = "open";
  delete item.resolution;
  delete item.dismissedAt;
  return true;
}

export function restoreLegacyMoney(groups) {
  let restored = 0;
  if (!Array.isArray(groups)) return restored;
  for (const group of groups) {
    for (const item of Array.isArray(group?.obligations) ? group.obligations : []) {
      // Older versions marked money "done" with no wallet payment.
      // Never leave an unpaid item in the completed total.
      if (item?.kind === "money" && item.status === "done" && !item.txHash) {
        item.status = "open";
        delete item.resolution;
        delete item.completedAt;
        restored++;
      }
    }
  }
  return restored;
}
