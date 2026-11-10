"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Ban, Check, Eye, FilePlus2, Library, Pause, Search } from "lucide-react";
import { toast } from "sonner";
import { decideSource } from "@/app/source-actions";
import { BulkClassify } from "@/components/bulk-classify";
import { GradeBadge } from "@/components/grade-badge";
import { SourceReviewDialog } from "@/components/source-review-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DECISION_LABEL,
  SOURCE_TYPE_LABEL,
  type Classification,
  type DecisionStatus,
  type Source,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeZone: "Asia/Seoul",
});

/** 목록에 필요한 것만 (본문 전체는 상세 화면에서) */
export type SourceListItem = Omit<Source, "content"> & { projectName: string | null; excerpt: string };

type Filter = "all" | "undecided" | DecisionStatus;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "undecided", label: "미정" },
  { id: "adopted", label: "채택" },
  { id: "held", label: "보류" },
  { id: "excluded", label: "제외" },
];

export const STATUS_STYLE: Record<DecisionStatus, string> = {
  adopted: "bg-success/15 text-success",
  held: "bg-gold/25 text-foreground",
  excluded: "bg-muted text-muted-foreground line-through",
};

export function StatusBadge({ status }: { status: DecisionStatus | null | undefined }) {
  if (!status) return <span className="text-xs text-muted-foreground">미정</span>;
  return <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", STATUS_STYLE[status])}>{DECISION_LABEL[status]}</span>;
}

/** 최종 토픽이 있으면 그것, 없으면 AI 제안 (AI) */
export function topicOf(c: Classification | null | undefined) {
  if (c?.decision?.finalTopic) return { text: c.decision.finalTopic, ai: false };
  if (c?.topic) return { text: c.topic, ai: true };
  return null;
}

export function SourcesList({ sources, hasKey }: { sources: SourceListItem[]; hasKey: boolean }) {
  const [items, setItems] = useState(sources);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, undecided: 0, adopted: 0, held: 0, excluded: 0 };
    for (const s of items) c[s.classification?.decision?.status ?? "undecided"]++;
    return c;
  }, [items]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((s) => {
      const status = s.classification?.decision?.status ?? "undecided";
      if (filter !== "all" && status !== filter) return false;
      if (!q) return true;
      return [
        s.title,
        s.origin,
        s.excerpt,
        s.projectName ?? "",
        s.classification?.summary ?? "",
        s.classification?.topic ?? "",
        s.classification?.decision?.finalTopic ?? "",
        (s.classification?.keywords ?? []).join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [query, filter, items]);

  const patch = (id: string, classification: Classification) =>
    setItems((list) => list.map((s) => (s.id === id ? { ...s, classification } : s)));

  function decide(s: SourceListItem, status: DecisionStatus) {
    const next = s.classification?.decision?.status === status ? null : status; // 같은 버튼 다시 누르면 취소
    setBusyId(s.id);
    startTransition(async () => {
      const r = await decideSource(
        s.id,
        { status: next },
        next ? `${DECISION_LABEL[next]}(으)로 확정` : `${DECISION_LABEL[status]} 취소`
      );
      setBusyId(null);
      if (!r.ok || !r.classification) {
        toast.error("바꾸지 못했어요", { description: r.ok ? undefined : r.error });
        return;
      }
      patch(s.id, r.classification);
    });
  }

  if (sources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center text-muted-foreground">
        <Library className="size-10" />
        <p className="font-medium">아직 모은 자료가 없어요.</p>
        <Link href="/sources/new" className={buttonVariants({ size: "sm" })}>
          <FilePlus2 />
          첫 자료 수집하기
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <BulkClassify hasKey={hasKey} pendingCount={items.filter((s) => !s.classification?.relevance).length} total={items.length} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목·출처·내용·토픽·키워드로 검색"
            className="pl-8"
            aria-label="자료 검색"
          />
        </div>
        <div className="inline-flex flex-wrap rounded-lg border p-0.5" role="tablist" aria-label="확정 상태">
          {FILTERS.map((f) => (
            <Button
              key={f.id}
              size="sm"
              role="tab"
              aria-selected={filter === f.id}
              variant={filter === f.id ? "secondary" : "ghost"}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span className="text-xs text-muted-foreground tabular-nums">{counts[f.id]}</span>
            </Button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {shown.length}개 보임 (전체 {items.length}개) · 등급 색: <GradeBadge grade={5} /> <GradeBadge grade={4} />{" "}
        <GradeBadge grade={3} /> <GradeBadge grade={2} /> <GradeBadge grade={1} />
      </p>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">제목</TableHead>
              <TableHead>관련도</TableHead>
              <TableHead>토픽</TableHead>
              <TableHead>확정</TableHead>
              <TableHead className="pr-4 text-right">연구자 판단</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="reveal-list">
            {shown.map((s) => {
              const topic = topicOf(s.classification);
              const status = s.classification?.decision?.status ?? null;
              return (
                <TableRow key={s.id} className={cn(status === "excluded" && "opacity-60")}>
                  <TableCell className="max-w-80 pl-4">
                    <Link href={`/sources/${s.id}`} className="font-medium hover:underline">
                      {s.bib?.category && (
                        <span className="mr-1.5 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
                          {s.bib.category}
                        </span>
                      )}
                      {s.title}
                    </Link>
                    <div className="truncate text-xs text-muted-foreground">
                      {SOURCE_TYPE_LABEL[s.type]} · {s.projectName ?? "프로젝트 없음"} · {dateFormat.format(new Date(s.updatedAt))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <GradeBadge grade={s.classification?.relevance} />
                  </TableCell>
                  <TableCell className="max-w-44 truncate text-sm">
                    {topic ? (
                      <>
                        {topic.text}
                        {topic.ai && <span className="ml-1 text-xs text-muted-foreground">(AI)</span>}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={status} />
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex justify-end gap-1">
                      {(
                        [
                          ["adopted", <Check key="i" />],
                          ["held", <Pause key="i" />],
                          ["excluded", <Ban key="i" />],
                        ] as const
                      ).map(([st, icon]) => (
                        <Button
                          key={st}
                          size="xs"
                          variant={status === st ? "secondary" : "ghost"}
                          aria-pressed={status === st}
                          disabled={busyId === s.id}
                          onClick={() => decide(s, st)}
                        >
                          {icon}
                          {DECISION_LABEL[st]}
                        </Button>
                      ))}
                      <Button size="xs" variant="outline" onClick={() => setReviewId(s.id)}>
                        <Eye />
                        자세히
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  조건에 맞는 자료가 없어요.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <SourceReviewDialog
        sourceId={reviewId}
        onClose={() => setReviewId(null)}
        onChange={(id, c) => patch(id, c)}
      />
    </div>
  );
}
