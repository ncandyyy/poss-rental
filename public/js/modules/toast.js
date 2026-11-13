/** 화면 아래에 잠깐 떴다 사라지는 안내 메시지 */
let timer;

export function toast(message, ms = 2800) {
  const el = document.querySelector("[data-toast]");
  if (!el) return;
  const host = document.querySelector("dialog[open]") || document.body;
  if (el.parentElement !== host) host.append(el);
  el.textContent = message;
  el.classList.add("is-show");
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove("is-show"), ms);
}
