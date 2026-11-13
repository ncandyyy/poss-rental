/**
 * 기기 화면 속 이미지가 옆으로 자동으로 넘어가는 슬라이드 (토스 프론트 첫 화면 예시)
 *
 * <div data-screen-slider data-interval="2200">
 *   <ul class="screen-slider__track"> <li class="screen-slider__item"><img></li> ... </ul>
 * </div>
 *
 * 마지막 다음에 첫 장의 복제본을 붙여, 끝에서 처음으로 끊김 없이 이어집니다.
 * 화면 밖이거나 탭이 숨겨지면 멈춥니다.
 */
export function initScreenSliders(root = document) {
  root.querySelectorAll("[data-screen-slider]").forEach(setup);
}

function setup(el) {
  const track = el.querySelector(".screen-slider__track");
  const items = track ? [...track.children] : [];
  if (items.length < 2) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const clone = items[0].cloneNode(true);
  clone.setAttribute("aria-hidden", "true");
  clone.querySelector("img")?.setAttribute("alt", "");
  track.appendChild(clone);

  const n = items.length;
  const interval = Number(el.dataset.interval) || 2200;
  let index = 0;
  let timer = null;
  let inView = false;

  const move = (i, animate = true) => {
    index = i;
    track.classList.toggle("is-jump", !animate);
    track.style.transform = `translate3d(${-100 * index}%, 0, 0)`;
  };

  track.addEventListener("transitionend", () => {
    if (index === n) {
      move(0, false);
      track.getBoundingClientRect();
      track.classList.remove("is-jump");
    }
  });

  // 다음 장 이미지를 미리 받아 둡니다 (loading="lazy" 보완)
  const warm = (i) => {
    const img = track.children[i]?.querySelector("img");
    if (img && img.loading === "lazy") img.loading = "eager";
  };

  const tick = () => {
    warm(index + 2);
    move(index + 1);
  };

  const update = () => {
    clearInterval(timer);
    if (inView && !document.hidden) {
      warm(1);
      timer = setInterval(tick, interval);
    }
  };

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    }).observe(el);
  } else {
    inView = true;
    update();
  }
  document.addEventListener("visibilitychange", update);
}
