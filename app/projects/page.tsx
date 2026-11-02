import { Suspense } from "react";
import { Laptop } from "lucide-react";
import { connection } from "next/server";
import { AiDraftDialog } from "@/components/ai-draft-dialog";
import { AiWritingGuide } from "@/components/ai-writing-guide";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { PageHeader } from "@/components/page-header";
import { ProjectsSkeleton } from "@/components/page-skeletons";
import { ProjectsTable } from "@/components/projects-table";
import { getAiKeyStatus } from "@/lib/ai";
import { ONLINE } from "@/lib/db";
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
  const keyStatus = await getAiKeyStatus();
  const rows = await Promise.all(
    projects.map(async (p) => ({ ...p, aiDocCount: await countAiDocs(p) }))
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="프로젝트"
        description="지금까지 만든 프로젝트예요. 최신순으로 보여요."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <AiDraftDialog
              projects={projects.map((p) => ({ id: p.id, name: p.name }))}
              hasKey={keyStatus.source !== "none"}
              onVercel={ONLINE}
            />
            <NewProjectDialog existingNames={projects.map((p) => p.name)} online={ONLINE} />
          </div>
        }
      />
      {ONLINE && (
        <p className="inline-flex items-start gap-2 rounded-lg bg-gold/15 px-4 py-3 text-sm">
          <Laptop className="mt-0.5 size-4 shrink-0" />
          <span>
            온라인 미리보기예요. 프로젝트 기록은 온라인에 저장되지만, 옵시디언·드라이브 폴더는
            내 컴퓨터에서만 만들어져요.
          </span>
        </p>
      )}
      <ProjectsTable projects={rows} />
      <AiWritingGuide projectName={projects[0]?.name ?? "프로젝트 이름"} />
    </div>
  );
}
