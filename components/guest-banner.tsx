import Link from "next/link";
import { connection } from "next/server";
import { Eye, LogIn } from "lucide-react";
import { exitGuest } from "@/app/auth-actions";
import { isGuest } from "@/lib/auth";

/** 둘러보기 모드일 때 화면 맨 위 띠 */
export async function GuestBanner() {
  await connection();
  if (!(await isGuest())) return null;
  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-gold/50 bg-gold/20 px-4 py-2 text-sm backdrop-blur">
      <span className="inline-flex items-center gap-1.5 font-medium">
        <Eye className="size-4 text-gold" />
        둘러보기 모드
      </span>
      <span className="text-foreground/75">· 로그인하면 내 계정으로 쓸 수 있어요 (지금은 볼 수만 있어요)</span>
      <form action={exitGuest}>
        <button type="submit" className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          <LogIn className="size-3.5" />
          로그인하기
        </button>
      </form>
      <Link href="/guide" className="text-xs underline underline-offset-2">
        작동 방법
      </Link>
    </div>
  );
}
