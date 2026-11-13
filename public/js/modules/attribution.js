/**
 * 유입 경로 저장 (UTM, 리퍼러, 랜딩 URL)
 * 광고 링크에 ?utm_source=daangn&utm_campaign=... 처럼 붙여두면 신청서와 함께 시트/슬랙으로 전달됩니다.
 * 같은 탭에서 페이지를 옮겨 다녀도 처음 들어온 값을 유지합니다(sessionStorage).
 */
const KEY = "paydv:attribution";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

export function captureAttribution() {
  try {
    const params = new URLSearchParams(window.location.search);
    const hasUtm = UTM_KEYS.some((k) => params.get(k));
    if (!hasUtm && sessionStorage.getItem(KEY)) return;

    const data = {
      landing: window.location.href,
      referrer: document.referrer || "",
    };
    UTM_KEYS.forEach((k) => {
      data[k] = params.get(k) || "";
    });
    sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* 사생활 보호 모드 등에서 저장소를 못 쓰면 무시 */
  }
}

export function getAttribution() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (saved) return saved;
  } catch {
    /* ignore */
  }
  return { landing: window.location.href, referrer: document.referrer || "" };
}
