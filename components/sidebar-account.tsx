import Link from "next/link";
import { connection } from "next/server";
import { LogOut, Monitor, UserRound } from "lucide-react";
import { signOut } from "@/app/auth-actions";
import { getAiKeyStatus } from "@/lib/ai";
import { currentUser } from "@/lib/auth";
import { getKciKey } from "@/lib/kci";
import { ONLINE } from "@/lib/online";
import { getSettings, isDirectory } from "@/lib/store";
import { cn } from "@/lib/utils";

// 사이드바 아래: 누구로 쓰는지 + 연결 상태(옵시디언·드라이브·KCI·AI) + 로그아웃
// 빠르게 그리려고 실제 접속 시험은 하지 않고 "설정이 되어 있는지"만 본다. (자세한 확인은 연결 설정 화면)

type Dot = { name: string; state: "ok" | "off" | "warn"; note: string };

async function statuses(): Promise<Dot[]> {
  const ai = await getAiKeyStatus().catch(() => ({ source: "none" as const }));
  const aiDot: Dot =
    ai.source === "env"
      ? { name: "AI", state: "ok", note: ONLINE ? "주인 계정 키" : "환경 변수 키" }
      : ai.source === "saved"
        ? { name: "AI", state: "ok", note: "내 키" }
        : ONLINE
          ? { name: "AI", state: "warn", note: "규칙 기반" }
          : { name: "AI", state: "warn", note: "키 없음" };
  if (ONLINE)
    return [
      { name: "Obsidian", state: "off", note: "내 컴퓨터 전용" },
      { name: "Drive", state: "off", note: "내 컴퓨터 전용" },
      { name: "KCI", state: "off", note: "새 탭 검색" },
      aiDot,
    ];
  const s = await getSettings().catch(() => ({ obsidianVaultPath: "", driveRootPath: "" }));
  const [vault, drive, kci] = await Promise.all([
    s.obsidianVaultPath ? isDirectory(s.obsidianVaultPath) : false,
    s.driveRootPath ? isDirectory(s.driveRootPath) : false,
    getKciKey().catch(() => ""),
  ]);
  return [
    { name: "Obsidian", state: vault ? "ok" : "warn", note: vault ? "연결됨" : "경로 확인" },
    { name: "Drive", state: drive ? "ok" : "warn", note: drive ? "연결됨" : "경로 확인" },
    { name: "KCI", state: kci ? "ok" : "warn", note: kci ? "API 키" : "키 없음" },
    aiDot,
  ];
}

const DOT = { ok: "bg-success", warn: "bg-gold", off: "bg-muted-foreground/40" } as const;

export async function SidebarAccount() {
  await connection();
  const [user, dots] = await Promise.all([currentUser(), statuses()]);
  return (
    <div className="flex flex-col gap-2 px-1 py-1 text-xs group-data-[collapsible=icon]:hidden">
      <div className="flex items-center gap-2">
        {ONLINE ? <UserRound className="size-4 shrink-0 text-primary" /> : <Monitor className="size-4 shrink-0 text-primary" />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={user?.email}>
            {ONLINE ? user?.email || "로그인 안 됨" : "내 컴퓨터"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {ONLINE ? (user?.isOwner ? "앱 주인 계정" : "내 자료는 나만 봐요") : "로그인 없이 쓰는 중"}
          </p>
        </div>
      </div>
      <Link href="/connections" className="grid grid-cols-2 gap-x-2 gap-y-1 rounded-md p-1 hover:bg-sidebar-accent" title="연결 설정에서 자세히 보기">
        {dots.map((d) => (
          <span key={d.name} className="flex min-w-0 items-center gap-1.5">
            <span className={cn("size-2 shrink-0 rounded-full", DOT[d.state])} aria-hidden="true" />
            <span className="truncate">
              {d.name} <span className="text-muted-foreground">· {d.note}</span>
            </span>
          </span>
        ))}
      </Link>
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
