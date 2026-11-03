import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, TriangleAlert } from "lucide-react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ClassifyButton } from "@/components/classify-button";
import { DataError } from "@/components/data-error";
import { GradeBadge } from "@/components/grade-badge";
import { SettingsSkeleton } from "@/components/page-skeletons";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSource } from "@/lib/sources";
import { getProjects } from "@/lib/store";
import { PARA_LABEL, SOURCE_TYPE_LABEL, type Source } from "@/lib/types";

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

export default function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/sources" className={buttonVariants({ variant: "ghost", size: "sm", className: "w-fit" })}>
        <ArrowLeft />
        자료 관리로
      </Link>
      <Suspense fallback={<SettingsSkeleton />}>
        <SourceDetail params={params} />
      </Suspense>
    </div>
  );
}

async function SourceDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  let source: Source | null;
  let projectName: string | null = null;
  try {
    source = await getSource(id);
    if (source?.projectId)
      projectName = (await getProjects()).find((p) => p.id === source!.projectId)?.name ?? null;
  } catch (e) {
    return <DataError error={e} />;
  }
  if (!source) notFound();

  const c = source.classification;
  const isUrl = /^https?:\/\//.test(source.origin);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{source.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>{SOURCE_TYPE_LABEL[source.type]}</span>
            <span aria-hidden>·</span>
            <span>프로젝트: {projectName ?? "연결 안 함"}</span>
            <span aria-hidden>·</span>
            <span>수정 {dateFormat.format(new Date(source.updatedAt))}</span>
          </div>
        </div>
        <ClassifyButton sourceId={source.id} again={!!c} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI 분류</CardTitle>
        </CardHeader>
        <CardContent>
          {c ? (
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[6rem_1fr]">
              <dt className="text-muted-foreground">PARA</dt>
              <dd className="font-medium">{PARA_LABEL[c.para]}</dd>
              <dt className="text-muted-foreground">논문 관련도</dt>
              <dd>
                <GradeBadge grade={c.relevance} /> <span className="text-xs text-muted-foreground">5점 만점</span>
              </dd>
              <dt className="text-muted-foreground">요약</dt>
              <dd className="leading-relaxed">{c.summary}</dd>
              <dt className="text-muted-foreground">분류한 때</dt>
              <dd className="text-muted-foreground">{dateFormat.format(new Date(c.classifiedAt))}</dd>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              아직 분류하지 않았어요. 오른쪽 위 &lsquo;AI 분류&rsquo;를 누르면 PARA 분류, 논문 관련도(1~5등급),
              요약이 붙어요. 관련도는{" "}
              <Link href="/research" className="underline">
                연구 설정
              </Link>
              의 주제를 기준으로 매겨요.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>출처</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {!source.origin ? (
            <p className="inline-flex items-center gap-1.5 text-destructive">
              <TriangleAlert className="size-4" />
              미확인 출처예요. 논문에 쓰려면 서지 정보(저자·연도·제목·출판 정보)를 보완해 주세요.
            </p>
          ) : isUrl ? (
            <a
              href={source.origin}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 break-all underline"
            >
              {source.origin}
              <ExternalLink className="size-3.5 shrink-0" />
            </a>
          ) : (
            <p className="break-words">{source.origin}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>내용</CardTitle>
        </CardHeader>
        <CardContent>
          {source.content ? (
            <div className="max-h-[32rem] overflow-y-auto rounded-lg bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-wrap">
              {source.content}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">붙여 넣은 내용이 없어요.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
