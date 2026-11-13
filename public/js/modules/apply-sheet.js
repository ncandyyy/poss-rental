/**
 * 신청 창 — [data-sheet-open] 버튼(하단 고정 버튼)을 누르면 열립니다.
 * - 휴대폰: 아래에서 올라오는 창 (손잡이를 아래로 끌어내리면 닫힘) · 데스크톱: 화면 가운데 창
 * - 폼을 따로 만들지 않고 페이지의 신청 폼(#apply-form)을 창 안으로 옮겨왔다가, 닫으면 제자리로 돌려놓습니다.
 *   그래서 페이지에서 쓰던 내용이 그대로 이어지고, 접수도 똑같이 구글 시트·슬랙으로 들어갑니다.
 * - 닫기: X 버튼, 바깥 어두운 곳 누르기, Esc, 아래로 끌어내리기(휴대폰)
 * - 이 창을 지원하지 않는 아주 오래된 브라우저에서는 예전처럼 페이지의 신청 폼 위치로 이동합니다.
 */
import { track } from "./analytics.js";

export function initApplySheet() {
  const sheet = document.querySelector("[data-apply-sheet]");
  const form = document.getElementById("apply-form");
  const body = sheet && sheet.querySelector("[data-sheet-body]");
  if (!sheet || !form || !body || typeof sheet.showModal !== "function") return;

  const root = document.documentElement;
  const mobile = window.matchMedia("(max-width: 599px)");
  const placeholder = document.createElement("div");
  placeholder.className = "sheet-placeholder";
  let closing = false;

  // 창이 움직임을 끝내면 cb 실행 (모션 최소화 설정 등으로 움직임이 없을 때를 대비해 시간 제한도 둠)
  const afterMotion = (cb) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      sheet.removeEventListener("animationend", onEnd);
      clearTimeout(timer);
      cb();
    };
    const onEnd = (e) => {
      if (e.target === sheet && !e.pseudoElement && e.animationName.startsWith("sheet-")) finish();
    };
    sheet.addEventListener("animationend", onEnd);
    const timer = setTimeout(finish, 700);
  };

  const open = (e) => {
    if (e) e.preventDefault();
    if (sheet.open) return;

    placeholder.style.height = `${form.offsetHeight}px`;
    form.replaceWith(placeholder);
    body.append(form);
    body.scrollTop = 0;

    sheet.classList.remove("is-ready", "is-closing", "is-snapping", "is-dragging");
    sheet.style.removeProperty("--drag-y");
    const scrollbar = window.innerWidth - root.clientWidth;
    if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`;
    root.classList.add("is-sheet-open");
    sheet.showModal();
    afterMotion(() => sheet.open && !closing && sheet.classList.add("is-ready"));
    track("sheet_open");
  };

  const close = () => {
    if (!sheet.open || closing) return;
    closing = true;
    sheet.classList.remove("is-dragging", "is-snapping");
    sheet.classList.add("is-closing");
    afterMotion(() => sheet.close());
  };

  // 어떤 방법으로 닫히든 폼을 제자리로 돌려놓고 페이지 스크롤을 풉니다
  sheet.addEventListener("close", () => {
    closing = false;
    sheet.classList.remove("is-ready", "is-closing", "is-snapping", "is-dragging");
    sheet.style.removeProperty("--drag-y");
    if (placeholder.isConnected) placeholder.replaceWith(form);
    root.classList.remove("is-sheet-open");
    root.style.removeProperty("padding-right");
  });

  document.querySelectorAll("[data-sheet-open]").forEach((btn) => btn.addEventListener("click", open));
  sheet.querySelector("[data-sheet-close]")?.addEventListener("click", close);

  // Esc: 바로 사라지지 않고 닫히는 움직임을 보여줌
  sheet.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });

  // 바깥(어두운 곳)을 누르면 닫기
  sheet.addEventListener("click", (e) => {
    if (e.target !== sheet) return;
    const r = sheet.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) close();
  });

  /* ---------- 휴대폰: 손잡이를 아래로 끌어내려 닫기 ---------- */
  const grab = sheet.querySelector("[data-sheet-grab]");
  if (!grab) return;
  let dragging = false;
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let speed = 0;

  grab.addEventListener("pointerdown", (e) => {
    if (!mobile.matches || closing || e.button !== 0 || e.target.closest("[data-sheet-close]")) return;
    dragging = true;
    startY = lastY = e.clientY;
    lastT = e.timeStamp;
    speed = 0;
    grab.setPointerCapture(e.pointerId);
    sheet.classList.remove("is-snapping");
    sheet.classList.add("is-ready", "is-dragging");
  });

  grab.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dt = e.timeStamp - lastT;
    if (dt > 0) speed = (e.clientY - lastY) / dt; // px/ms, 아래로 +
    lastY = e.clientY;
    lastT = e.timeStamp;
    sheet.style.setProperty("--drag-y", `${Math.max(0, e.clientY - startY)}px`);
  });

  const release = () => {
    if (!dragging) return;
    dragging = false;
    const moved = Math.max(0, lastY - startY);
    sheet.classList.remove("is-dragging");
    if (moved > Math.min(120, sheet.offsetHeight * 0.25) || (moved > 10 && speed > 0.5)) {
      close();
    } else if (moved > 0) {
      sheet.classList.add("is-snapping");
      afterMotion(() => {
        sheet.classList.remove("is-snapping");
        sheet.style.removeProperty("--drag-y");
      });
    }
  };
  grab.addEventListener("pointerup", release);
  grab.addEventListener("pointercancel", release);
}
