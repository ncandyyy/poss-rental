/**
 * 상담 신청 폼 (3단계)
 *  1) 매장 상태 + 휴대폰 번호  → 번호를 다 쓰면 업종 칸이 펼쳐짐
 *  2) 업종 선택                → 고르면 다음 화면으로
 *  3) 연락 희망일/시간 + 개인정보 동의 → 전송
 *
 * 전송: CONFIG.FORM_ENDPOINT (Google Apps Script 웹 앱) 로 JSON 을 POST 합니다.
 * Apps Script 가 구글 시트에 한 줄 추가하고 슬랙으로 알림을 보냅니다. (apps-script/Code.gs)
 */
import { CONFIG } from "../config.js";
import { getAttribution } from "./attribution.js";
import { toast } from "./toast.js";
import { track } from "./analytics.js";

const TITLES = {
  phone: "상담을 위해<br />전화번호를 입력해주세요",
  industryNew: "준비 중인<br />업종을 알려주세요",
  industryRunning: "운영 중인<br />업종을 알려주세요",
};

export function initApplyForm() {
  const form = document.querySelector("[data-apply-form]");
  if (!form) return;

  const $ = (sel) => form.querySelector(sel);
  const panels = {
    info: $('[data-panel="info"]'),
    time: $('[data-panel="time"]'),
    done: $('[data-panel="done"]'),
  };
  const title = $("[data-title]");
  const phone = $("[data-phone]");
  const phoneField = $('[data-field="phone"]');
  const phoneError = $('[data-error="phone"]');
  const industryWrap = $("[data-industry-wrap]");
  const industry = $("[data-industry]");
  const timeGrid = $("[data-time-grid]");
  const consent = $("[data-consent]");
  const consentToggle = $("[data-consent-toggle]");
  const consentDetail = document.getElementById("consent-detail");
  const submitBtn = $("[data-submit]");

  let started = false;
  let submitting = false;

  /* ---------- 준비 ---------- */
  CONFIG.BUSINESS_TYPES.forEach((name) => industry.add(new Option(name, name)));
  buildTimeSlots(timeGrid);
  form.querySelectorAll("[data-seg]").forEach(initSegment);

  const markStarted = () => {
    if (started) return;
    started = true;
    track("form_start");
  };

  /* ---------- 1단계: 휴대폰 ---------- */
  phone.addEventListener("input", () => {
    markStarted();
    const formatted = formatPhone(phone.value);
    if (phone.value !== formatted) phone.value = formatted;
    setPhoneError("");

    if (isCompletePhone(phone.value) && !industryWrap.classList.contains("is-open")) {
      openIndustry();
      // 모바일 키보드를 내려 업종 칸이 보이게
      if (window.matchMedia("(pointer: coarse)").matches) phone.blur();
    }
  });

  phone.addEventListener("blur", () => {
    if (!phone.value) return;
    if (!isValidPhone(phone.value)) setPhoneError("휴대폰 번호를 다시 확인해주세요");
    else if (!industryWrap.classList.contains("is-open")) openIndustry();
  });

  form.querySelectorAll('input[name="storeStatus"]').forEach((r) =>
    r.addEventListener("change", () => {
      markStarted();
      if (industryWrap.classList.contains("is-open")) setTitle(industryTitle());
    }),
  );

  /* ---------- 2단계: 업종 ---------- */
  industry.addEventListener("change", () => {
    if (!industry.value) return;
    if (!isValidPhone(phone.value)) {
      setPhoneError("휴대폰 번호를 다시 확인해주세요");
      phone.focus();
      return;
    }
    setTimeout(goTimeStep, 280);
  });

  function openIndustry() {
    industryWrap.classList.add("is-open");
    setTitle(industryTitle());
  }

  function industryTitle() {
    const status = form.elements.storeStatus.value;
    return status === "매장 운영 중" ? TITLES.industryRunning : TITLES.industryNew;
  }

  function setTitle(html) {
    if (title.innerHTML === html) return;
    title.innerHTML = html;
    title.classList.remove("is-swapping");
    title.getBoundingClientRect();
    title.classList.add("is-swapping");
  }

  function setPhoneError(msg) {
    phoneError.textContent = msg;
    phoneField.classList.toggle("is-invalid", Boolean(msg));
  }

  /* ---------- 3단계: 시간 ---------- */
  function goTimeStep() {
    if (!isValidPhone(phone.value)) {
      setPhoneError("휴대폰 번호를 다시 확인해주세요");
      return;
    }
    if (!industry.value) return;
    refreshDay();
    showPanel("time");
    track("form_step", { step: "time" });
  }

  $("[data-back]").addEventListener("click", () => showPanel("info"));

  form.querySelectorAll('input[name="contactDay"]').forEach((r) => r.addEventListener("change", refreshTimes));
  form.addEventListener("change", (e) => {
    if (e.target.name === "contactTime" || e.target.name === "consent") updateSubmit();
  });

  // 연락 희망일: 주말·쉬는 날을 건너뛴 가까운 영업일 2개로 버튼을 채웁니다
  function refreshDay() {
    const days = contactDays();
    const radios = [...form.querySelectorAll('input[name="contactDay"]')];
    radios.forEach((radio, i) => {
      const day = days[i];
      const changed = radio.dataset.date !== day.date;
      radio.value = day.label;
      radio.dataset.date = day.date;
      radio.dataset.today = day.isToday ? "1" : "";
      radio.closest("label").querySelector("[data-day-label]").textContent = day.label;
      if (changed && radio.checked && i !== 0) radio.checked = false; // 날짜가 바뀌었으면 첫 번째로
    });
    if (!radios.some((r) => r.checked)) radios[0].checked = true;
    radios.find((r) => r.checked).dispatchEvent(new Event("change", { bubbles: true }));
  }

  // 오늘이면 이미 지난 시간은 선택 불가
  function refreshTimes() {
    const isToday = form.querySelector('input[name="contactDay"]:checked')?.dataset.today === "1";
    const { hour } = nowInZone();
    timeGrid.querySelectorAll("input").forEach((input) => {
      const h = Number(input.dataset.hour);
      input.disabled = isToday && h <= hour;
      if (input.disabled && input.checked) input.checked = false;
    });
    updateSubmit();
  }

  function updateSubmit() {
    const hasTime = Boolean(form.querySelector('input[name="contactTime"]:checked'));
    submitBtn.disabled = !(hasTime && consent.checked);
  }

  /* ---------- 개인정보 동의 '보기' ---------- */
  consentToggle.addEventListener("click", () => {
    const open = consentDetail.hidden;
    consentDetail.hidden = !open;
    consentToggle.setAttribute("aria-expanded", String(open));
    consentToggle.textContent = open ? "닫기" : "보기";
  });

  /* ---------- 전송 ---------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (panels.time.hidden) {
      // 엔터키 등으로 1단계에서 제출된 경우
      goTimeStep();
      return;
    }
    if (submitBtn.disabled) return;

    const data = collect();

    // 스팸 봇: 사람에게 보이지 않는 칸이 채워져 있으면 성공처럼만 보여줌
    if (form.elements.website.value) {
      showDone(data, false);
      return;
    }

    submitting = true;
    submitBtn.classList.add("is-loading");

    try {
      if (!CONFIG.FORM_ENDPOINT) {
        console.warn("[apply-form] FORM_ENDPOINT 가 비어 있어 테스트 모드로 동작합니다. 전송 데이터:", data);
        await wait(700);
        showDone(data, true);
        return;
      }

      // text/plain 으로 보내야 Apps Script 에서 CORS 사전요청 없이 받을 수 있습니다
      const res = await fetch(CONFIG.FORM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`);

      track("lead_submit", { store_status: data.storeStatus, industry: data.industry });
      showDone(data, false);
    } catch (err) {
      console.error("[apply-form] 전송 실패", err);
      toast("신청이 전송되지 않았어요. 잠시 후 다시 시도해주세요.");
    } finally {
      submitting = false;
      submitBtn.classList.remove("is-loading");
    }
  });

  function collect() {
    const day = form.querySelector('input[name="contactDay"]:checked');
    return {
      storeStatus: form.elements.storeStatus.value,
      industry: industry.value,
      phone: formatPhone(phone.value),
      contactDay: day.value,
      contactDate: day.dataset.date,
      contactTime: form.elements.contactTime.value,
      consent: consent.checked,
      submittedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      website: form.elements.website.value,
      ...getAttribution(),
    };
  }

  function showDone(data, testMode) {
    const summary = $("[data-summary]");
    const rows = [
      ["매장 상태", data.storeStatus],
      ["업종", data.industry],
      ["연락처", data.phone],
      ["희망 시간", `${data.contactDay}(${shortDate(data.contactDate)}) ${data.contactTime}`],
    ];
    summary.innerHTML = "";
    rows.forEach(([k, v]) => {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = k;
      dd.textContent = v;
      summary.append(dt, dd);
    });
    $("[data-test-note]").hidden = !testMode;
    showPanel("done");
    panels.done.focus({ preventScroll: true });
  }

  function showPanel(name) {
    Object.entries(panels).forEach(([key, panel]) => {
      const active = key === name;
      panel.hidden = !active;
      panel.classList.toggle("is-entering", active);
    });
    // 신청 창 안에 있을 때는 창 안에서만 맨 위로
    const sheetBody = form.closest("[data-sheet-body]");
    if (sheetBody) {
      sheetBody.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const top = form.getBoundingClientRect().top;
    const topbar = document.querySelector(".topbar")?.offsetHeight || 0;
    if (top < topbar || top > window.innerHeight * 0.6) {
      window.scrollTo({ top: window.scrollY + top - topbar - 16, behavior: "smooth" });
    }
  }
}

/* =========================================================
   helpers
   ========================================================= */

/** 세그먼트(2지선다): 선택된 위치로 흰색 썸을 옮깁니다 */
function initSegment(seg) {
  const inputs = [...seg.querySelectorAll('input[type="radio"]')];
  seg.style.setProperty("--n", inputs.length);
  const sync = () => {
    const i = Math.max(0, inputs.findIndex((r) => r.checked));
    seg.style.setProperty("--i", i);
  };
  inputs.forEach((r) => r.addEventListener("change", sync));
  sync();
}

function buildTimeSlots(grid) {
  const frag = document.createDocumentFragment();
  CONFIG.CONTACT_HOURS.forEach((h) => {
    const label = document.createElement("label");
    label.className = "choice";
    const text = `${h < 12 ? "오전" : "오후"} ${h}시`;
    label.innerHTML = `<input type="radio" name="contactTime" value="${text}" data-hour="${h}" /><span>${text}</span>`;
    frag.appendChild(label);
  });
  grid.appendChild(frag);
}

function digits(v) {
  return String(v || "").replace(/\D/g, "").slice(0, 11);
}

/** 01012345678 → 010-1234-5678 */
export function formatPhone(v) {
  const d = digits(v);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

export function isValidPhone(v) {
  return /^01[016789]\d{7,8}$/.test(digits(v)) && (digits(v).startsWith("010") ? digits(v).length === 11 : true);
}

function isCompletePhone(v) {
  const d = digits(v);
  return d.length === 11 && isValidPhone(d);
}

/** 기준 시간대(한국)의 현재 날짜/시 */
function nowInZone() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CONFIG.TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") };
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 연락 희망일 선택지 2개 (주말·CONFIG.HOLIDAYS 제외, 오늘 상담 시간이 끝났으면 오늘도 제외)
 * - 오늘·내일이 둘 다 영업일이면 "오늘" / "내일"
 * - 그 밖에는 요일 이름: 금요일엔 "금요일" / "월요일", 주말엔 "월요일" / "화요일"
 */
function contactDays() {
  const now = nowInZone();
  const lastHour = Math.max(...CONFIG.CONTACT_HOURS);
  const holidays = new Set(CONFIG.HOLIDAYS || []);
  const days = [];
  for (let offset = 0; days.length < 2 && offset < 30; offset += 1) {
    const d = new Date(Date.UTC(now.year, now.month - 1, now.day + offset));
    const date = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6 || holidays.has(date)) continue;
    if (offset === 0 && now.hour >= lastHour) continue;
    days.push({ date, offset, dow, isToday: offset === 0 });
  }
  const todayTomorrow = days[0].offset === 0 && days[1].offset === 1;
  return days.map((d) => ({
    ...d,
    label: todayTomorrow ? (d.offset === 0 ? "오늘" : "내일") : `${WEEKDAYS[d.dow]}요일`,
  }));
}

function shortDate(iso) {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
