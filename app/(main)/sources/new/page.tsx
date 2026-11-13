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
import { googleConfig } from "@/lib/google";
import { getProjects, getSettings, isDirectory } from "@/lib/store";

export default function NewSourcePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="자료 수집 및 분석"
        description="KCI · 옵시디언 · 구글 드라이브 · 링크 · 엑셀 목록에서 자료를 모으고, 들어오는 대로 AI가 판단해요."
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
    data = await Promise.all([
      getProjects(),
      getAiKeyStatus(),
      canUseKciApi(),
      savedKciIds(),
      ONLINE ? false : getSettings().then((s) => (s.driveRootPath ? isDirectory(s.driveRootPath) : false)),
    ]);
  } catch (e) {
    return <DataError error={e} />;
  }
  const [projects, key, apiReady, saved, driveFolder] = data;
  return (
    <SourceIntake
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      hasKey={key.source !== "none" || ONLINE}
      online={ONLINE}
      kci={{ apiReady, saved }}
      google={googleConfig()}
      driveFolder={driveFolder}
    />
  );
}
