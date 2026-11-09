import { Suspense } from "react";
import { connection } from "next/server";
import { savedKciIds } from "@/app/kci-actions";
import { DataError } from "@/components/data-error";
import { PageHeader } from "@/components/page-header";
import { SettingsSkeleton } from "@/components/page-skeletons";
import { SourceIntake } from "@/components/source-intake";
import { getAiKeyStatus } from "@/lib/ai";
import { ONLINE } from "@/lib/db";
import { canUseKciApi } from "@/lib/kci";
import { getProjects } from "@/lib/store";

export default function NewSourcePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="자료 수집"
        description="KCI·옵시디언·파일·엑셀 목록·직접 입력으로 자료를 모아요. 들어온 자료는 바로 AI가 연구 설정 기준으로 판단해요."
      />
      <Suspense fallback={<SettingsSkeleton />}>
        <NewSourceContent />
      </Suspense>
    </div>
  );
}

async function NewSourceContent() {
  await connection();
  let data;
  try {
    data = await Promise.all([getProjects(), getAiKeyStatus(), canUseKciApi(), savedKciIds()]);
  } catch (e) {
    return <DataError error={e} />;
  }
  const [projects, key, apiReady, saved] = data;
  return (
    <SourceIntake
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      hasKey={key.source !== "none"}
      online={ONLINE}
      kci={{ apiReady, saved }}
    />
  );
}
