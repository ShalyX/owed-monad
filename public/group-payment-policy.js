// All group-extracted money stays review-only until a separately audited
// conversation reconciliation and identity model passes independent safety tests.
// This applies to NEW and pre-existing browser records.
export function groupPaymentBlocked(item, group) {
  return item?.kind === "money" && Boolean(group?.perspective === "group" ||
    group?.groupContext || item?.groupDirect || item?.groupActor);
}
export const GROUP_PAYMENT_MESSAGE = "Group-chat payments are paused while Owed verifies conversation-wide corrections, cancellations and speaker identity. Review the request with the people involved; no wallet transfer is available here.";
