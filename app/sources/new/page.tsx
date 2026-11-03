import { Suspense } from "react";
import { connection } from "next/server";
import { DataError } from "@/components/data-error";
import { PageHeader } from "@/components/page-header";
import { SettingsSkeleton } from "@/components/page-skeletons";
import { SourceForm } from "@/components/source-form";
import { getProjects } from "@/lib/store";

export default function NewSourcePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="자료 수집"
        description="논문에 쓸 자료를 붙여 넣어 모아 두세요. 저장한 뒤 AI가 분류하고 요약해 줘요."
      />
      <Suspense fallback={<SettingsSkeleton />}>
        <NewSourceContent />
      </Suspense>
    </div>
  );
}

async function NewSourceContent() {
  await connection();
  let projects;
  try {
    projects = await getProjects();
  } catch (e) {
    return <DataError error={e} />;
  }
  return <SourceForm projects={projects.map((p) => ({ id: p.id, name: p.name }))} />;
}
