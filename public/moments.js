// Deliberately different feedback for non-financial actions.
// Never use the verified-payment visual for a task or a dismissed debt.
import { avatarSvg } from "./characters.js";

let active = null;
export function showActionMoment({ kind, personSeed, onUndo }) {
  active?.remove();
  const notice = document.createElement("aside");
  const isTask = kind === "task";
  notice.className = "action-moment " + (isTask ? "action-task" : "action-dismissed");
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-label", isTask ? "Task completed" : "Money item dismissed without payment");

  const face = document.createElement("div");
  face.className = "action-face";
  face.innerHTML = avatarSvg(personSeed || "friend");
  const icon = document.createElement("span");
  icon.className = "action-face-mark";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = isTask ? "✦" : "↶";
  face.append(icon);
  const message = document.createElement("div");
  message.className = "action-message";
  const heading = document.createElement("strong");
  heading.textContent = isTask ? "One less little thing!" : "Moved out of your way";
  const details = document.createElement("p");
  details.textContent = isTask
    ? "Task completed. Nothing was paid."
    : "Dismissed from tracking · no payment sent.";
  message.append(heading, details);

  const undo = document.createElement("button");
  undo.type = "button";
  undo.className = "action-undo";
  undo.textContent = "Undo ↶";
  undo.addEventListener("click", () => {
    if (typeof onUndo === "function") onUndo();
    notice.remove();
  });
  const close = document.createElement("button");
  close.className = "action-close";
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss notification");
  close.textContent = "×";
  close.addEventListener("click", () => notice.remove());
  notice.append(face, message, undo, close);
  document.body.append(notice);
  active = notice;
  const timer = setTimeout(() => notice.remove(), 9000);
  const originalRemove = notice.remove.bind(notice);
  notice.remove = () => {
    clearTimeout(timer);
    if (active === notice) active = null;
    originalRemove();
  };
  return notice;
}
