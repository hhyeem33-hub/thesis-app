import { Suspense } from "react";
import { connection } from "next/server";
import { savedKciIds } from "@/app/kci-actions";
import { DataError } from "@/components/data-error";
import { KciSearch } from "@/components/kci-search";
import { PageHeader } from "@/components/page-header";
import { SettingsSkeleton } from "@/components/page-skeletons";
import { ONLINE } from "@/lib/db";
import { canUseKciApi } from "@/lib/kci";
import { getProjects } from "@/lib/store";

export default function KciPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="KCI 검색"
        description="한국학술지인용색인(KCI)에서 선행연구를 찾아 라이브러리에 저장해요. 출처와 서지 정보가 자동으로 들어가요."
      />
      <Suspense fallback={<SettingsSkeleton />}>
        <KciContent />
      </Suspense>
    </div>
  );
}

async function KciContent() {
  await connection();
  let data;
  try {
    data = await Promise.all([canUseKciApi(), getProjects(), savedKciIds()]);
  } catch (e) {
    return <DataError error={e} />;
  }
  const [apiReady, projects, saved] = data;
  return (
    <KciSearch
      apiReady={apiReady}
      online={ONLINE}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      initialSaved={saved}
    />
  );
}
