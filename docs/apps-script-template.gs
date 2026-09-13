/**
 * 단붕이의 대치동 이차곡선 탐험 - 학생 도감 기록을 구글시트에 자동으로 쌓아주는 Apps Script.
 *
 * 사용법
 * 1) 학생들의 기록을 모을 새 구글 스프레드시트를 하나 만듭니다 (예: "대치동 이차곡선 도감 기록").
 * 2) 시트 메뉴에서 확장 프로그램 -> Apps Script 를 엽니다.
 * 3) 기본으로 열려있는 코드를 모두 지우고, 이 파일의 내용 전체를 붙여넣습니다.
 * 4) 상단의 "배포" -> "새 배포"를 클릭합니다.
 *    - 유형 선택(톱니바퀴)에서 "웹 앱"을 선택합니다.
 *    - "액세스 권한"을 "모든 사용자"로 설정합니다. (학생들의 브라우저에서 로그인 없이 호출하기 때문에 필요합니다)
 *    - 배포를 누르면 "웹 앱 URL"이 나옵니다. 이 URL을 복사해두세요.
 * 5) 게임 파일(index.html)을 열어 SHEETS_WEBHOOK_URL 변수를 찾아 이 URL을 붙여넣고 저장합니다.
 *    (index.html 안에서 Ctrl+F로 "SHEETS_WEBHOOK_URL" 검색하면 바로 찾을 수 있습니다.)
 * 6) 이제 학생이 게임에서 "나가기" -> "도감을 전송하시겠습니까?" -> "네"를 누르면
 *    이 스프레드시트에 학생 이름/시간/점수/발견한 이차곡선 목록이 한 줄씩 자동으로 추가됩니다.
 *
 * 참고: 처음 배포할 때 "승인 필요" 화면이 뜨면, 본인 계정으로 진행 -> 고급 -> 안전하지 않음(계속 이동)을
 * 눌러 권한을 허용해야 합니다(Google이 아직 검수하지 않은 개인 스크립트라 뜨는 정상적인 경고입니다).
 * 학생 코드를 수정한 뒤에는 "새 배포"가 아니라 기존 배포를 "관리" -> "편집" -> "새 버전"으로 업데이트해야
 * URL이 바뀌지 않습니다.
 */

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // 첫 실행이라 헤더가 없으면 헤더를 먼저 추가
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['이름', '전송시각', '방(room)', '점수', '발견 개수', '전체 개수', '발견한 이차곡선 목록', '학생ID']);
  }

  var data = {};
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    data = {};
  }

  sheet.appendRow([
    data.name || '',
    data.timestamp || new Date().toISOString(),
    data.room || '',
    data.score || 0,
    data.foundCount || 0,
    data.total || '',
    data.found || '',
    data.studentId || ''
  ]);

  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
