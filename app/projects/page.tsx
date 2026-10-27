import { Suspense } from "react";
import { connection } from "next/server";
import { AiWritingGuide } from "@/components/ai-writing-guide";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { PageHeader } from "@/components/page-header";
import { ProjectsSkeleton } from "@/components/page-skeletons";
import { ProjectsTable } from "@/components/projects-table";
import { countAiDocs } from "@/lib/folders";
import { getProjects } from "@/lib/store";

export default function ProjectsPage() {
  return (
    <Suspense fallback={<ProjectsSkeleton />}>
      <ProjectsContent />
    </Suspense>
  );
}

async function ProjectsContent() {
  await connection();
  const projects = await getProjects();
  const rows = await Promise.all(
    projects.map(async (p) => ({ ...p, aiDocCount: await countAiDocs(p) }))
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="프로젝트"
        description="지금까지 만든 프로젝트예요. 최신순으로 보여요."
        action={<NewProjectDialog existingNames={projects.map((p) => p.name)} />}
      />
      <ProjectsTable projects={rows} />
      <AiWritingGuide projectName={projects[0]?.name ?? "프로젝트 이름"} />
    </div>
  );
}
