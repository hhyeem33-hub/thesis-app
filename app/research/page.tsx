import { Suspense } from "react";
import { connection } from "next/server";
import { DataError } from "@/components/data-error";
import { PageHeader } from "@/components/page-header";
import { SettingsSkeleton } from "@/components/page-skeletons";
import { ResearchForm } from "@/components/research-form";
import { getResearch } from "@/lib/sources";

export default function ResearchPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="연구 설정"
        description="내 연구 주제와 키워드예요. AI 분류가 자료의 논문 관련도를 매길 때 써요."
      />
      <Suspense fallback={<SettingsSkeleton />}>
        <ResearchContent />
      </Suspense>
    </div>
  );
}

async function ResearchContent() {
  await connection();
  let research;
  try {
    research = await getResearch();
  } catch (e) {
    return <DataError error={e} />;
  }
  return <ResearchForm initial={research} />;
}
