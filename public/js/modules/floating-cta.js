/**
 * 하단 고정 상담 버튼
 * 히어로 영역을 지나면 나타나고, 신청 폼이 화면에 보이면 숨습니다.
 * 누르면 신청 창이 열립니다 (apply-sheet.js).
 */
import { track } from "./analytics.js";

export function initFloatingCta() {
  const cta = document.querySelector("[data-floating-cta]");
  const hero = document.getElementById("hero");
  const form = document.getElementById("apply-form");
  if (!cta || !hero || !form || !("IntersectionObserver" in window)) return;

  let heroVisible = true;
  let formVisible = false;
  const update = () => cta.classList.toggle("is-show", !heroVisible && !formVisible);

  new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    update();
  }, { rootMargin: "0px 0px -35% 0px" }).observe(hero);

  new IntersectionObserver(([entry]) => {
    formVisible = entry.isIntersecting;
    update();
  }, { threshold: 0.2 }).observe(form);

  cta.querySelector("[data-cta]")?.addEventListener("click", () => track("cta_click", { location: "floating" }));
}
