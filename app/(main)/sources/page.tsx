import { Suspense } from "react";
import Link from "next/link";
import { Columns3, FilePlus2, List } from "lucide-react";
import { connection } from "next/server";
import { DataError } from "@/components/data-error";
import { PageHeader } from "@/components/page-header";
import { ProjectsSkeleton } from "@/components/page-skeletons";
import { SourcesKanban } from "@/components/sources-kanban";
import { SourcesList, type SourceListItem } from "@/components/sources-list";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { getAiKeyStatus } from "@/lib/ai";
import { getSources } from "@/lib/sources";
import { getProjects } from "@/lib/store";
import { ONLINE } from "@/lib/online";

export default function SourcesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="자료 관리"
        description="모은 자료예요. 최근 수정한 순서로 보여요. 제목을 누르면 자세히 볼 수 있어요."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Suspense fallback={null}>
              <ViewToggle searchParams={searchParams} />
            </Suspense>
            <Link href="/sources/new" className={buttonVariants()}>
              <FilePlus2 />
              자료 수집
            </Link>
          </div>
        }
      />
      <Suspense fallback={<ProjectsSkeleton />}>
        <SourcesContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SourcesContent({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await connection();
  const { view } = await searchParams;
  let data;
  try {
    data = await Promise.all([getSources(), getProjects(), getAiKeyStatus()]);
  } catch (e) {
    return <DataError error={e} />;
  }
  const [sources, projects, keyStatus] = data;
  const names = new Map(projects.map((p) => [p.id, p.name]));
  // 본문 전체 대신 검색용 앞부분만 화면으로 보낸다
  const items: SourceListItem[] = sources.map(({ content, ...s }) => ({
    ...s,
    projectName: s.projectId ? (names.get(s.projectId) ?? null) : null,
    excerpt: content.slice(0, 600),
  }));
  if (view === "kanban")
    return (
      <SourcesKanban
        sources={sources.map((s) => ({
          id: s.id,
          title: s.title,
          relevance: s.classification?.relevance ?? 0,
          topic: s.classification?.decision?.finalTopic || s.classification?.topic || "",
          status: s.classification?.decision?.status ?? null,
          projectName: s.projectId ? (names.get(s.projectId) ?? null) : null,
        }))}
      />
    );
  return <SourcesList sources={items} hasKey={keyStatus.source !== "none" || ONLINE} />;
}

/** 표 보기 / 칸반 보기 */
async function ViewToggle({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const kanban = (await searchParams).view === "kanban";
  const tab = (on: boolean) => cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm", on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground");
  return (
    <div className="inline-flex rounded-full border bg-card p-0.5" role="tablist" aria-label="보기 방식">
      <Link href="/sources" className={tab(!kanban)} role="tab" aria-selected={!kanban}>
        <List className="size-4" /> 표
      </Link>
      <Link href="/sources?view=kanban" className={tab(kanban)} role="tab" aria-selected={kanban}>
        <Columns3 className="size-4" /> 칸반 보기
      </Link>
    </div>
  );
}
