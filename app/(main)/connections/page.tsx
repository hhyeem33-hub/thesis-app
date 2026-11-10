import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { CircleCheck, CircleMinus, CircleX } from "lucide-react";
import { RefreshButton } from "@/components/refresh-button";
import { PageHeader } from "@/components/page-header";
import { SettingsSkeleton } from "@/components/page-skeletons";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { checkAll, type CheckResult } from "@/lib/connections";
import { cn } from "@/lib/utils";

export default function ConnectionsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="연결 설정"
        description="옵시디언·구글 드라이브·슈파베이스·Claude API·KCI가 잘 연결됐는지 한눈에 봐요. 실패하면 이유와 고치는 곳을 알려 줘요."
        action={<RefreshButton />}
      />
      <Suspense fallback={<SettingsSkeleton />}>
        <ConnectionsContent />
      </Suspense>
    </div>
  );
}

const STATE: Record<CheckResult["state"], { label: string; icon: React.ReactNode; dot: string; text: string }> = {
  ok: { label: "정상", icon: <CircleCheck className="size-5" />, dot: "bg-success", text: "text-success" },
  fail: { label: "확인 필요", icon: <CircleX className="size-5" />, dot: "bg-destructive", text: "text-destructive" },
  off: { label: "해당 없음", icon: <CircleMinus className="size-5" />, dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
};

async function ConnectionsContent() {
  await connection();
  const results = await checkAll();
  const ok = results.filter((r) => r.state === "ok").length;
  const fail = results.filter((r) => r.state === "fail").length;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <span className="font-semibold text-success">정상 {ok}</span> ·{" "}
        <span className={cn("font-semibold", fail ? "text-destructive" : "text-muted-foreground")}>확인 필요 {fail}</span> ·{" "}
        <span className="text-muted-foreground">해당 없음 {results.length - ok - fail}</span>
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {results.map((r) => {
          const s = STATE[r.state];
          return (
            <Card key={r.id} className={cn(r.state === "fail" && "ring-destructive/40")}>
              <CardContent className="flex items-start gap-3">
                <span className={cn("mt-1 size-3 shrink-0 rounded-full", s.dot)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.name}</p>
                  <p className={cn("inline-flex items-center gap-1 text-sm font-medium", s.text)}>
                    {s.icon}
                    {s.label} · {r.summary}
                  </p>
                  {r.detail && <p className="mt-1 text-xs break-all text-muted-foreground">{r.detail}</p>}
                </div>
                {r.state === "fail" && r.fixHref && (
                  <Link href={r.fixHref} className={buttonVariants({ size: "sm", variant: "outline" })}>
                    고치러 가기
                  </Link>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
