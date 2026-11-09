import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ClassifyAllButton, ClassifyButton } from "@/components/classify-button";
import { DataError } from "@/components/data-error";
import { GradeBadge } from "@/components/grade-badge";
import { PageHeader } from "@/components/page-header";
import { ProjectsSkeleton } from "@/components/page-skeletons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AI_MODEL, getAiKeyStatus } from "@/lib/ai";
import { getResearch, getSources } from "@/lib/sources";
import { PARA_LABEL, SOURCE_TYPE_LABEL } from "@/lib/types";

const PARA_HELP = [
  ["Projects", "지금 쓰는 논문에 바로 쓸 자료"],
  ["Areas", "연구 분야 전반의 배경 지식·이론"],
  ["Resources", "나중에 참고할 일반 자료·방법론"],
  ["Archives", "지금 논문과는 관계가 적어 보관만 할 자료"],
];

export default function ClassifyPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI 분류"
        description="Claude가 자료를 PARA로 나누고, 내 연구 주제와의 관련도를 1~5등급으로 매기고, 짧게 요약해요."
      />
      <Suspense fallback={<ProjectsSkeleton />}>
        <ClassifyContent />
      </Suspense>
    </div>
  );
}

async function ClassifyContent() {
  await connection();
  let data;
  try {
    data = await Promise.all([getSources(), getResearch(), getAiKeyStatus()]);
  } catch (e) {
    return <DataError error={e} />;
  }
  const [sources, research, key] = data;
  const pending = sources.filter((s) => !s.classification?.relevance);
  const done = sources.filter((s) => (s.classification?.relevance ?? 0) > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>분류 기준</CardTitle>
            <CardDescription>
              모델: Claude Haiku 5.5 ({AI_MODEL}) · 자료 1개에 몇 초, 비용은 아주 적어요.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5">
              {PARA_HELP.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-medium">{k}</dt>
                  <dd className="text-muted-foreground">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-muted-foreground">
              관련도 기준 주제:{" "}
              {research.topic ? (
                <span className="text-foreground">{research.topic}</span>
              ) : (
                <>
                  아직 없어요.{" "}
                  <Link href="/research" className="underline">
                    연구 설정
                  </Link>
                  에서 먼저 적으면 더 정확해요.
                </>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>미분류 자료 {pending.length}개</CardTitle>
            <CardDescription>
              {key.source === "none" ? (
                <>
                  AI를 쓰려면 먼저{" "}
                  <Link href="/settings" className="underline">
                    설정 → AI 연결
                  </Link>
                  에서 API 키를 넣어 주세요.
                </>
              ) : (
                "버튼을 누르면 한 번에 최대 10개까지 차례로 분류해요."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div>
              <ClassifyAllButton count={key.source === "none" ? 0 : pending.length} />
            </div>
            <ul className="flex flex-col divide-y text-sm">
              {pending.slice(0, 8).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/sources/${s.id}`} className="truncate hover:underline">
                    {s.title}
                  </Link>
                  <ClassifyButton sourceId={s.id} size="xs" />
                </li>
              ))}
              {pending.length === 0 && (
                <li className="py-2 text-muted-foreground">
                  {sources.length ? "모든 자료를 분류했어요." : (
                    <>
                      아직 자료가 없어요.{" "}
                      <Link href="/sources/new" className="underline">
                        자료 수집
                      </Link>
                      에서 먼저 모아 주세요.
                    </>
                  )}
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      {done.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>분류한 자료</CardTitle>
            <CardDescription>관련도가 높은 순서예요.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y text-sm">
              {[...done]
                .sort((a, b) => b.classification!.relevance - a.classification!.relevance)
                .map((s) => (
                  <li key={s.id} className="flex flex-col gap-1 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <GradeBadge grade={s.classification!.relevance} />
                      <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs">
                        {PARA_LABEL[s.classification!.para]}
                      </span>
                      <Link href={`/sources/${s.id}`} className="font-medium hover:underline">
                        {s.title}
                      </Link>
                      <span className="text-xs text-muted-foreground">{SOURCE_TYPE_LABEL[s.type]}</span>
                    </div>
                    <p className="text-muted-foreground">{s.classification!.summary}</p>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
