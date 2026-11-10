import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { BulkClassify } from "@/components/bulk-classify";
import { ClassifyButton } from "@/components/classify-button";
import { DataError } from "@/components/data-error";
import { GradeBadge } from "@/components/grade-badge";
import { PageHeader } from "@/components/page-header";
import { ProjectsSkeleton } from "@/components/page-skeletons";
import { ProjectSwitcher } from "@/components/project-switcher";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AI_MODEL, getAiKeyStatus } from "@/lib/ai";
import { getProjectResearch } from "@/lib/research";
import { ONLINE } from "@/lib/online";
import { getSources } from "@/lib/sources";
import { getProjects } from "@/lib/store";
import { PARA_LABEL, SOURCE_TYPE_LABEL } from "@/lib/types";

export default function ClassifyPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI 분류"
        description="고른 프로젝트의 연구 설정을 기준으로, Claude가 자료마다 관련도 1~5등급·제안 토픽(목차 항목)·근거·신뢰도를 매겨요."
      />
      <Suspense fallback={<ProjectsSkeleton />}>
        <ClassifyContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

async function ClassifyContent({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  await connection();
  const { project: wanted } = await searchParams;
  let data;
  try {
    const [sources, key, projects] = await Promise.all([getSources(), getAiKeyStatus(), getProjects()]);
    const project = projects.find((p) => p.id === wanted) ?? projects[0] ?? null;
    data = { sources, key, projects, project, research: project ? await getProjectResearch(project.id) : null };
  } catch (e) {
    return <DataError error={e} />;
  }
  const { sources, key, projects, project, research } = data;
  // 온라인은 키가 없어도 규칙 기반으로 판단할 수 있다
  const hasKey = key.source !== "none" || ONLINE;
  const empty = !research || !(research.purpose || research.keywords.length || research.questions.length || research.outline.length);
  const pending = sources.filter((s) => !s.classification?.relevance);
  const done = sources.filter((s) => (s.classification?.relevance ?? 0) > 0);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <div className="flex flex-col gap-6">
      {project && (
        <ProjectSwitcher projects={projects.map((p) => ({ id: p.id, name: p.name }))} current={project.id} basePath="/classify" />
      )}

      <Card>
        <CardHeader>
          <CardTitle>분류 기준 · {project?.name ?? "프로젝트 없음"}</CardTitle>
          <CardDescription>
            이 프로젝트의{" "}
            <Link href={`/research${project ? `?project=${project.id}` : ""}`} className="underline">
              연구 설정
            </Link>
            을 기준으로 판단해요. 제안 토픽은 아래 목차 항목 중에서 골라요. · 모델: Claude Haiku 5.5 ({AI_MODEL}), 제목과 앞부분
            2,000자만 보내 비용을 아껴요.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {empty ? (
            <p className="rounded-md bg-gold/15 px-3 py-2">
              이 프로젝트의 연구 설정이 아직 비어 있어요.{" "}
              <Link href={`/research${project ? `?project=${project.id}` : ""}`} className="font-medium underline">
                연구 설정에서 먼저 적어 주세요
              </Link>{" "}
              — 비어 있으면 공통 설정이나 가장 최근에 저장한 프로젝트 설정을 대신 써요.
            </p>
          ) : (
            <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2">
              <Row label="연구 목적">{research!.purpose || "—"}</Row>
              <Row label="핵심 키워드">
                <span className="flex flex-wrap gap-1">
                  {research!.keywords.map((k) => (
                    <span key={k} className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                      #{k}
                    </span>
                  ))}
                  {!research!.keywords.length && "—"}
                </span>
              </Row>
              <Row label="나의 관점">{research!.perspective || "—"}</Row>
              <Row label="연구 질문">
                {research!.questions.length ? (
                  <ol className="list-decimal pl-4">
                    {research!.questions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ol>
                ) : (
                  "—"
                )}
              </Row>
              <Row label="목차 (토픽 후보)">
                <span className="flex flex-wrap gap-1.5">
                  {research!.outline.map((o, i) => (
                    <span key={o} className="rounded-md border px-2 py-0.5 text-xs">
                      {i + 1}. {o}
                    </span>
                  ))}
                  {!research!.outline.length && "— (목차가 없으면 짧은 주제명을 붙여요)"}
                </span>
              </Row>
            </dl>
          )}
        </CardContent>
      </Card>

      <BulkClassify
        hasKey={hasKey}
        pendingCount={pending.length}
        total={sources.length}
        basisProjectId={project?.id ?? null}
        basisName={project?.name}
        kciPendingCount={pending.filter((s) => s.bib?.category === "KCI 선행연구").length}
      />

      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>아직 판단 안 한 자료 {pending.length}개</CardTitle>
            <CardDescription>하나씩 하려면 ‘AI 분류’, 한꺼번에 하려면 위 버튼을 눌러요.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="reveal-list flex max-h-72 flex-col divide-y overflow-y-auto text-sm">
              {pending.slice(0, 50).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/sources/${s.id}`} className="truncate hover:underline">
                    {s.title}
                  </Link>
                  <ClassifyButton sourceId={s.id} size="xs" basisProjectId={project?.id ?? null} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>판단한 자료 {done.length}개</CardTitle>
          <CardDescription>
            관련도가 높은 순서예요. 연구 설정을 바꿨다면 ‘다시 분류’로 새 기준에 맞춰 다시 판단해요. (연구자 확정 분류는 그대로 둬요)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 없어요.</p>
          ) : (
            <ul className="reveal-list flex flex-col divide-y text-sm">
              {[...done]
                .sort((a, b) => b.classification!.relevance - a.classification!.relevance)
                .map((s) => {
                  const c = s.classification!;
                  const basis = c.basisProjectId ? projectName.get(c.basisProjectId) : null;
                  const stale = !!project && c.basisProjectId !== project.id;
                  return (
                    <li key={s.id} className="flex flex-col gap-1 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <GradeBadge grade={c.relevance} />
                        {c.topic && <span className="rounded-md border px-1.5 py-0.5 text-xs">{c.topic}</span>}
                        <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs">{PARA_LABEL[c.para]}</span>
                        <Link href={`/sources/${s.id}`} className="font-medium hover:underline">
                          {s.title}
                        </Link>
                        <span className="text-xs text-muted-foreground">{SOURCE_TYPE_LABEL[s.type]}</span>
                        <span className="ml-auto">
                          <ClassifyButton sourceId={s.id} size="xs" again basisProjectId={project?.id ?? null} />
                        </span>
                      </div>
                      {c.reason && <p className="text-muted-foreground">근거: {c.reason}</p>}
                      <p className={stale ? "text-xs text-primary" : "text-xs text-muted-foreground"}>
                        기준: {basis ? `‘${basis}’ 연구 설정` : "예전(공통) 설정"}
                        {c.confidence && ` · 신뢰도 ${c.confidence}`}
                        {stale && " — 지금 고른 프로젝트와 기준이 달라요. ‘다시 분류’를 눌러 맞춰 주세요."}
                      </p>
                    </li>
                  );
                })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
