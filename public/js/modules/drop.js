/**
 * 쏟아지는 혜택 알약·이모지 (물리 효과)
 *
 * <div class="drop" data-drop>
 *   <ul class="drop__stage">
 *     <li class="drop__item drop__item--pill">…</li>      ← 알약 (둥근 막대)
 *     <li class="drop__item drop__item--emoji">…</li>     ← 이모지 (동그란 모양으로 굴러감)
 *     <li class="drop__item drop__item--emoji drop__item--box">…</li> ← 네모난 이모지 (카드·영수증)
 *   </ul>
 * </div>
 *
 * - 화면에 들어오면 위에서 쏟아져 무대 바닥(= 아래 흰 카드 바로 위)에 쌓입니다. 양옆 벽은 무대의 좌우 끝입니다.
 * - 화면에 다시 들어올 때마다 떨어지는 순서·위치·각도·쏟아지는 방향이 무작위로 달라집니다.
 * - 톡 누르면 통 튀어 오르고, 꾹 누른 채 끌면 집어서 옮기거나 던질 수 있습니다.
 *   (휴대폰: 알약 위에서 바로 쓸어 넘기면 평소처럼 페이지가 스크롤되고, 잠깐 누르고 있다가 움직이면 집힙니다)
 * - 물리 계산은 Matter.js(js/vendor/matter.min.js, MIT)를 쓰며, 이 구간이 화면 가까이 왔을 때에만 내려받습니다.
 * - '모션 최소화' 설정이거나 Matter.js 를 불러오지 못하면 피그마 배치 그대로 멈춘 모양(.is-static)으로 보여줍니다.
 */

/** 느낌 조절 값 */
const TUNE = {
  /** 하나씩 떨어지는 간격 (ms, 이 범위에서 무작위) */
  gap: [60, 150],
  /** 꾹 눌러 집히기까지 걸리는 시간 (ms, 터치 전용. 마우스는 누르는 즉시 집힘) */
  holdMs: 170,
  /** 이 거리(px) 넘게 움직이면 '톡 누르기'가 아니라 끌기로 봅니다 */
  tapSlop: 10,
  /** 최고 속도 (px/프레임) — 너무 세게 던져 벽을 뚫는 일 방지 */
  maxSpeed: 32,
  /** 벽 두께 (px) */
  wall: 400,
};

const MATTER_URL = new URL("../vendor/matter.min.js", import.meta.url).href;
let matterPromise;

function loadMatter() {
  if (window.Matter) return Promise.resolve(window.Matter);
  if (!matterPromise) {
    matterPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = MATTER_URL;
      s.async = true;
      s.onload = () => (window.Matter ? resolve(window.Matter) : reject(new Error("Matter 를 찾을 수 없어요")));
      s.onerror = () => reject(new Error("matter.min.js 를 불러오지 못했어요"));
      document.head.appendChild(s);
    });
  }
  return matterPromise;
}

export function initDrop(root = document) {
  root.querySelectorAll("[data-drop]").forEach(setupDrop);
}

function setupDrop(el) {
  const stage = el.querySelector(".drop__stage");
  const items = stage ? [...stage.querySelectorAll(".drop__item")] : [];
  if (!items.length) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !("IntersectionObserver" in window) || !("PointerEvent" in window)) {
    el.classList.add("is-static");
    return;
  }

  // 화면 가까이 오면 엔진을 미리 받아 두고, 실제로 보이면 쏟습니다
  const preload = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      preload.disconnect();
      loadMatter()
        .then((Matter) => start(el, stage, items, Matter))
        .catch((err) => {
          console.warn("[drop]", err);
          el.classList.add("is-static");
        });
    },
    { rootMargin: "600px 0px" },
  );
  preload.observe(el);
}

function start(el, stage, items, Matter) {
  const { Engine, Bodies, Body, Composite, Constraint, Sleeping } = Matter;

  el.classList.add("is-live");

  const engine = Engine.create({ enableSleeping: true });
  const world = engine.world;

  /** @type {{el: HTMLElement, body: any, w: number, h: number, on: boolean}[]} */
  let things = [];
  let walls = [];
  let W = 0;
  let H = 0;
  let topLimit = 0; // 무대 위쪽으로 보이는 구간의 끝 (섹션 맨 위). 여기보다 위에서 떨어지기 시작합니다
  let timers = [];
  let raf = 0;
  let last = 0;
  let acc = 0;
  let visible = false;
  let wasAway = true; // 화면 밖으로 완전히 나갔다 왔는지 → 다시 쏟기
  let grab = null; // { thing, constraint, pointerId }
  let press = null; // { thing, pointerId, x, y, t, moved, timer }

  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  /* ---------- 세계 만들기 ---------- */
  function build() {
    Composite.clear(world, false);
    things = [];
    W = stage.clientWidth;
    H = stage.clientHeight;

    // 무대 위로 얼마나 보이는지: 잘리는 조상(섹션) 맨 위까지
    const section = el.closest(".section") || el.parentElement;
    topLimit = Math.max(0, stage.getBoundingClientRect().top - section.getBoundingClientRect().top);

    const T = TUNE.wall;
    const tall = H + topLimit + 2400;
    const opts = { isStatic: true, friction: 0.6, restitution: 0.2 };
    walls = [
      Bodies.rectangle(W / 2, H + T / 2, W + T * 2, T, opts), // 바닥
      Bodies.rectangle(-T / 2, H - tall / 2 + T, T, tall, opts), // 왼쪽 벽
      Bodies.rectangle(W + T / 2, H - tall / 2 + T, T, tall, opts), // 오른쪽 벽
    ];
    Composite.add(world, walls);

    // 화면이 작을수록 물체도 작으니 중력도 같이 줄여 같은 속도감으로
    const unit = items[0] ? items[0].offsetHeight / 74 : 1;
    engine.gravity.y = 1;
    engine.gravity.scale = 0.001 * Math.min(1.25, Math.max(0.75, unit * 1.25));

    items.forEach((item) => {
      const w = item.offsetWidth;
      const h = item.offsetHeight;
      if (!w || !h) return;
      const common = { restitution: 0.32, friction: 0.45, frictionAir: 0.012, density: 0.0018, sleepThreshold: 45 };
      let body;
      if (item.classList.contains("drop__item--pill")) {
        body = Bodies.rectangle(0, 0, w, h, { ...common, chamfer: { radius: h / 2 - 0.5 } });
      } else if (item.classList.contains("drop__item--box")) {
        body = Bodies.rectangle(0, 0, w * 0.86, h * 0.9, { ...common, chamfer: { radius: Math.min(w, h) * 0.16 } });
      } else {
        body = Bodies.circle(0, 0, Math.min(w, h) * 0.44, { ...common, restitution: 0.42 });
      }
      item.classList.remove("is-on", "is-held", "is-pressed");
      things.push({ el: item, body, w, h, on: false, pill: item.classList.contains("drop__item--pill") });
    });
  }

  /* ---------- 쏟기: 매번 다르게 ---------- */
  function pour() {
    timers.forEach(clearTimeout);
    timers = [];
    release();
    things.forEach((t) => {
      if (t.on) Composite.remove(world, t.body);
      t.on = false;
      t.el.classList.remove("is-on");
    });

    // 어느 쪽에서 쏟을지도 매번 달라집니다
    const mode = pick(["spread", "spread", "left", "right", "center"]);
    const order = shuffle([...things]);
    let delay = 0;

    order.forEach((t, i) => {
      delay += i === 0 ? 0 : rand(TUNE.gap[0], TUNE.gap[1]);
      timers.push(setTimeout(() => spawn(t, mode), delay));
    });
    wake();
  }

  function spawn(t, mode) {
    const angle = rand(-0.9, 0.9);
    // 기울어진 상태의 가로 반폭만큼 벽에서 떨어뜨려 놓습니다
    const half = (Math.abs(Math.cos(angle)) * t.w + Math.abs(Math.sin(angle)) * t.h) / 2 + 4;
    const lo = Math.min(half, W / 2);
    const hi = Math.max(W - half, W / 2);
    let x;
    let vx;
    if (mode === "left") {
      x = rand(lo, lo + (hi - lo) * 0.35);
      vx = rand(1, 5);
    } else if (mode === "right") {
      x = rand(hi - (hi - lo) * 0.35, hi);
      vx = rand(-5, -1);
    } else if (mode === "center") {
      x = W / 2 + rand(-0.14, 0.14) * W;
      vx = rand(-4.5, 4.5);
    } else {
      x = rand(lo, hi);
      vx = rand(-2, 2);
    }
    x = Math.min(hi, Math.max(lo, x));
    const y = -topLimit - t.h - rand(10, 160);

    Sleeping.set(t.body, false);
    Body.setPosition(t.body, { x, y });
    Body.setAngle(t.body, angle);
    Body.setVelocity(t.body, { x: vx, y: rand(1, 5) });
    Body.setAngularVelocity(t.body, rand(-0.09, 0.09));
    if (!t.on) Composite.add(world, t.body);
    t.on = true;
    paint(t);
    t.el.classList.add("is-on");
    wake();
  }

  /* ---------- 그리기 ---------- */
  function paint(t) {
    const { x, y } = t.body.position;
    let angle = t.body.angle;
    // 알약은 위아래가 같은 모양이라, 뒤집혔을 때는 반 바퀴 돌려 그려서 글자가 거꾸로 서지 않게 합니다
    if (t.pill && Math.cos(angle) < 0) angle += Math.PI;
    t.el.style.transform = `translate3d(${(x - t.w / 2).toFixed(2)}px, ${(y - t.h / 2).toFixed(2)}px, 0) rotate(${angle.toFixed(4)}rad)`;
  }

  const STEP = 1000 / 60;

  function frame(now) {
    raf = 0;
    if (!visible) return;
    acc += Math.min(50, now - last);
    last = now;
    while (acc >= STEP) {
      Engine.update(engine, STEP);
      guard();
      acc -= STEP;
    }

    let moving = Boolean(grab) || timers.length > things.filter((t) => t.on).length;
    things.forEach((t) => {
      if (!t.on) return;
      paint(t);
      if (!t.body.isSleeping) moving = true;
    });
    if (things.some((t) => !t.on)) moving = true;
    if (moving) raf = requestAnimationFrame(frame);
  }

  function wake() {
    if (raf || !visible) return;
    last = performance.now();
    acc = 0;
    raf = requestAnimationFrame(frame);
  }

  /** 너무 빨라지거나 밖으로 튕겨 나간 물체를 바로잡습니다 */
  function guard() {
    things.forEach((t) => {
      if (!t.on) return;
      const b = t.body;
      const speed = Math.hypot(b.velocity.x, b.velocity.y);
      if (speed > TUNE.maxSpeed) {
        const k = TUNE.maxSpeed / speed;
        Body.setVelocity(b, { x: b.velocity.x * k, y: b.velocity.y * k });
      }
      if (Math.abs(b.angularVelocity) > 0.5) Body.setAngularVelocity(b, Math.sign(b.angularVelocity) * 0.5);
      const out = b.position.y > H + 200 || b.position.x < -200 || b.position.x > W + 200;
      if (out && (!grab || grab.thing !== t)) spawn(t, "spread");
    });
  }

  /* ---------- 누르기 · 집기 · 던지기 ---------- */
  function point(e) {
    const r = stage.getBoundingClientRect();
    return {
      x: Math.min(W - 2, Math.max(2, e.clientX - r.left)),
      y: Math.min(H - 2, Math.max(-topLimit, e.clientY - r.top)),
    };
  }

  function startGrab(thing, e) {
    const p = point(e);
    const b = thing.body;
    Sleeping.set(b, false);
    const constraint = Constraint.create({
      pointA: p,
      bodyB: b,
      pointB: { x: p.x - b.position.x, y: p.y - b.position.y },
      length: 0,
      stiffness: 0.14,
      damping: 0.12,
    });
    Composite.add(world, constraint);
    grab = { thing, constraint, pointerId: e.pointerId };
    thing.el.classList.add("is-held");
    try {
      thing.el.setPointerCapture(e.pointerId);
    } catch {
      /* 이미 끝난 포인터 */
    }
    wake();
  }

  function release() {
    if (press) {
      clearTimeout(press.timer);
      press.thing.el.classList.remove("is-pressed");
      press = null;
    }
    if (grab) {
      Composite.remove(world, grab.constraint);
      grab.thing.el.classList.remove("is-held");
      Sleeping.set(grab.thing.body, false);
      grab = null;
    }
  }

  /** 톡 눌렀을 때: 통 튀어 오르고, 맞닿은 이웃도 살짝 들썩입니다 */
  function pop(thing) {
    const b = thing.body;
    const k = Math.min(1.15, Math.max(0.75, thing.h / 60));
    Sleeping.set(b, false);
    Body.setVelocity(b, { x: rand(-3.5, 3.5) * k, y: -rand(9, 13) * k });
    Body.setAngularVelocity(b, rand(-0.22, 0.22));
    const reach = Math.max(thing.w, thing.h) * 0.9;
    things.forEach((t) => {
      if (t === thing || !t.on) return;
      const dx = t.body.position.x - b.position.x;
      const dy = t.body.position.y - b.position.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > reach) return;
      Sleeping.set(t.body, false);
      Body.setVelocity(t.body, { x: t.body.velocity.x + (dx / d) * 2.2 * k, y: t.body.velocity.y - rand(1.5, 4) * k });
    });
    wake();
  }

  const thingOf = (target) => {
    const item = target instanceof Element ? target.closest(".drop__item") : null;
    return item ? things.find((t) => t.el === item && t.on) : null;
  };

  stage.addEventListener("pointerdown", (e) => {
    if (press || grab || (e.pointerType === "mouse" && e.button !== 0)) return;
    const thing = thingOf(e.target);
    if (!thing) return;
    thing.el.classList.add("is-pressed");
    press = { thing, pointerId: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: false, timer: 0 };
    if (e.pointerType === "touch") {
      // 터치: 잠깐 누르고 있어야 집힙니다 (바로 쓸어 넘기면 페이지 스크롤)
      press.timer = setTimeout(() => {
        if (press && press.thing === thing && !press.moved) startGrab(thing, e);
      }, TUNE.holdMs);
    } else {
      e.preventDefault(); // 글자 선택·이미지 끌기 방지
      startGrab(thing, e);
    }
  });

  window.addEventListener("pointermove", (e) => {
    if (!press || e.pointerId !== press.pointerId) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > TUNE.tapSlop) {
      press.moved = true;
      if (!grab) clearTimeout(press.timer); // 집히기 전에 움직였으면 스크롤로 보고 놓아줍니다
    }
    if (grab) {
      grab.constraint.pointA = point(e);
      Sleeping.set(grab.thing.body, false);
      wake();
    }
  });

  const end = (e) => {
    if (!press || e.pointerId !== press.pointerId) return;
    const { thing, moved, t } = press;
    const quick = performance.now() - t < 400;
    const cancelled = e.type === "pointercancel";
    release();
    if (!cancelled && !moved && quick) pop(thing);
    else wake();
  };
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);

  // 집은 동안에는 페이지가 따라 스크롤되지 않게 (터치)
  stage.addEventListener(
    "touchmove",
    (e) => {
      if (grab && e.cancelable) e.preventDefault();
    },
    { passive: false },
  );
  // 꾹 누를 때 뜨는 메뉴 방지
  stage.addEventListener("contextmenu", (e) => {
    if (thingOf(e.target)) e.preventDefault();
  });

  /* ---------- 화면에 들어올 때마다 쏟기 ---------- */
  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) {
        wasAway = true;
        release();
        return;
      }
      if (wasAway) {
        wasAway = false;
        pour();
      } else {
        wake();
      }
    },
    { threshold: 0 },
  ).observe(el);

  /* ---------- 화면 폭이 바뀌면 다시 만들기 ---------- */
  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (stage.clientWidth === W && stage.clientHeight === H) return;
      timers.forEach(clearTimeout);
      timers = [];
      release();
      build();
      if (visible) pour();
      else wasAway = true;
    }, 200);
  };
  if ("ResizeObserver" in window) new ResizeObserver(onResize).observe(stage);
  else window.addEventListener("resize", onResize);

  build();
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
