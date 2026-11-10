import { NextResponse, type NextRequest } from "next/server";
import { authClient, GUEST_COOKIE, isOwnerEmail } from "@/lib/auth";
import { dbPrepareAccount } from "@/lib/db";

// 이메일 링크·구글 로그인에서 돌아오는 곳: 로그인 확정 → 계정 준비(주인은 기존 자료 넘겨받기, 처음이면 '새 프로젝트 1') → 대시보드
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const fail = (msg: string) => NextResponse.redirect(new URL(`/welcome?error=${encodeURIComponent(msg)}`, url.origin));

  const reason = url.searchParams.get("error_description");
  if (reason) return fail(/expired|invalid/i.test(reason) ? "로그인 링크가 만료됐어요. 다시 보내 주세요." : reason);
  if (!code) return fail("로그인 정보가 없어요. 다시 시도해 주세요.");

  const supabase = await authClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user)
    return fail(
      /code verifier|both auth code/i.test(error?.message ?? "")
        ? "로그인 링크는 요청한 같은 브라우저에서 열어 주세요."
        : error?.message ?? "로그인에 실패했어요."
    );

  try {
    await dbPrepareAccount({ id: data.user.id, isOwner: isOwnerEmail(data.user.email) });
  } catch (e) {
    // 로그인은 됐지만 계정 준비 실패 (예: auth.sql 을 아직 안 돌림) → 대시보드에서 안내가 보인다
    console.error("계정 준비 실패:", e instanceof Error ? e.message : e);
  }
  const res = NextResponse.redirect(new URL("/dashboard", url.origin));
  res.cookies.delete(GUEST_COOKIE); // 로그인했으면 둘러보기는 끝
  return res;
}
