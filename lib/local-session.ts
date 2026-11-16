// 내 컴퓨터(localhost) 로그인 문: 온라인과 같은 계정(이메일 + 비밀번호)으로 확인하고, 서명한 쿠키로 기억한다.
// 자료 저장은 그대로 내 컴퓨터(data/*.json) — 로그인은 "들어오는 문"만 담당한다.
// 서명 열쇠는 .env.local 의 SUPABASE_SECRET_KEY (브라우저로 나가지 않음). proxy.ts 에서도 쓰므로 Web Crypto 만 쓴다.

export const LOCAL_SESSION_COOKIE = "local_session";
export const LOCAL_SESSION_DAYS = 7;

const enc = new TextEncoder();

function secret() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(`local-session:${secret()}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 이메일은 base64url 로 넣는다 (쿠키를 읽을 때 %40 같은 글자가 풀려서 서명이 어긋나지 않게)
const toB64 = (s: string) => btoa(String.fromCharCode(...enc.encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

/** 쿠키 값 = 이메일(base64url).만료시각.서명 */
export async function signLocalSession(email: string) {
  const exp = Date.now() + LOCAL_SESSION_DAYS * 24 * 60 * 60 * 1000;
  const body = `${toB64(email)}.${exp}`;
  return `${body}.${await hmac(body)}`;
}

/** 서명이 맞고 만료 전이면 이메일, 아니면 null */
export async function verifyLocalSession(value: string | undefined | null): Promise<string | null> {
  if (!value || !secret()) return null;
  const [email, exp, sig] = value.split(".");
  if (!email || !exp || !sig || Number(exp) < Date.now()) return null;
  const expected = await hmac(`${email}.${exp}`);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    return fromB64(email);
  } catch {
    return null;
  }
}
