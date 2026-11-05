import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { DataError } from "@/components/data-error";
import { PageHeader } from "@/components/page-header";
import { ProjectsSkeleton } from "@/components/page-skeletons";
import { ProjectSwitcher } from "@/components/project-switcher";
import { buttonVariants } from "@/components/ui/button";
import { WriteEditor } from "@/components/write-editor";
import { ONLINE } from "@/lib/db";
import { emptyDoc, getDoc, listDrafts, listVersions } from "@/lib/documents";
import { listTemplates } from "@/lib/hwpx";
import { getSources } from "@/lib/sources";
import { getProjects } from "@/lib/store";

export default function WritePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="글쓰기"
        description="프로젝트별 논문 원고를 쓰고 고쳐요. 각주·참고문헌이 자동으로 정리되고, 저장할 때마다 히스토리에 남아요."
      />
      <Suspense fallback={<ProjectsSkeleton />}>
        <WriteContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function WriteContent({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  await connection();
  const { project: wanted } = await searchParams;
  let data;
  try {
    const projects = await getProjects();
    const project = projects.find((p) => p.id === wanted) ?? projects[0];
    if (!project) {
      data = { empty: true } as const;
    } else {
      const [doc, sources, versions, drafts, templates] = await Promise.all([
        getDoc(project.id),
        getSources(),
        listVersions(project.id),
        listDrafts(),
        ONLINE ? Promise.resolve([]) : listTemplates(),
      ]);
      data = { projects, project, doc, sources, versions, drafts, templates };
    }
  } catch (e) {
    return <DataError error={e} />;
  }
  if ("empty" in data)
    return (
      <p className="text-sm text-muted-foreground">
        먼저{" "}
        <Link
          href="/projects"
          className={buttonVariants({ size: "sm", variant: "outline" })}
        >
          프로젝트
        </Link>{" "}
        를 만들어 주세요.
      </p>
    );
  const { projects, project, doc, sources, versions, drafts, templates } = data;
  return (
    <div className="flex flex-col gap-4">
      <ProjectSwitcher
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        current={project.id}
      />
      <WriteEditor
        key={project.id}
        initialDoc={doc ?? emptyDoc(project.id, "")}
        sources={sources.map(({ id, title, origin, type, bib }) => ({
          id,
          title,
          origin,
          type,
          bib,
        }))}
        initialVersions={versions}
        drafts={drafts.filter(
          (d) => !d.projectId || d.projectId === project.id,
        )}
        templates={templates}
        online={ONLINE}
      />
    </div>
  );
}
