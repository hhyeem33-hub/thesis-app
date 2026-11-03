import { Suspense } from "react";
import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { connection } from "next/server";
import { DataError } from "@/components/data-error";
import { PageHeader } from "@/components/page-header";
import { ProjectsSkeleton } from "@/components/page-skeletons";
import { SourcesList, type SourceListItem } from "@/components/sources-list";
import { buttonVariants } from "@/components/ui/button";
import { getSources } from "@/lib/sources";
import { getProjects } from "@/lib/store";

export default function SourcesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="자료 관리"
        description="모은 자료예요. 최근 수정한 순서로 보여요. 제목을 누르면 자세히 볼 수 있어요."
        action={
          <Link href="/sources/new" className={buttonVariants()}>
            <FilePlus2 />
            자료 수집
          </Link>
        }
      />
      <Suspense fallback={<ProjectsSkeleton />}>
        <SourcesContent />
      </Suspense>
    </div>
  );
}

async function SourcesContent() {
  await connection();
  let data;
  try {
    data = await Promise.all([getSources(), getProjects()]);
  } catch (e) {
    return <DataError error={e} />;
  }
  const [sources, projects] = data;
  const names = new Map(projects.map((p) => [p.id, p.name]));
  // 본문 전체 대신 검색용 앞부분만 화면으로 보낸다
  const items: SourceListItem[] = sources.map(({ content, ...s }) => ({
    ...s,
    projectName: s.projectId ? (names.get(s.projectId) ?? null) : null,
    excerpt: content.slice(0, 600),
  }));
  return <SourcesList sources={items} />;
}
