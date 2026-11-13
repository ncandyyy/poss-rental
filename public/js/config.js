/**
 * 사이트 설정 — 운영하면서 바꿀 값은 여기만 고치면 됩니다.
 */
export const CONFIG = {
  /**
   * 신청서를 받을 Google Apps Script 웹 앱 주소 (https://script.google.com/macros/s/.../exec)
   * 토스 렌탈·네이버 커넥트와 같은 시트·같은 주소를 씁니다. 신청은 PAGE_ID 로 구분돼 '포스기 신청목록' 탭에 따로 쌓입니다.
   * 설정 방법: docs/form-setup.md  (먼저 Apps Script 의 PAGES 에 poss 를 추가해 새 버전으로 배포한 뒤에 주소를 넣어주세요.
   *  그 전에 넣으면 포스기 신청이 토스 탭·토스 알림으로 들어갑니다)
   * 비워두면 "테스트 모드"로 동작합니다 (화면 흐름만 확인, 실제 전송 안 됨).
   */
  FORM_ENDPOINT: "https://script.google.com/macros/s/AKfycbwNtV2k8VgZqCxJ-uj7SxF0V_XyBKWrPEUNocFY6NQvfqbyBxF3R1pZ1aJ93N39L-S5/exec",

  /** 이 페이지 이름표. 시트 탭·누적 조회수를 페이지별로 나눌 때 씁니다. (apps-script/Code.gs 의 PAGES 와 같은 값) */
  PAGE_ID: "poss",

  /** 업종 선택 목록 */
  BUSINESS_TYPES: [
    "음식점",
    "카페 · 디저트",
    "주점 · 호프",
    "편의점 · 마트",
    "도소매 · 쇼핑",
    "뷰티 · 미용",
    "병원 · 약국",
    "학원 · 교육",
    "숙박",
    "서비스업",
    "기타",
  ],

  /**
   * 상담 쉬는 날 (주말은 자동으로 제외). 연락 희망일 선택지에서 빠집니다.
   * 공휴일·회사 휴무일을 "YYYY-MM-DD" 로 추가하세요.
   */
  HOLIDAYS: ["2026-12-25", "2027-01-01"],

  /** 연락 가능 시간 (24시간 기준). 화면에는 "오전 9시", "오후 13시"처럼 표시됩니다. */
  CONTACT_HOURS: [9, 10, 11, 12, 13, 14, 15, 16, 17],

  /** 기능 캐러셀 자동 넘김 간격 (ms) */
  CAROUSEL_INTERVAL: 3500,

  /** 시간 계산 기준 */
  TIMEZONE: "Asia/Seoul",
};
