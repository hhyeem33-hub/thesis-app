import { Suspense } from "react";
import { connection } from "next/server";
import { DataError } from "@/components/data-error";
import { PageHeader } from "@/components/page-header";
import { ProjectsSkeleton } from "@/components/page-skeletons";
import { TimelineChart, type TimelineItem } from "@/components/timeline-chart";
import { Card, CardContent } from "@/components/ui/card";
import { getSources } from "@/lib/sources";
import { DECISION_LABEL } from "@/lib/types";

export default function TimelinePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="자료 연표" description="자료를 발행 연도별로 봐요. 막대를 누르면 그 해 자료 목록이 나와요." />
      <Suspense fallback={<ProjectsSkeleton />}>
        <TimelineContent />
      </Suspense>
    </div>
  );
}

async function TimelineContent() {
  await connection();
  let sources;
  try {
    sources = await getSources();
  } catch (e) {
    return <DataError error={e} />;
  }
  const items: TimelineItem[] = [];
  let unknown = 0;
  for (const s of sources) {
    const year = s.bib?.year?.match(/(19|20)\d{2}/)?.[0];
    if (!year) {
      unknown++;
      continue;
    }
    const status = s.classification?.decision?.status;
    items.push({
      id: s.id,
      title: s.title,
      year,
      authors: s.bib?.authors ?? "",
      relevance: s.classification?.relevance ?? 0,
      status: status ? DECISION_LABEL[status] : null,
      category: s.bib?.category ?? "",
    });
  }
  return (
    <Card>
      <CardContent>
        <TimelineChart items={items} unknown={unknown} />
      </CardContent>
    </Card>
  );
}
