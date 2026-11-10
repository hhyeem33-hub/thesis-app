import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
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

// ── 둘러보기 모드 (로그인 없이 주인 계정 자료를 읽기만) ─────────────────────────
// 로그인 화면의 [둘러보기]를 누르면 쿠키(guest_view)가 생긴다. 이때는 주인 계정의 자료를 "읽기만" 한다.
// 저장·채택·삭제·AI 판단·AI 초안 등 바꾸거나 비용이 드는 일은 서버에서 막는다(requireWriter, guestBlock).
// AI 키는 currentUser(실제 로그인한 사람) 기준이라 둘러보기에는 절대 넘어가지 않는다.

export const GUEST_COOKIE = "guest_view";
export const GUEST_MESSAGE = "둘러보기 모드에서는 볼 수만 있어요. 로그인하면 내 계정으로 쓸 수 있어요.";

/** 로그인하지 않고 둘러보기 쿠키가 있는지 */
export const isGuest = cache(async (): Promise<boolean> => {
  if (!ONLINE) return false;
  if (await currentUser()) return false;
  return (await cookies()).get(GUEST_COOKIE)?.value === "1";
});

let ownerIdCache: string | null = null;

/** 주인 계정(OWNER_EMAIL)의 id — 비밀 키로 한 번 찾아서 기억해 둔다 */
async function ownerId(): Promise<string> {
  if (ownerIdCache) return ownerIdCache;
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!owner || !url || !key) throw new Error("둘러보기를 준비하지 못했어요 (주인 계정 설정이 없어요).");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`둘러보기를 준비하지 못했어요: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === owner);
    if (found) return (ownerIdCache = found.id);
    if (data.users.length < 200) break;
  }
  throw new Error("둘러보기를 준비하지 못했어요 (주인 계정을 찾지 못했어요).");
}

/** 자료를 "읽을" 때: 로그인한 사람 → 자기 것, 둘러보기 → 주인 계정 것, 그 밖 → 막음 */
export async function requireUserId(): Promise<string> {
  const u = await currentUser();
  if (u) return u.id;
  if (await isGuest()) return ownerId();
  throw new Error("로그인이 필요해요. 첫 화면에서 로그인해 주세요.");
}

/** 자료를 "바꿀" 때: 실제로 로그인한 사람만 (둘러보기는 막음) */
export async function requireWriter(): Promise<string> {
  const u = await currentUser();
  if (u) return u.id;
  if (await isGuest()) throw new Error(GUEST_MESSAGE);
  throw new Error("로그인이 필요해요. 첫 화면에서 로그인해 주세요.");
}

/** 서버 함수 맨 앞에서: 둘러보기면 안내 문구로 바로 돌려보낸다 (AI 비용이 드는 일 포함) */
export async function guestBlock(): Promise<{ ok: false; error: string } | null> {
  return (await isGuest()) ? { ok: false, error: GUEST_MESSAGE } : null;
}
