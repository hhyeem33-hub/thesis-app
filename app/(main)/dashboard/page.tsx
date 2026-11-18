import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { BookAlert, CircleCheck, CircleHelp, CirclePause, CircleX, Gauge, Library, Star, type LucideIcon } from "lucide-react";
import { BarChart } from "@/components/bar-chart";
import { CountUp } from "@/components/count-up";
import { DonutChart, GradeColumns, RatioBar } from "@/components/fancy-charts";
import { DataError } from "@/components/data-error";
import { GradeBadge } from "@/components/grade-badge";
import { PageHeader } from "@/components/page-header";
import { ProjectsSkeleton } from "@/components/page-skeletons";
import { ResearchFirstBanner } from "@/components/research-first-banner";
import { getProjects } from "@/lib/store";
import { ProgressKanban, type ProgressCard } from "@/components/progress-kanban";
import { getDoc } from "@/lib/documents";
import { getStages } from "@/lib/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { countChars, formatReference, NEED } from "@/lib/bib";
import { countAiOutputs, getResearch, getSources } from "@/lib/sources";
import { PARA, PARA_LABEL, SOURCE_TYPES, SOURCE_TYPE_LABEL } from "@/lib/types";

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeZone: "Asia/Seoul",
});

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={null}>
        <ResearchFirstBanner />
      </Suspense>
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
  decimals = 0,
  unit,
  note,
  href,
  icon: Icon,
  tone = "brown",
}: {
  label: string;
  /** 숫자면 0부터 올라가는 애니메이션, 글자(—)면 그대로 */
  value: number | string;
  decimals?: number;
  unit?: string;
  note: string;
  href?: string;
  icon: LucideIcon;
  tone?: "brown" | "gold" | "success" | "muted";
}) {
  const toneClass = {
    brown: "bg-primary/12 text-primary",
    gold: "bg-gold/20 text-gold",
    success: "bg-success/12 text-success",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  const body = (
    <Card className="h-full transition-colors hover:bg-accent/40">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardDescription>{label}</CardDescription>
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
            <Icon className="size-[18px]" />
          </span>
        </div>
        <CardTitle className="font-heading text-3xl tabular-nums">
          {typeof value === "number" ? <CountUp value={value} decimals={decimals} /> : value}
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
    data = await Promise.all([getSources(), getResearch(), countAiOutputs(), getProjects()]);
  } catch (e) {
    return <DataError error={e} />;
  }
  const [sources, research, aiCount, projects] = data;

  // 논문 진행 칸반: 저장한 단계가 없으면 원고가 있으면 ‘초안’, 없으면 ‘자료 모으기’
  const [stages, docs] = await Promise.all([getStages(), Promise.all(projects.map((p) => getDoc(p.id).catch(() => null)))]);
  const progress: ProgressCard[] = projects.map((p, i) => {
    const body = docs[i]?.body ?? "";
    return {
      id: p.id,
      name: p.name,
      stage: stages[p.id] ?? (body.trim() ? "draft" : "collect"),
      sources: sources.filter((s) => s.projectId === p.id).length,
      chars: countChars(body),
    };
  });

  // 구글 드라이브에서 가져온 자료: 메인 폴더(= 연결된 프로젝트) / 하위 폴더(= 분류) 별 수
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const fromDrive = sources.filter((s) => s.origin.startsWith("https://drive.google.com/") || s.origin.startsWith("구글 드라이브:"));
  const driveCount = new Map<string, number>();
  for (const s of fromDrive) {
    const key = `${(s.projectId && projectName.get(s.projectId)) || "프로젝트 없음"} / ${s.bib?.category || "(메인 폴더 바로 아래)"}`;
    driveCount.set(key, (driveCount.get(key) ?? 0) + 1);
  }
  const driveData = [...driveCount]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .slice(0, 10)
    .map(([label, value]) => ({ label, value }));

  // 관련도 0 = 연구자가 먼저 결정했지만 AI 판단은 아직 없는 자료
  const classified = sources.filter((s) => (s.classification?.relevance ?? 0) > 0);
  const status = (st: string) => sources.filter((s) => s.classification?.decision?.status === st).length;
  const adopted = status("adopted");
  const held = status("held");
  const excluded = status("excluded");
  const needBib = sources.filter((s) => formatReference(s).includes(NEED)).length;
  const topicCount = new Map<string, number>();
  for (const s of sources) {
    if (s.classification?.decision?.status === "excluded") continue;
    const t = s.classification?.decision?.finalTopic || s.classification?.topic;
    if (t) topicCount.set(t, (topicCount.get(t) ?? 0) + 1);
  }
  const topicData = [...topicCount]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value }));
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
    grade: g,
    value: classified.filter((s) => s.classification!.relevance === g).length,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="전체 자료 수"
          icon={Library}
          value={sources.length + aiCount}
          unit="개"
          note={`원문 ${sources.length}개 · AI 생성물 ${aiCount}개`}
          href="/sources"
        />
        <StatCard
          label="평균 논문 관련도"
          icon={Gauge}
          tone="gold"
          value={avg === null ? "—" : Number(avg.toFixed(1))}
          decimals={1}
          unit="/ 5"
          note={classified.length ? `분류한 자료 ${classified.length}개 기준` : "아직 AI 분류한 자료가 없어요"}
          href="/classify"
        />
        <StatCard
          label="핵심 자료"
          icon={Star}
          tone="gold"
          value={core}
          unit="개"
          note="관련도 4~5등급"
          href="/classify"
        />
        <StatCard
          label="미확인 출처"
          icon={CircleHelp}
          tone="muted"
          value={unverified}
          unit="개"
          note="출처(주소·서지)를 아예 적지 않은 자료"
          href="/sources"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>논문 진행 칸반</CardTitle>
          <CardDescription>프로젝트 카드를 끌어 단계를 옮겨요 · 자료 모으기 → 초안 → 수정 → 출력</CardDescription>
        </CardHeader>
        <CardContent>
          {progress.length ? <ProgressKanban projects={progress} /> : <p className="text-sm text-muted-foreground">프로젝트를 만들면 여기에 카드가 생겨요.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="채택" icon={CircleCheck} tone="success" value={adopted} unit="개" note="연구자가 확정한 자료" href="/sources" />
        <StatCard label="보류" icon={CirclePause} tone="gold" value={held} unit="개" note="나중에 다시 볼 자료" href="/sources" />
        <StatCard label="제외" icon={CircleX} tone="muted" value={excluded} unit="개" note="논문에 쓰지 않을 자료" href="/sources" />
        <StatCard
          label="서지 보완 필요"
          icon={BookAlert}
          tone="brown"
          value={needBib}
          unit="개"
          note="참고문헌에 [보완 필요]가 남는 자료"
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
            <CardTitle>토픽별 자료 수</CardTitle>
            <CardDescription>최종 토픽(없으면 AI 제안 토픽) · 제외한 자료 빼고 상위 8개</CardDescription>
          </CardHeader>
          <CardContent>
            {topicData.length ? (
              <DonutChart data={topicData} centerLabel="자료" />
            ) : (
              <p className="text-sm text-muted-foreground">AI 판단을 하면 토픽이 생겨요.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>드라이브 폴더별 자료 수</CardTitle>
            <CardDescription>메인 폴더(프로젝트) / 하위 폴더(분류) · 구글 드라이브 자료 {fromDrive.length}개</CardDescription>
          </CardHeader>
          <CardContent>
            {driveData.length ? (
              <BarChart data={driveData} />
            ) : (
              <p className="text-sm text-muted-foreground">
                자료 수집 → Google Drive의 ‘폴더 통째로 가져오기’로 가져오면 폴더별로 보여요.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>소스 유형 비율</CardTitle>
            <CardDescription>원문 + AI 생성물 {sources.length + aiCount}개</CardDescription>
          </CardHeader>
          <CardContent>
            <RatioBar data={typeData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>논문 관련도 등급 분포</CardTitle>
            <CardDescription>5등급이 내 연구와 가장 가까워요</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="pb-6">
              <GradeColumns data={gradeData} />
            </div>
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
