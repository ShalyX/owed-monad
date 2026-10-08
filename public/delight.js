// A confirmation flourish; never a source of payment truth.
// Call only AFTER the existing receipt verifier matches the USDC transfer.
import { avatarSvg } from "./characters.js";
export function showSettlementMoment(openReceipt) {
  document.querySelector(".settlement-moment")?.remove();
  const notice = document.createElement("aside");
  notice.className = "settlement-moment";
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-label", "Verified payment");
  const seal = document.createElement("div");
  seal.className = "settlement-stamp";
  seal.textContent = "✓";
  const friends = document.createElement("div");
  friends.className = "settlement-friends";
  friends.setAttribute("aria-hidden", "true");
  friends.innerHTML = avatarSvg("settle-cast-a") + avatarSvg("settle-cast-b");
  seal.append(friends);
  const details = document.createElement("div");
  details.className = "settlement-words";
  const title = document.createElement("strong");
  title.textContent = "All settled! ✳";
  const description = document.createElement("p");
  description.textContent = "Payment verified on Monad. One less loose end.";
  details.append(title, description);
  const view = document.createElement("button");
  view.type = "button";
  view.className = "settlement-receipt-button";
  view.textContent = "Receipt ↗";
  view.addEventListener("click", () => { notice.remove(); openReceipt(); });
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "settlement-dismiss";
  dismiss.setAttribute("aria-label", "Dismiss confirmation");
  dismiss.textContent = "×";
  dismiss.addEventListener("click", () => notice.remove());
  const confetti = document.createElement("span");
  confetti.className = "settlement-confetti";
  confetti.setAttribute("aria-hidden", "true");
  confetti.textContent = "✦  ♥  ✳";
  notice.append(seal, details, view, dismiss, confetti);
  document.body.append(notice);
  setTimeout(() => notice.remove(), 8500);
}
