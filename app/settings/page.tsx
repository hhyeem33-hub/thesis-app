import { Suspense } from "react";
import { connection } from "next/server";
import { AiSettingsCard } from "@/components/ai-settings-card";
import { PageHeader } from "@/components/page-header";
import { SettingsSkeleton } from "@/components/page-skeletons";
import { SettingsForm } from "@/components/settings-form";
import { getAiKeyStatus } from "@/lib/ai";
import { getSettings } from "@/lib/store";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="설정"
        description="프로젝트 폴더를 만들 위치예요. 처음에는 컴퓨터에서 자동으로 찾아 채워져요."
      />
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}

async function SettingsContent() {
  await connection();
  return (
    <div className="flex flex-col gap-4">
      <SettingsForm initial={await getSettings()} />
      <AiSettingsCard status={await getAiKeyStatus()} onVercel={!!process.env.VERCEL} />
    </div>
  );
}
