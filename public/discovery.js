// Tiny social moment that reflects only the actual analysis result.
// No synthetic people or obligation data is introduced.
import { avatarSvg } from "./characters.js";
export function showDiscoveryMoment(group, onView) {
  if (!Array.isArray(group?.obligations) || !group.obligations.length) return;
  document.querySelector(".discovery-moment")?.remove();
  const box = document.createElement("aside");
  box.className = "discovery-moment";
  box.setAttribute("role", "status");
  box.setAttribute("aria-label", "New obligations discovered");
  const avatars = document.createElement("div");
  avatars.className = "discovery-faces";
  avatars.innerHTML = avatarSvg(group.id || "owed-moment") + '<span class="discovery-spark" aria-hidden="true">✦</span>';
  const copy = document.createElement("div");
  copy.className = "discovery-copy";
  const h = document.createElement("strong");
  h.textContent = group.obligations.length + (group.obligations.length === 1 ? " loose end found!" : " loose ends found!");
  const p = document.createElement("p");
  const money = group.obligations.filter(x => x.kind === "money").length;
  const tasks = group.obligations.filter(x => x.kind === "task").length;
  p.textContent = [money ? money + (money === 1 ? " money moment" : " money moments") : "", tasks ? tasks + (tasks === 1 ? " to-do" : " to-dos") : ""].filter(Boolean).join(" · ") + " · Worth a look.";
  copy.append(h, p);
  const button = document.createElement("button");
  button.className = "discovery-view";
  button.type = "button";
  button.textContent = "See them ↗";
  button.addEventListener("click", () => {
    box.remove();
    if (typeof onView === "function") onView();
    else document.getElementById("my-inbox")?.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"});
  });
  const close = document.createElement("button");
  close.className = "discovery-close";
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Dismiss discovery notification");
  close.addEventListener("click", () => box.remove());
  box.append(avatars, copy, button, close);
  document.body.append(box);
  setTimeout(() => box.remove(), 9500);
}
