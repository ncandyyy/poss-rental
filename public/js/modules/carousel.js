/**
 * 기능 소개 캐러셀 (어두운 슬라이드)
 * - 일정 간격으로 자동으로 넘어갑니다. (화면 밖 / 다른 탭 / 마우스를 올려둔 동안은 멈춤)
 * - 손가락이나 마우스로 좌우로 밀어서 넘길 수 있고, 좌우 화살표(데스크톱), 오른쪽 인디케이터 클릭, 키보드 ←/→ 도 됩니다.
 * - 슬라이드 안 <video> 는 해당 슬라이드가 보일 때만 재생합니다.
 * - 슬라이드별 표시 시간: <article class="fc__slide" data-duration="7000">
 */
import { CONFIG } from "../config.js";

export function initCarousels(root = document) {
  root.querySelectorAll("[data-carousel]").forEach((el) => new FeatureCarousel(el));
}

/**
 * <video> 안의 <source data-src> 를 실제 주소로 바꿔 불러옵니다. (mp4 → 안 되면 webm 순서)
 * 실패해도 영상 태그는 남겨두고(첫 장면 이미지가 계속 보임) 콘솔에 원인을 남깁니다.
 */
function loadVideo(video) {
  video.dataset.loaded = "1";
  video.addEventListener("playing", () => video.classList.add("is-playing"));

  const sources = [...video.querySelectorAll("source[data-src]")];
  sources.forEach((source) => {
    source.addEventListener("error", () => console.warn("[carousel] 영상을 불러오지 못했어요:", source.dataset.src));
  });
  const markFailed = () => {
    video.dataset.failed = "1";
  };
  if (sources.length) {
    sources[sources.length - 1].addEventListener("error", markFailed); // 모든 후보가 실패
    sources.forEach((source) => {
      source.src = source.dataset.src;
    });
  } else if (video.dataset.src) {
    video.addEventListener("error", markFailed);
    video.src = video.dataset.src;
  }
  video.preload = "auto";
  video.load();
}

class FeatureCarousel {
  constructor(root) {
    this.root = root;
    this.viewport = root.querySelector(".fc__viewport");
    this.track = root.querySelector(".fc__track");
    this.slides = [...root.querySelectorAll(".fc__slide")];
    this.dots = [...root.querySelectorAll(".fc__dot")];
    this.interval = Number(root.dataset.interval) || CONFIG.CAROUSEL_INTERVAL;
    this.index = -1;
    this.timer = null;
    this.remaining = 0;
    this.startedAt = 0;
    this.inView = false;
    this.hovered = false;
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!this.track || this.slides.length < 2) return;

    this.bindDots();
    this.bindSwipe();
    this.bindKeys();
    this.bindVisibility();
    this.go(0, { instant: true });
  }

  /** 사용자가 고른 슬라이드로 이동 (인디케이터, 스와이프, ←/→) */
  request(i) {
    const n = this.slides.length;
    this.go((i + n) % n);
  }

  /* =========================================================
     슬라이드 이동
     ========================================================= */
  go(i, { instant = false } = {}) {
    const n = this.slides.length;
    const prev = this.index;
    this.index = (i + n) % n;

    if (instant) this.track.style.transition = "none";
    this.track.style.transform = `translate3d(${-100 * this.index}%, 0, 0)`;
    if (instant) {
      this.track.getBoundingClientRect();
      this.track.style.transition = "";
    }

    this.slides.forEach((slide, k) => {
      const active = k === this.index;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", String(!active));
      slide.inert = !active;
    });
    this.dots.forEach((dot, k) => {
      const active = k === this.index;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-selected", String(active));
      dot.tabIndex = active ? 0 : -1;
    });

    this.syncVideos(prev !== this.index);
    this.restartTimer();
  }

  next() {
    this.go(this.index + 1);
  }

  /* =========================================================
     자동 넘김
     ========================================================= */
  slideDuration() {
    return Number(this.slides[this.index]?.dataset.duration) || this.interval;
  }

  canPlay() {
    return this.inView && !this.hovered && !document.hidden && !this.reduced;
  }

  restartTimer() {
    clearTimeout(this.timer);
    this.startedAt = 0;
    this.remaining = this.slideDuration();
    this.root.style.setProperty("--slide-ms", `${this.remaining}ms`);
    this.root.classList.remove("is-playing", "is-paused");
    this.root.getBoundingClientRect(); // 진행 바 애니메이션을 처음부터
    this.updatePlayState();
  }

  updatePlayState() {
    if (this.startedAt) {
      this.remaining = Math.max(300, this.remaining - (performance.now() - this.startedAt));
      this.startedAt = 0;
    }
    clearTimeout(this.timer);

    if (this.canPlay()) {
      this.root.classList.add("is-playing");
      this.root.classList.remove("is-paused");
      this.startedAt = performance.now();
      this.timer = setTimeout(() => this.next(), this.remaining);
    } else if (this.root.classList.contains("is-playing")) {
      this.root.classList.add("is-paused");
    }
  }

  /* =========================================================
     영상
     ========================================================= */
  syncVideos(changed = false) {
    this.slides.forEach((slide, k) => {
      const video = slide.querySelector("video");
      if (!video) return;

      // 캐러셀이 화면에 들어오면 미리 받아둬서, 해당 슬라이드에 오자마자 바로 재생되게
      if (this.inView && !video.dataset.loaded) loadVideo(video);

      const shouldPlay = k === this.index && this.inView && !document.hidden && !video.dataset.failed;
      if (shouldPlay) {
        if (changed && video.currentTime > 0) video.currentTime = 0; // 슬라이드에 들어올 때 처음부터
        const p = video.play();
        if (p && p.catch) p.catch(() => {});
      } else if (!video.paused) {
        video.pause();
      }
    });
  }

  /* =========================================================
     입력
     ========================================================= */
  bindDots() {
    this.dots.forEach((dot, k) => dot.addEventListener("click", () => this.request(k)));
    this.root.querySelector("[data-fc-prev]")?.addEventListener("click", () => this.request(this.index - 1));
    this.root.querySelector("[data-fc-next]")?.addEventListener("click", () => this.request(this.index + 1));
  }

  bindKeys() {
    this.root.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      this.request(this.index + (e.key === "ArrowRight" ? 1 : -1));
      requestAnimationFrame(() => this.dots[this.index]?.focus({ preventScroll: true }));
    });
  }

  bindSwipe() {
    const area = this.viewport || this.root;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let dragging = false;
    let locked = false;
    let pointerId = null;

    area.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragging = true;
      locked = false;
      dx = 0;
      startX = e.clientX;
      startY = e.clientY;
      pointerId = e.pointerId;
    });

    area.addEventListener("pointermove", (e) => {
      if (!dragging || e.pointerId !== pointerId) return;
      const mx = e.clientX - startX;
      const my = e.clientY - startY;
      if (!locked) {
        if (Math.abs(mx) < 8) return;
        if (Math.abs(my) > Math.abs(mx)) {
          dragging = false; // 세로 스크롤은 브라우저에 맡김
          return;
        }
        locked = true;
        area.setPointerCapture?.(pointerId);
        this.root.classList.add("is-dragging");
        clearTimeout(this.timer);
      }
      dx = mx;
      const last = this.slides.length - 1;
      const edge = (this.index === 0 && dx > 0) || (this.index === last && dx < 0);
      const offset = edge ? dx * 0.35 : dx;
      this.track.style.transform = `translate3d(calc(${-100 * this.index}% + ${offset}px), 0, 0)`;
    });

    const end = () => {
      if (!dragging) return;
      dragging = false;
      this.root.classList.remove("is-dragging");
      if (!locked) return;
      const threshold = Math.min(80, (area.clientWidth || 300) * 0.15);
      if (dx < -threshold) this.request(this.index + 1);
      else if (dx > threshold) this.request(this.index - 1);
      else this.go(this.index);
    };
    area.addEventListener("pointerup", end);
    area.addEventListener("pointercancel", end);
    // 터치는 손가락이 닿은 이미지가 먼저 이벤트를 잡고 있다가 viewport 로 넘어오며 lostpointercapture 가 생깁니다.
    // 그건 손을 뗀 게 아니므로, viewport 자신이 잡고 있던 것을 놓쳤을 때만 끝냅니다.
    area.addEventListener("lostpointercapture", (e) => {
      if (e.target === area) end();
    });
    area.addEventListener("dragstart", (e) => e.preventDefault());
  }

  bindVisibility() {
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        ([entry]) => {
          this.inView = entry.isIntersecting;
          this.updatePlayState();
          this.syncVideos();
        },
        { threshold: 0.35 },
      ).observe(this.root);
    } else {
      this.inView = true;
    }

    document.addEventListener("visibilitychange", () => {
      this.updatePlayState();
      this.syncVideos();
    });

    if (window.matchMedia("(hover: hover)").matches) {
      this.root.addEventListener("mouseenter", () => {
        this.hovered = true;
        this.updatePlayState();
      });
      this.root.addEventListener("mouseleave", () => {
        this.hovered = false;
        this.updatePlayState();
      });
    }
  }
}
