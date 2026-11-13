/**
 * 스크롤 등장 애니메이션
 * [data-reveal] 요소가 화면에 들어오면 .is-in 클래스를 붙입니다. (스타일: css/base/base.css)
 */
export function initReveal(root = document) {
  const targets = [...root.querySelectorAll("[data-reveal]:not(.is-in)")];
  if (!targets.length) return;

  if (!("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-in"));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
  );

  targets.forEach((el) => io.observe(el));
}
