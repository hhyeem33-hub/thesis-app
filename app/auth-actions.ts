"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authClient } from "@/lib/auth";
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
