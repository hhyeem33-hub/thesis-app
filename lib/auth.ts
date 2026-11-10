import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { ONLINE } from "./online";

// 로그인 (온라인 전용). 내 컴퓨터(localhost)는 지금처럼 로그인 없이 쓴다.
// - 로그인은 슈파베이스 Auth (이메일 링크, 구글). 브라우저에는 공개 키(publishable/anon)만 간다.
// - 주인 계정(환경 변수 OWNER_EMAIL)만 버셀의 Claude API 키를 쓰고, 처음 로그인할 때 지금 있는 자료를 넘겨받는다.

export const AUTH_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
export const AUTH_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

export type AppUser = { id: string; email: string; isOwner: boolean };

/** 서버에서 쓰는 로그인 도구 (쿠키로 로그인 상태를 주고받음) */
export async function authClient() {
  const store = await cookies();
  return createServerClient(AUTH_URL, AUTH_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // 화면(서버 컴포넌트)에서는 쿠키를 못 바꾼다 — proxy.ts 가 새로 고쳐 준다
        }
      },
    },
  });
}

export function isOwnerEmail(email: string | undefined | null) {
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  return !!owner && !!email && email.trim().toLowerCase() === owner;
}

/** 지금 로그인한 사람 (내 컴퓨터는 항상 null — 로그인 없이 씀) */
export const currentUser = cache(async (): Promise<AppUser | null> => {
  if (!ONLINE) return null;
  const supabase = await authClient();
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  if (!u) return null;
  return { id: u.id, email: u.email ?? "", isOwner: isOwnerEmail(u.email) };
});

/** 온라인에서 자료를 읽고 쓸 때: 로그인 안 했으면 막는다 */
export async function requireUserId(): Promise<string> {
  const u = await currentUser();
  if (!u) throw new Error("로그인이 필요해요. 첫 화면에서 로그인해 주세요.");
  return u.id;
}
