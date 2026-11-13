/**
 * 자동으로 흐르는 캐러셀 (marquee)
 *
 * <div class="marquee" data-marquee data-direction="left|right" data-speed="40" data-start="0.3">
 *   <ul class="marquee__track"> <li>...</li> </ul>
 * </div>
 *
 * - 원래 아이템을 화면 폭보다 길어질 때까지 복제해 "한 세트"를 만들고, 세트를 한 번 더 붙입니다.
 * - CSS 애니메이션이 정확히 한 세트만큼 움직여서 이음매 없이 반복됩니다.
 * - data-speed: 1초에 움직이는 px (데스크톱 기준), data-start: 시작 위치(0~1)
 */
export function initMarquees(root = document) {
  root.querySelectorAll("[data-marquee]").forEach(setupMarquee);
}

function setupMarquee(el) {
  const track = el.querySelector(".marquee__track");
  if (!track) return;

  const originals = [...track.children];
  let lastWidth = 0;

  const build = () => {
    const width = el.clientWidth;
    if (!width || width === lastWidth) return;
    lastWidth = width;

    el.classList.remove("is-ready");
    track.querySelectorAll("[data-clone]").forEach((n) => n.remove());

    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const setWidth = originals.reduce((sum, item) => sum + item.getBoundingClientRect().width + gap, 0);
    if (!setWidth) return;

    // 한 세트가 화면 폭보다 길어지도록 반복 횟수 결정
    const reps = Math.min(12, Math.max(1, Math.ceil((width + 1) / setWidth)));
    const frag = document.createDocumentFragment();
    for (let r = 1; r < reps * 2; r += 1) {
      originals.forEach((item) => {
        const clone = item.cloneNode(true);
        clone.setAttribute("data-clone", "");
        clone.setAttribute("aria-hidden", "true");
        clone.querySelectorAll("img").forEach((img) => img.setAttribute("alt", ""));
        frag.appendChild(clone);
      });
    }
    track.appendChild(frag);

    const period = setWidth * reps;
    const scale = Math.min(1, Math.max(0.6, window.innerWidth / 860));
    const speed = (Number(el.dataset.speed) || 40) * scale;
    const duration = period / speed;
    const start = Number(el.dataset.start) || 0;

    el.style.setProperty("--duration", `${duration.toFixed(2)}s`);
    el.style.setProperty("--start", `${(-start * duration).toFixed(2)}s`);
    el.classList.add("is-ready");
  };

  build();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      lastWidth = 0;
      build();
    });
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 200);
  });

  // 화면 밖에서는 멈춰서 배터리/CPU 절약
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      el.classList.toggle("is-paused", !entry.isIntersecting);
    }).observe(el);
  }
}
