// 구글 드라이브 연결 설정 (화면·서버 공용)
// 세 값 모두 "공개해도 되는" 값이다: 클라이언트 ID, 브라우저용 API 키(리퍼러 제한), 프로젝트 번호.
// 비밀 값(클라이언트 보안 비밀번호)은 쓰지 않는다 — 브라우저에서 구글 로그인 창으로 바로 받는 방식.

export type GoogleConfig = { ready: boolean; clientId: string; apiKey: string; appId: string };

export function googleConfig(): GoogleConfig {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? "";
  const appId = process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? "";
  return { ready: !!(clientId && apiKey && appId), clientId, apiKey, appId };
}

/** 드라이브에서 고를 수 있는 파일 (PDF·Word·한글, 구글 문서는 Word로 바꿔 받음) */
export const DRIVE_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/x-hwp",
  "application/haansofthwp",
  "application/vnd.hancom.hwp",
  "application/hwp+zip",
  "application/vnd.hancom.hwpx",
  "application/octet-stream",
  "application/vnd.google-apps.document",
];

export const DRIVE_EXT = [".pdf", ".docx", ".hwp", ".hwpx"];
