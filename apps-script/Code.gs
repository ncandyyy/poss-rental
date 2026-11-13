/**
 * 페이앤밴 렌탈 상담 신청 접수 (Google Apps Script 웹 앱)
 *
 * 하는 일
 *  1) 웹사이트 폼에서 보낸 신청서를 구글 시트에 한 줄씩 저장
 *  2) 슬랙 채널로 새 신청 알림 전송
 *  3) 상단 바에 보여줄 누적 조회수 집계
 *
 * 설정 방법은 docs/form-setup.md 를 보세요. 요약:
 *  - 신청을 받을 구글 시트 > 확장 프로그램 > Apps Script 에 이 파일 내용을 붙여넣기
 *  - 프로젝트 설정 > 스크립트 속성에 SLACK_WEBHOOK_URL 추가
 *  - setup() 한 번 실행 → 배포 > 새 배포 > 웹 앱 (액세스: 모든 사용자)
 *  - 나온 웹 앱 URL 을 public/js/config.js 의 FORM_ENDPOINT 에 넣기
 */

const SHEET_NAME = '신청목록';

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

    const receivedAt = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    const sheet = getSheet_();
    sheet.appendRow(buildRow_(data, receivedAt));
    const rowNumber = sheet.getLastRow();

    try {
      notifySlack_(data, sheet, rowNumber, receivedAt);
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
 * GET 요청
 *  ?action=view  → 누적 조회수 +1 후 총합 반환 (상단 바 "지금까지 N명")
 *  ?action=count → 총합만 반환 (같은 방문자가 새로고침한 경우)
 *  (없음)        → 동작 확인용 응답
 * 누적 조회수는 프로젝트 설정 > 스크립트 속성 VIEW_COUNT 에 저장됩니다.
 */
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (action === 'view') return json_({ ok: true, views: incrementViews_() });
  if (action === 'count') return json_({ ok: true, views: getViews_() });
  return json_({ ok: true, service: 'paydv-rental-leads' });
}

/* =========================================================
   누적 조회수
   ========================================================= */
function getViews_() {
  return Number(PropertiesService.getScriptProperties().getProperty('VIEW_COUNT')) || 0;
}

function incrementViews_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return getViews_(); // 동시 접속이 몰리면 이번 1건은 건너뜀
  try {
    const props = PropertiesService.getScriptProperties();
    const next = (Number(props.getProperty('VIEW_COUNT')) || 0) + 1;
    props.setProperty('VIEW_COUNT', String(next));
    return next;
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================
   시트
   ========================================================= */
function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#e8f3ff');
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
 * 쓸 수 있는 값: receivedAt, storeStatus, industry, phone, contactDay, contactDate, contactTime, sheetUrl
 */
const SLACK_FIELDS = ['receivedAt', 'storeStatus', 'industry', 'phone', 'contactDay', 'contactDate', 'contactTime'];

// 슬랙에는 상담에 필요한 정보만 보냅니다. (처리상태·유입 경로·랜딩 URL·기기 정보는 시트에만 저장)
function notifySlack_(d, sheet, rowNumber, receivedAt) {
  const url = PropertiesService.getScriptProperties().getProperty('SLACK_WEBHOOK_URL');
  if (!url) return;

  const values = {
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

/** 처음 한 번 실행: 시트와 머리글을 만들고 필요한 권한을 승인받습니다. */
function setup() {
  getSheet_();
  UrlFetchApp.fetch('https://slack.com', { muteHttpExceptions: true }); // 외부 요청 권한 승인용
}

/** 테스트: 가짜 신청 한 건을 저장하고 슬랙 알림을 보냅니다. (확인 후 시트의 테스트 행은 지워주세요) */
function testSubmit() {
  const res = doPost({
    postData: {
      contents: JSON.stringify({
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
