/**
 * 숫자 카운트업 — 화면에 들어오면 0부터 목표 숫자까지 올라갑니다.
 *
 * <span data-count-up="1000">1,000</span>
 *
 * - HTML 에는 최종 숫자를 그대로 적어 두어서, JS 가 꺼져 있어도 숫자가 보입니다.
 * - data-duration 으로 걸리는 시간(ms)을 바꿀 수 있습니다. (기본 1400)
 */
export function initCountUp(root = document) {
  const targets = [...root.querySelectorAll("[data-count-up]")];
  if (!targets.length || !("IntersectionObserver" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        run(entry.target);
      });
    },
    { threshold: 0.6 },
  );

  // 글자 폭이 흔들리지 않도록, 웹폰트가 준비된 뒤 최종 숫자 폭을 재서 잡아 둡니다
  const prepare = () =>
    targets.forEach((el) => {
      el.style.display = "inline-block";
      const em = el.getBoundingClientRect().width / (parseFloat(getComputedStyle(el).fontSize) || 16);
      el.style.minWidth = `${em.toFixed(3)}em`; // 화면 폭이 바뀌어 글자 크기가 달라져도 비율 유지
      el.style.textAlign = "right";
      el.textContent = format(0);
      io.observe(el);
    });

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(prepare);
  else prepare();
}

function run(el) {
  const target = Number(el.dataset.countUp) || 0;
  const duration = Number(el.dataset.duration) || 1400;
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = format(Math.round(target * eased));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function format(n) {
  return Number(n).toLocaleString("ko-KR");
}
