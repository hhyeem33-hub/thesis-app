import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { ONLINE } from "@/lib/online";

// 온라인(버셀)에서만: 로그인 상태(쿠키)를 새로 고치고, 로그인 안 한 사람은 둘러보기 화면(/welcome)만 보게 한다.
// 내 컴퓨터(localhost)는 아무것도 하지 않는다 → 지금처럼 로그인 없이 쓴다.
// ⚠️ 실제 보호는 서버 쪽(lib/db.ts 의 requireUserId)에서도 한 번 더 한다.

const OPEN = ["/welcome", "/auth/callback"];

export async function proxy(request: NextRequest) {
  if (!ONLINE) return NextResponse.next();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const open = OPEN.some((p) => path === p || path.startsWith(`${p}/`));
  if (!user && !open) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
    return NextResponse.redirect(new URL("/welcome", request.url));
  }
  if (user && path === "/welcome") return NextResponse.redirect(new URL("/dashboard", request.url));
  return response;
}

export const config = {
  // 그림·글꼴·빌드 파일은 건너뛴다
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};
