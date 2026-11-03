import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { BarChart } from "@/components/bar-chart";
import { DataError } from "@/components/data-error";
import { GradeBadge } from "@/components/grade-badge";
import { PageHeader } from "@/components/page-header";
import { ProjectsSkeleton } from "@/components/page-skeletons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { countAiOutputs, getResearch, getSources } from "@/lib/sources";
import { PARA, PARA_LABEL, SOURCE_TYPES, SOURCE_TYPE_LABEL } from "@/lib/types";

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeZone: "Asia/Seoul",
});

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="대시보드" description="모은 자료와 AI 분류 결과를 한눈에 봐요." />
      <Suspense fallback={<ProjectsSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  note,
  href,
}: {
  label: string;
  value: string;
  unit?: string;
  note: string;
  href?: string;
}) {
  const body = (
    <Card className="h-full transition-colors hover:bg-accent/40">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-heading text-3xl tabular-nums">
          {value}
          {unit && <span className="ml-1 text-base font-normal text-muted-foreground">{unit}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{note}</CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

async function DashboardContent() {
  await connection();
  let data;
  try {
    data = await Promise.all([getSources(), getResearch(), countAiOutputs()]);
  } catch (e) {
    return <DataError error={e} />;
  }
  const [sources, research, aiCount] = data;

  const classified = sources.filter((s) => s.classification);
  const avg = classified.length
    ? classified.reduce((sum, s) => sum + s.classification!.relevance, 0) / classified.length
    : null;
  const core = classified.filter((s) => s.classification!.relevance >= 4).length;
  const unverified = sources.filter((s) => !s.origin.trim()).length;

  const paraData = PARA.map((p) => ({
    label: PARA_LABEL[p],
    value: classified.filter((s) => s.classification!.para === p).length,
  }));
  const typeData = [
    ...SOURCE_TYPES.map((t) => ({
      label: SOURCE_TYPE_LABEL[t],
      value: sources.filter((s) => s.type === t).length,
    })),
    { label: SOURCE_TYPE_LABEL.ai, value: aiCount },
  ];
  const gradeData = [5, 4, 3, 2, 1].map((g) => ({
    label: `${g}등급`,
    value: classified.filter((s) => s.classification!.relevance === g).length,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="전체 자료 수"
          value={String(sources.length + aiCount)}
          unit="개"
          note={`원문 ${sources.length}개 · AI 생성물 ${aiCount}개`}
          href="/sources"
        />
        <StatCard
          label="평균 논문 관련도"
          value={avg === null ? "—" : avg.toFixed(1)}
          unit="/ 5"
          note={classified.length ? `분류한 자료 ${classified.length}개 기준` : "아직 AI 분류한 자료가 없어요"}
          href="/classify"
        />
        <StatCard
          label="핵심 자료"
          value={String(core)}
          unit="개"
          note="관련도 4~5등급"
          href="/classify"
        />
        <StatCard
          label="미확인 출처"
          value={String(unverified)}
          unit="개"
          note="서지 정보 보완 필요"
          href="/sources"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>분류별 자료 수</CardTitle>
            <CardDescription>PARA · AI 분류한 자료 {classified.length}개</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart data={paraData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>소스 유형 비율</CardTitle>
            <CardDescription>원문 + AI 생성물 {sources.length + aiCount}개</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart data={typeData} showPercent />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>논문 관련도 등급 분포</CardTitle>
            <CardDescription>5등급이 내 연구와 가장 가까워요</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart data={gradeData} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card>
          <CardHeader>
            <CardTitle>내 연구</CardTitle>
            <CardDescription>
              <Link href="/research" className="underline">
                연구 설정
              </Link>
              에서 바꿀 수 있어요.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="leading-relaxed">
              {research.topic || <span className="text-muted-foreground">아직 연구 주제를 적지 않았어요.</span>}
            </p>
            {research.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {research.keywords.map((k) => (
                  <span key={k} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                    #{k}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>최근 수정한 자료</CardTitle>
          </CardHeader>
          <CardContent>
            {sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                아직 자료가 없어요.{" "}
                <Link href="/sources/new" className="underline">
                  자료 수집
                </Link>
                에서 시작해 보세요.
              </p>
            ) : (
              <ul className="flex flex-col divide-y text-sm">
                {sources.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <GradeBadge grade={s.classification?.relevance} />
                      <Link href={`/sources/${s.id}`} className="truncate hover:underline">
                        {s.title}
                      </Link>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {SOURCE_TYPE_LABEL[s.type]} · {dateFormat.format(new Date(s.updatedAt))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
