import { Suspense } from "react";
import { connection } from "next/server";
import { DataError } from "@/components/data-error";
import { PageHeader } from "@/components/page-header";
import { SettingsSkeleton } from "@/components/page-skeletons";
import { ProjectResearchForm } from "@/components/project-research-form";
import { ProjectSwitcher } from "@/components/project-switcher";
import { ResearchForm } from "@/components/research-form";
import { getProjectResearch } from "@/lib/research";
import { getResearch } from "@/lib/sources";
import { getProjects } from "@/lib/store";

export default function ResearchPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="연구 설정"
        description="프로젝트마다 연구 목적·키워드·관점·질문·목차를 적어요. AI 판단과 AI 초안이 이 기준을 써요."
      />
      <Suspense fallback={<SettingsSkeleton />}>
        <ResearchContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ResearchContent({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  await connection();
  const { project: wanted } = await searchParams;
  let data;
  try {
    const projects = await getProjects();
    const project = projects.find((p) => p.id === wanted) ?? projects[0] ?? null;
    data = {
      projects,
      project,
      research: project ? await getProjectResearch(project.id) : null,
      common: await getResearch(),
    };
  } catch (e) {
    return <DataError error={e} />;
  }
  const { projects, project, research, common } = data;
  return (
    <div className="flex flex-col gap-6">
      {project && research ? (
        <>
          <ProjectSwitcher
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
            current={project.id}
            basePath="/research"
          />
          <ProjectResearchForm key={project.id} projectId={project.id} initial={research} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">프로젝트를 먼저 만들면 프로젝트별 연구 설정을 적을 수 있어요.</p>
      )}
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          공통 연구 설정 (프로젝트에 연결되지 않은 자료나, 프로젝트 설정이 비어 있을 때 쓰는 기준)
        </summary>
        <div className="mt-4">
          <ResearchForm initial={common} />
        </div>
      </details>
    </div>
  );
}
