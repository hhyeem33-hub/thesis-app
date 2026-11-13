import Link from "next/link";
import { connection } from "next/server";
import { LogIn, LogOut, Monitor, UserRound } from "lucide-react";
import { exitGuest, signOut } from "@/app/auth-actions";
import { DriveLive } from "@/components/google-status";
import { currentUser, isGuest } from "@/lib/auth";
import { checkFour } from "@/lib/connections";
import { ONLINE } from "@/lib/online";
import { cn } from "@/lib/utils";

// 사이드바 아래: 누구로 쓰는지 + 연결 상태(옵시디언·드라이브·KCI·AI) + 로그아웃
// 연결 상태는 실제로 확인한 결과다 (lib/connections.ts, 5분 동안 기억). 자세한 이유는 연결 설정 화면에서.

const DOT = { ok: "bg-success", off: "bg-muted-foreground/40" } as const;

function DotRow({ name, state, note, sub }: { name: string; state: "ok" | "off"; note: string; sub?: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={cn("size-2 shrink-0 rounded-full", DOT[state])} aria-hidden="true" />
        <span className="truncate">
          {name} <span className={state === "ok" ? "text-success" : "text-muted-foreground"}>· {note}</span>
        </span>
      </span>
      {sub && <span className="truncate pl-3.5 text-[11px] text-muted-foreground">{sub}</span>}
    </span>
  );
}

/** "연결됨 · 이유" → 앞부분은 상태, 뒷부분은 작은 글씨 */
function split(summary: string) {
  const i = summary.lastIndexOf(" · ");
  return i < 0 ? { note: summary, sub: undefined } : { note: summary.slice(0, i), sub: summary.slice(i + 3) };
}

export async function SidebarAccount() {
  await connection();
  const [user, dots, guest] = await Promise.all([currentUser(), checkFour().catch(() => []), isGuest()]);
  return (
    <div className="flex flex-col gap-2 px-1 py-1 text-xs group-data-[collapsible=icon]:hidden">
      <div className="flex items-center gap-2">
        {ONLINE ? <UserRound className="size-4 shrink-0 text-primary" /> : <Monitor className="size-4 shrink-0 text-primary" />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={user?.email}>
            {ONLINE ? (guest ? "둘러보기 모드" : user?.email || "로그인 안 됨") : "내 컴퓨터"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {ONLINE
              ? guest
                ? "만든 사람의 자료 · 볼 수만 있어요"
                : user?.isOwner
                  ? "앱 주인 계정"
                  : "내 자료는 나만 봐요"
              : "로그인 없이 쓰는 중"}
          </p>
        </div>
      </div>
      <Link href="/connections" className="flex flex-col gap-1 rounded-md p-1 hover:bg-sidebar-accent" title="연결 설정에서 자세히 보기">
        {dots.map((d) => {
          const { note, sub } = split(d.summary);
          const row = <DotRow name={d.short} state={d.state} note={note} sub={sub} />;
          return (
            <span key={d.id} title={`${d.name}: ${d.summary}`}>
              {d.id === "drive" && ONLINE ? (
                <DriveLive connected={<DotRow name={d.short} state="ok" note="연결됨" />}>{row}</DriveLive>
              ) : (
                row
              )}
            </span>
          );
        })}
      </Link>
      {guest && (
        <form action={exitGuest}>
          <button
            type="submit"
            className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <LogIn className="size-3.5" />
            로그인하러 가기
          </button>
        </form>
      )}
      {ONLINE && user && (
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <LogOut className="size-3.5" />
            로그아웃
          </button>
        </form>
      )}
    </div>
  );
}

export function SidebarAccountSkeleton() {
  return <div className="h-20 animate-pulse rounded-md bg-sidebar-accent/60 group-data-[collapsible=icon]:hidden" />;
}
