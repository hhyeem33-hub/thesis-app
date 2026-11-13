import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { CircleCheck, CircleMinus } from "lucide-react";
import { DriveLive } from "@/components/google-status";
import { RefreshButton } from "@/components/refresh-button";
import { PageHeader } from "@/components/page-header";
import { SettingsSkeleton } from "@/components/page-skeletons";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { checkAll, type CheckResult } from "@/lib/connections";
import { ONLINE } from "@/lib/online";
import { cn } from "@/lib/utils";

export default function ConnectionsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="연결 설정"
        description="옵시디언 · 구글 드라이브 · KCI · AI가 실제로 연결됐는지 확인해요. 초록은 연결됨, 회색은 연결 안 됨이고 이유와 고치는 곳을 알려 줘요."
        action={<RefreshButton />}
      />
      <Suspense fallback={<SettingsSkeleton />}>
        <ConnectionsContent />
      </Suspense>
    </div>
  );
}

function StatusCard({ r, forceOk }: { r: CheckResult; forceOk?: { summary: string; detail: string } }) {
  const ok = forceOk ? true : r.state === "ok";
  const summary = forceOk?.summary ?? r.summary;
  const detail = forceOk?.detail ?? r.detail;
  return (
    <Card className={cn(ok && "ring-success/40")}>
      <CardContent className="flex items-start gap-3">
        <span className={cn("mt-1.5 size-3 shrink-0 rounded-full", ok ? "bg-success" : "bg-muted-foreground/40")} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{r.name}</p>
          <p className={cn("inline-flex items-center gap-1 text-sm font-medium", ok ? "text-success" : "text-muted-foreground")}>
            {ok ? <CircleCheck className="size-4 shrink-0" /> : <CircleMinus className="size-4 shrink-0" />}
            {summary}
          </p>
          {detail && <p className="mt-1 text-xs break-all text-muted-foreground">{detail}</p>}
        </div>
        {!ok && r.fixHref && (
          <Link href={r.fixHref} className={buttonVariants({ size: "sm", variant: "outline" })}>
            고치러 가기
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

async function ConnectionsContent() {
  await connection();
  const { main, extra } = await checkAll();
  const ok = main.filter((r) => r.state === "ok").length;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm">
        <span className="font-semibold text-success">연결됨 {ok}</span> ·{" "}
        <span className="text-muted-foreground">연결 안 됨 {main.length - ok}</span>
        <span className="text-muted-foreground"> (4개 중)</span>
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {main.map((r) =>
          r.id === "drive" && ONLINE ? (
            <DriveLive
              key={r.id}
              connected={<StatusCard r={r} forceOk={{ summary: "연결됨 · 구글 계정", detail: "이 브라우저에서 구글 드라이브에 로그인돼 있어요 (1시간 동안)." }} />}
            >
              <StatusCard r={r} />
            </DriveLive>
          ) : (
            <StatusCard key={r.id} r={r} />
          )
        )}
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">저장소</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {extra.map((r) => (
            <StatusCard key={r.id} r={r} />
          ))}
        </div>
      </section>
    </div>
  );
}
