/**
 * 분석 이벤트 전송 (설치된 도구가 있을 때만 동작)
 * - Google Tag Manager: window.dataLayer
 * - GA4: window.gtag
 * - Meta 픽셀: window.fbq
 * - 네이버 전환 추적: window.wcs (공통 스크립트는 index.html 맨 아래, 계정 ID s_2bd1a5b078d9)
 * 아무것도 설치되어 있지 않으면(광고 차단 등) 조용히 무시합니다.
 */
export function track(event, params = {}) {
  try {
    if (Array.isArray(window.dataLayer)) window.dataLayer.push({ event, ...params });
    if (typeof window.gtag === "function") window.gtag("event", event, params);
    if (typeof window.fbq === "function" && event === "lead_submit") window.fbq("track", "Lead");
    // 네이버 신청완료(lead) 전환: 신청이 시트에 실제로 접수된 뒤 한 번만 보냅니다 (form.js)
    if (event === "lead_submit" && window.wcs && typeof window.wcs.trans === "function") {
      window.wcs.trans({ type: "lead" });
    }
  } catch {
    /* ignore */
  }
}
