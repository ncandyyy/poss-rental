/**
 * 페이앤밴 렌탈 상담 신청 접수 — 여러 상세페이지 공용 (Google Apps Script 웹 앱)
 *
 * 하는 일
 *  1) 웹사이트 폼에서 보낸 신청서를 구글 시트에 한 줄씩 저장 (페이지마다 다른 탭)
 *  2) 슬랙 채널로 새 신청 알림 전송
 *  3) 상단 바에 보여줄 누적 조회수 집계 (페이지마다 따로)
 *
 * 페이지 구분: 웹사이트가 신청서에 page 값(예: "connect")을 같이 보냅니다.
 *  page 값이 없으면 토스 렌탈로 봅니다 → 토스 렌탈 사이트는 고치지 않아도 그대로 동작합니다.
 *
 * 설정 방법은 docs/form-setup.md 를 보세요. 요약:
 *  - 토스 렌탈 신청 시트 > 확장 프로그램 > Apps Script 의 코드를 이 파일 내용으로 통째로 바꾸고 저장
 *  - setup() 한 번 실행 (없는 탭만 새로 생성 — 이번에는 '포스기 신청목록')
 *  - 배포 > 배포 관리 > 연필(수정) > 버전: 새 버전 > 배포  ← 웹 앱 URL 이 그대로 유지됩니다
 *  - 같은 웹 앱 URL 을 이 페이지의 public/js/config.js FORM_ENDPOINT 에 넣기
 */

/**
 * 상세페이지 목록 — 페이지를 더 만들면 여기에 한 묶음 추가하고, 그 페이지 config.js 의 PAGE_ID 를 맞춰주세요.
 *  name     : 페이지 이름 (슬랙 변수 page)
 *  product  : 상품 구성 문구 (슬랙 변수 product)
 *  siteUrl  : 상세페이지 주소 (슬랙 변수 siteUrl)
 *  sheet    : 신청이 쌓이는 탭 이름 (시트에서 탭 이름을 바꾸면 여기도 똑같이 바꿔야 합니다.
 *             다르면 그 이름으로 빈 탭을 새로 만들어 거기에 쌓습니다)
 *  viewKey  : 누적 조회수를 저장하는 스크립트 속성 이름
 *  slackKey : 이 페이지 알림을 보낼 슬랙 워크플로 웹훅 주소를 넣어둔 스크립트 속성 이름
 *             (비어 있으면 기본 SLACK_WEBHOOK_URL 로 보냅니다 → 알림이 빠지지 않게)
 *  color    : 탭 머리글 배경색
 */
const PAGES = {
  toss: {
    name: '토스 렌탈',
    product: '토스 프론트+토스 터미널+토스 포스',
    siteUrl: 'https://toss-rental.netlify.app/',
    sheet: '토스 신청목록', // 탭 이름을 바꾸면 여기도 똑같이 바꾸고 새 버전으로 배포
    viewKey: 'VIEW_COUNT',
    slackKey: 'SLACK_WEBHOOK_URL',
    color: '#e8f3ff',
  },
  connect: {
    name: '네이버 커넥트',
    product: '네이버 커넥트 + 카드 단말기 + N포스',
    siteUrl: 'https://connect-rental.netlify.app/',
    sheet: '커넥트 신청목록',
    viewKey: 'VIEW_COUNT_CONNECT',
    slackKey: 'SLACK_WEBHOOK_URL_CONNECT',
    color: '#ebfef2',
  },
  poss: {
    name: '포스기 렌탈',
    product: '윈도우 포스+금전함+토스 프론트+토스 터미널',
    siteUrl: 'https://poss-rental.netlify.app/',
    sheet: '포스기 신청목록',
    viewKey: 'VIEW_COUNT_POSS',
    slackKey: 'SLACK_WEBHOOK_URL_POSS',
    color: '#fff4e0',
  },
};
const DEFAULT_PAGE = 'toss'; // page 값이 없거나 모르는 값이면 이 페이지로

function page_(id) {
  return PAGES[id] || PAGES[DEFAULT_PAGE];
}

// 시트 열 순서 (바꾸고 싶으면 이 배열과 buildRow_ 를 함께 수정)
// 앞 6개는 상담용으로 보는 열, '처리상태'부터 뒤는 기록용 열이라 한꺼번에 숨겨두기 좋게 맨 뒤에 모았습니다.
const HEADERS = [
  '접수일시',
  '매장 상태',
  '업종',
  '휴대폰',
  '연락 희망일',
  '연락 희망 시간',
  '처리상태',
  '개인정보 동의',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  '유입 경로(referrer)',
  '랜딩 URL',
  '기기 정보',
];

/* =========================================================
   웹 앱 진입점
   ========================================================= */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // 스팸 봇(숨김 칸 채움)은 저장하지 않고 성공처럼 응답
    if (data.website) return json_({ ok: true });

    const phoneDigits = String(data.phone || '').replace(/\D/g, '');
    if (!/^01[016789]\d{7,8}$/.test(phoneDigits)) return json_({ ok: false, error: 'invalid_phone' });
    if (!data.consent) return json_({ ok: false, error: 'consent_required' });

    const page = page_(data.page);
    const receivedAt = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    const sheet = getSheet_(page);
    sheet.appendRow(buildRow_(data, receivedAt));
    const rowNumber = sheet.getLastRow();

    try {
      notifySlack_(data, page, sheet, rowNumber, receivedAt);
    } catch (slackErr) {
      // 슬랙 실패해도 신청 자체는 저장됐으므로 성공 처리
      console.error('Slack notify failed', slackErr);
    }

    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server_error' });
  } finally {
    lock.releaseLock();
  }
}

/**
 * GET 요청 (&page=connect 처럼 페이지를 붙이면 그 페이지 숫자, 없으면 토스 렌탈 숫자)
 *  ?action=view  → 누적 조회수 +1 후 총합 반환 (상단 바 "지금까지 N명")
 *  ?action=count → 총합만 반환 (같은 방문자가 새로고침한 경우)
 *  (없음)        → 동작 확인용 응답
 * 누적 조회수는 프로젝트 설정 > 스크립트 속성 (PAGES 의 viewKey: VIEW_COUNT, VIEW_COUNT_CONNECT ...) 에 저장됩니다.
 */
function doGet(e) {
  const params = (e && e.parameter) || {};
  const page = page_(params.page);
  if (params.action === 'view') return json_({ ok: true, views: incrementViews_(page) });
  if (params.action === 'count') return json_({ ok: true, views: getViews_(page) });
  return json_({ ok: true, service: 'paydv-rental-leads', pages: Object.keys(PAGES) });
}

/* =========================================================
   누적 조회수 (페이지별)
   ========================================================= */
function getViews_(page) {
  return Number(PropertiesService.getScriptProperties().getProperty(page.viewKey)) || 0;
}

function incrementViews_(page) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return getViews_(page); // 동시 접속이 몰리면 이번 1건은 건너뜀
  try {
    const props = PropertiesService.getScriptProperties();
    const next = (Number(props.getProperty(page.viewKey)) || 0) + 1;
    props.setProperty(page.viewKey, String(next));
    return next;
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================
   시트
   ========================================================= */
// 페이지 탭을 찾고, 없으면 머리글과 함께 새로 만듭니다
function getSheet_(page) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(page.sheet);
  if (!sheet) sheet = ss.insertSheet(page.sheet);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground(page.color);
  }
  return sheet;
}

function buildRow_(d, receivedAt) {
  const contactDay = d.contactDate ? `${d.contactDay} (${d.contactDate})` : d.contactDay;
  return [
    receivedAt,
    d.storeStatus,
    d.industry,
    formatPhone_(d.phone),
    contactDay,
    d.contactTime,
    '신규',
    d.consent ? '동의' : '',
    d.utm_source,
    d.utm_medium,
    d.utm_campaign,
    d.utm_content,
    d.utm_term,
    d.referrer,
    d.landing,
    d.userAgent,
  ].map(safeCell_);
}

// 셀이 수식으로 해석되지 않도록 (=, +, -, @ 로 시작하는 값 방어)
function safeCell_(v) {
  const s = v === undefined || v === null ? '' : String(v).slice(0, 500);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function formatPhone_(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
}

/* =========================================================
   슬랙
   ========================================================= */
/**
 * 슬랙 워크플로 웹훅으로 보낼 변수 이름 (워크플로 빌더에서 만든 변수 이름과 똑같아야 합니다)
 * 메시지 모양은 슬랙 워크플로에서 정하고, 여기서는 값만 보냅니다.
 * 쓸 수 있는 값: receivedAt, storeStatus, industry, phone, contactDay, contactDate, contactTime, sheetUrl,
 *               page(페이지 이름), product(상품 구성 문구), siteUrl(상세페이지 주소)
 *
 * 페이지별 알림 문구를 다르게 하는 방법 (docs/form-setup.md 2번)
 *  ① 추천: 페이지마다 워크플로를 따로 두기 — 페이지용 워크플로 웹훅 주소를 스크립트 속성(PAGES 의 slackKey: SLACK_WEBHOOK_URL_CONNECT, SLACK_WEBHOOK_URL_POSS ...)에 넣기
 *          (아래 목록은 그대로. 문구·링크는 각 워크플로 메시지에 직접 적습니다)
 *  ② 워크플로 하나로: 워크플로에 product, siteUrl 변수를 먼저 추가한 뒤 아래 목록에 'product', 'siteUrl' 을 넣기
 *     (워크플로에 없는 변수를 보내면 알림이 실패할 수 있어서, 기본값에는 넣지 않았습니다)
 */
const SLACK_FIELDS = ['receivedAt', 'storeStatus', 'industry', 'phone', 'contactDay', 'contactDate', 'contactTime'];

// 슬랙에는 상담에 필요한 정보만 보냅니다. (처리상태·유입 경로·랜딩 URL·기기 정보는 시트에만 저장)
function notifySlack_(d, page, sheet, rowNumber, receivedAt) {
  // 페이지 전용 워크플로가 있으면 그쪽으로, 없으면 기본 워크플로로 보냅니다 (알림이 빠지지 않게)
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty(page.slackKey) || props.getProperty('SLACK_WEBHOOK_URL');
  if (!url) return;

  const values = {
    page: page.name,
    product: page.product,
    siteUrl: page.siteUrl,
    receivedAt: receivedAt,
    storeStatus: d.storeStatus,
    industry: d.industry,
    phone: formatPhone_(d.phone),
    contactDay: d.contactDay,
    contactDate: d.contactDate,
    contactTime: d.contactTime,
    sheetUrl: `${sheet.getParent().getUrl()}#gid=${sheet.getSheetId()}&range=A${rowNumber}`,
  };
  const payload = {};
  SLACK_FIELDS.forEach((key) => {
    payload[key] = values[key] === undefined || values[key] === null ? '' : String(values[key]);
  });

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) {
    console.error('Slack 전송 실패', res.getResponseCode(), res.getContentText());
  }
}

/* =========================================================
   유틸
   ========================================================= */
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* =========================================================
   ▼ 일회용: 처음 설정할 때만 편집기에서 직접 실행합니다.
     설정과 테스트가 끝나면 이 아래(setup, testSubmit)는 지워도 됩니다.
   ========================================================= */

/** 처음 한 번 실행: 페이지별 탭과 머리글을 만들고 필요한 권한을 승인받습니다. (이미 있는 탭은 그대로 둡니다) */
function setup() {
  Object.keys(PAGES).forEach((id) => getSheet_(PAGES[id]));
  UrlFetchApp.fetch('https://slack.com', { muteHttpExceptions: true }); // 외부 요청 권한 승인용
}

/** 테스트: 네이버 커넥트 페이지로 가짜 신청 한 건 → '커넥트 신청목록' 탭 + 슬랙 알림 (확인 후 테스트 행은 지워주세요) */
function testSubmitConnect() {
  testSubmit_('connect');
}

/** 테스트: 포스기 렌탈 페이지로 가짜 신청 한 건 → '포스기 신청목록' 탭 + 슬랙 알림 (확인 후 테스트 행은 지워주세요) */
function testSubmitPoss() {
  testSubmit_('poss');
}

/** 테스트: 토스 렌탈 페이지로 가짜 신청 한 건 → '토스 신청목록' 탭 + 슬랙 알림 */
function testSubmitToss() {
  testSubmit_('toss');
}

function testSubmit_(pageId) {
  const res = doPost({
    postData: {
      contents: JSON.stringify({
        page: pageId,
        storeStatus: '매장 운영 중',
        industry: '카페 · 디저트',
        phone: '010-0000-0000',
        contactDay: '내일',
        contactDate: Utilities.formatDate(new Date(Date.now() + 86400000), 'Asia/Seoul', 'yyyy-MM-dd'),
        contactTime: '오후 14시',
        consent: true,
        utm_source: 'test',
        utm_campaign: 'apps-script-test',
        landing: 'https://example.com',
      }),
    },
  });
  console.log(res.getContent());
}
