"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_KEY, AUTH_URL, authClient, currentUser, isOwnerEmail } from "@/lib/auth";
import { db, dbPrepareAccount } from "@/lib/db";
import { ONLINE } from "@/lib/online";

type Result = { ok: true; url?: string } | { ok: false; error: string };

/** 로그인 뒤 돌아올 주소 (지금 접속한 주소 기준) */
async function callbackUrl() {
  const h = await headers();
  const origin = h.get("origin") || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  return `${origin}/auth/callback`;
}

function friendly(message: string) {
  if (/rate limit|security purposes|seconds/i.test(message))
    return "로그인 메일을 너무 자주 보냈어요. 1분쯤 뒤에 다시 눌러 주세요.";
  if (/provider is not enabled|Unsupported provider/i.test(message))
    return "구글 로그인이 아직 켜지지 않았어요. 지금은 이메일 링크로 로그인해 주세요.";
  if (/invalid.*email|email.*invalid/i.test(message)) return "이메일 주소를 확인해 주세요.";
  return message;
}

/** 이메일로 로그인 링크 보내기 (처음이면 계정이 새로 만들어짐) */
export async function sendLoginLink(email: string): Promise<Result> {
  if (!ONLINE) return { ok: false, error: "내 컴퓨터에서는 로그인 없이 써요." };
  const e = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: "이메일 주소를 확인해 주세요." };
  const supabase = await authClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: e,
    options: { emailRedirectTo: await callbackUrl(), shouldCreateUser: true },
  });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

/** 구글 로그인 주소 만들기 → 화면에서 그 주소로 이동 */
export async function googleLoginUrl(): Promise<Result> {
  if (!ONLINE) return { ok: false, error: "내 컴퓨터에서는 로그인 없이 써요." };
  const supabase = await authClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: await callbackUrl(), skipBrowserRedirect: true },
  });
  if (error || !data.url) return { ok: false, error: friendly(error?.message ?? "구글 로그인 주소를 만들지 못했어요.") };
  return { ok: true, url: data.url };
}

export async function signOut() {
  if (ONLINE) {
    const supabase = await authClient();
    await supabase.auth.signOut();
  }
  redirect(ONLINE ? "/welcome" : "/");
}

// ── 이메일 + 비밀번호 ────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

/**
 * 이메일 + 비밀번호로 들어가기.
 * - 있는 계정이면 로그인
 * - 처음 쓰는 이메일이면 계정을 만들고 바로 로그인 (메일 확인 없이: 서버 관리 권한으로 '확인됨'으로 만든다)
 */
export async function passwordLogin(email: string, password: string): Promise<{ ok: false; error: string } | { ok: true; created: boolean }> {
  if (!ONLINE) return { ok: false, error: "내 컴퓨터에서는 로그인 없이 써요." };
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return { ok: false, error: "이메일 주소를 확인해 주세요." };
  if (password.length < MIN_PASSWORD) return { ok: false, error: `비밀번호는 ${MIN_PASSWORD}자 이상으로 적어 주세요.` };

  const supabase = await authClient();
  let created = false;
  let { data, error } = await supabase.auth.signInWithPassword({ email: e, password });

  if (error && /invalid login credentials/i.test(error.message)) {
    // 없는 계정인지, 비밀번호가 틀린 건지: 만들어 보고 "이미 있음"이면 비밀번호가 틀린 것
    const { error: cErr } = await db().auth.admin.createUser({ email: e, password, email_confirm: true });
    if (cErr) {
      if (/already|exists|registered/i.test(cErr.message))
        return {
          ok: false,
          error: isOwnerEmail(e)
            ? "비밀번호가 맞지 않아요. 이 계정은 이메일 링크로 만들어져서 아직 비밀번호가 없을 수 있어요. 아래 ‘이메일 링크로 들어가기’로 들어간 뒤 설정에서 비밀번호를 정해 주세요."
            : "비밀번호가 맞지 않아요. 다시 확인해 주세요.",
        };
      return { ok: false, error: `계정을 만들지 못했어요: ${cErr.message}` };
    }
    created = true;
    ({ data, error } = await supabase.auth.signInWithPassword({ email: e, password }));
  }
  if (error || !data.user) return { ok: false, error: friendly(error?.message ?? "로그인에 실패했어요.") };

  try {
    await dbPrepareAccount({ id: data.user.id, isOwner: isOwnerEmail(data.user.email) });
  } catch (err) {
    console.error("계정 준비 실패:", err instanceof Error ? err.message : err);
  }
  return { ok: true, created };
}

/** 로그인 화면에 보여 줄 방법 (구글은 슈파베이스에서 켰을 때만) */
export async function loginOptions(): Promise<{ google: boolean }> {
  if (!ONLINE || !AUTH_URL || !AUTH_KEY) return { google: false };
  try {
    const res = await fetch(`${AUTH_URL}/auth/v1/settings`, { headers: { apikey: AUTH_KEY }, cache: "no-store" });
    const s = (await res.json()) as { external?: { google?: boolean } };
    return { google: !!s.external?.google };
  } catch {
    return { google: false };
  }
}

/** 로그인한 사람이 비밀번호를 정하거나 바꾼다 (이메일 링크로 만든 계정도 여기서 비밀번호를 정함) */
export async function setMyPassword(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ONLINE) return { ok: false, error: "내 컴퓨터에서는 로그인 없이 써요." };
  if (!(await currentUser())) return { ok: false, error: "로그인이 필요해요." };
  if (password.length < MIN_PASSWORD) return { ok: false, error: `비밀번호는 ${MIN_PASSWORD}자 이상으로 적어 주세요.` };
  const supabase = await authClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error)
    return {
      ok: false,
      error: /different from the old|same/i.test(error.message) ? "지금 비밀번호와 같아요. 다른 비밀번호를 적어 주세요." : friendly(error.message),
    };
  return { ok: true };
}
