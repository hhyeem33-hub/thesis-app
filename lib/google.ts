// 구글 드라이브 연결 설정 (화면·서버 공용)
// 세 값 모두 "공개해도 되는" 값이다: 클라이언트 ID, 브라우저용 API 키(리퍼러 제한), 프로젝트 번호.
// 비밀 값(클라이언트 보안 비밀번호)은 쓰지 않는다 — 브라우저에서 구글 로그인 창으로 바로 받는 방식.

export type GoogleConfig = { ready: boolean; clientId: string; apiKey: string; appId: string };

/** 붙여 넣을 때 딸려 온 앞뒤 공백·줄바꿈·따옴표를 뗀다 (공백 하나만 있어도 구글이 다른 ID로 보고 로그인 창을 바로 닫는다) */
const clean = (v?: string) => (v ?? "").trim().replace(/^["']|["']$/g, "").trim();

export function googleConfig(): GoogleConfig {
  const clientId = clean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
  const apiKey = clean(process.env.NEXT_PUBLIC_GOOGLE_API_KEY);
  const appId = clean(process.env.NEXT_PUBLIC_GOOGLE_APP_ID);
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
