"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Ban, Check, FilePlus2, Library, Pause, Search, Star } from "lucide-react";
import { toast } from "sonner";
import { decideSource } from "@/app/source-actions";
import { BulkClassify } from "@/components/bulk-classify";
import { GradeBadge } from "@/components/grade-badge";
import { Hint } from "@/components/hint";
import { SourceReviewDialog } from "@/components/source-review-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DECISION_LABEL, type Classification, type DecisionStatus, type Source } from "@/lib/types";
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

// ── 출처 종류 (KCI 논문 / 웹 / 옵시디언 / 파일) ────────────────────────────────

type Kind = "kci" | "web" | "obsidian" | "file";
const KIND_LABEL: Record<Kind, string> = { kci: "KCI 논문", web: "웹", obsidian: "옵시디언", file: "파일" };
const KIND_STYLE: Record<Kind, string> = {
  kci: "bg-primary text-primary-foreground",
  web: "border border-border bg-background text-muted-foreground",
  obsidian: "bg-gold/25 text-foreground",
  file: "bg-secondary text-foreground",
};
/** 옵시디언에서 가져온 자료는 id 가 '…-5xxx-axxx-…' 모양 (노트 경로로 만든 고정 id) */
const OBSIDIAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/;

function kindOf(s: SourceListItem): Kind {
  if (s.bib?.kciId || s.bib?.category?.includes("KCI")) return "kci";
  if (OBSIDIAN_ID.test(s.id) || s.origin.includes("옵시디언")) return "obsidian";
  if (s.type === "pdf" || (s.type === "markdown" && !/^https?:/.test(s.origin))) return "file";
  return "web";
}

/** 화면에서만 제목 속 이모지를 뺀다 (저장된 제목은 그대로) */
const cleanTitle = (t: string) =>
  t
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim() || t;

type KindFilter = "all" | Kind;
const KIND_FILTERS: { id: KindFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "kci", label: "KCI 논문" },
  { id: "web", label: "웹" },
  { id: "obsidian", label: "옵시디언" },
];

const DECIDE_BUTTONS = [
  { st: "adopted" as const, icon: Check, on: "bg-success text-white hover:bg-success/90" },
  { st: "held" as const, icon: Pause, on: "bg-gold text-white hover:bg-gold/90" },
  { st: "excluded" as const, icon: Ban, on: "bg-muted-foreground text-background hover:bg-muted-foreground/90" },
];

export function SourcesList({ sources, hasKey }: { sources: SourceListItem[]; hasKey: boolean }) {
  const [items, setItems] = useState(sources);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [coreOnly, setCoreOnly] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const kinds = useMemo(() => new Map(items.map((s) => [s.id, kindOf(s)])), [items]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, undecided: 0, adopted: 0, held: 0, excluded: 0 };
    for (const s of items) c[s.classification?.decision?.status ?? "undecided"]++;
    return c;
  }, [items]);
  const kindCounts = useMemo(() => {
    const c: Record<KindFilter, number> = { all: items.length, kci: 0, web: 0, obsidian: 0, file: 0 };
    for (const s of items) c[kinds.get(s.id)!]++;
    return c;
  }, [items, kinds]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((s) => {
      const status = s.classification?.decision?.status ?? "undecided";
      if (filter !== "all" && status !== filter) return false;
      if (kind !== "all" && kinds.get(s.id) !== kind) return false;
      if (coreOnly && (s.classification?.relevance ?? 0) < 4) return false;
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
  }, [query, filter, kind, coreOnly, items, kinds]);

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

  const chip = (active: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
      active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary"
    );

  return (
    <div className="flex flex-col gap-3">
      <BulkClassify hasKey={hasKey} pendingCount={items.filter((s) => !s.classification?.relevance).length} total={items.length} />

      {/* 검색 + 확정 상태 */}
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

      {/* 출처 종류 + 빠른 필터 */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="출처 종류와 빠른 필터">
        {KIND_FILTERS.map((f) => (
          <button key={f.id} type="button" aria-pressed={kind === f.id} className={chip(kind === f.id)} onClick={() => setKind(f.id)}>
            {f.label}
            <span className={cn("text-xs tabular-nums", kind === f.id ? "text-primary-foreground/80" : "text-muted-foreground")}>
              {kindCounts[f.id]}
            </span>
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <button type="button" aria-pressed={coreOnly} className={chip(coreOnly)} onClick={() => setCoreOnly((v) => !v)}>
          <Star className="size-3.5" />
          등급 4~5만
        </button>
        <button
          type="button"
          aria-pressed={filter === "adopted"}
          className={chip(filter === "adopted")}
          onClick={() => setFilter((f) => (f === "adopted" ? "all" : "adopted"))}
        >
          <Check className="size-3.5" />
          채택만
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        {shown.length}개 보임 (전체 {items.length}개) · 줄을 누르면 자세히 볼 수 있어요 · 등급 색: <GradeBadge grade={5} />{" "}
        <GradeBadge grade={4} /> <GradeBadge grade={3} /> <GradeBadge grade={2} /> <GradeBadge grade={1} />
      </p>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table className="table-fixed">
          <colgroup>
            <col />
            <col className="w-24" />
            <col className="w-40" />
            <col className="w-32" />
          </colgroup>
          <TableHeader>
            <TableRow className="bg-secondary/50 hover:bg-secondary/50">
              <TableHead className="pl-5">제목</TableHead>
              <TableHead>관련도</TableHead>
              <TableHead>토픽</TableHead>
              <TableHead className="pr-5 text-center">확정</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="reveal-list">
            {shown.map((s) => {
              const topic = topicOf(s.classification);
              const status = s.classification?.decision?.status ?? null;
              const k = kinds.get(s.id)!;
              const title = cleanTitle(s.title);
              return (
                <TableRow
                  key={s.id}
                  tabIndex={0}
                  aria-label={`${title} 자세히 보기`}
                  onClick={() => setReviewId(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.target === e.currentTarget) setReviewId(s.id);
                  }}
                  className={cn(
                    "cursor-pointer border-b border-border/50 transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none",
                    status === "excluded" && "opacity-60"
                  )}
                >
                  <TableCell className="py-3.5 pl-5 whitespace-normal">
                    <p className="line-clamp-2 leading-snug font-medium break-keep" title={s.title}>
                      {title}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={cn("rounded px-1.5 py-px text-[11px] font-medium", KIND_STYLE[k])}>{KIND_LABEL[k]}</span>
                      {s.bib?.year && <span className="tabular-nums">{s.bib.year}</span>}
                      {s.bib?.year && <span aria-hidden="true">·</span>}
                      <span className="tabular-nums">{dateFormat.format(new Date(s.updatedAt))}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 whitespace-normal">
                    <GradeBadge grade={s.classification?.relevance} />
                  </TableCell>
                  <TableCell className="py-3.5 whitespace-normal">
                    {topic ? (
                      <p className="line-clamp-2 text-sm leading-snug break-keep" title={topic.text}>
                        {topic.text}
                        {topic.ai && <span className="ml-1 text-[11px] text-muted-foreground">(AI)</span>}
                      </p>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3.5 pr-5">
                    <div
                      className="mx-auto flex w-fit items-center gap-0.5 rounded-full border bg-background p-0.5"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {DECIDE_BUTTONS.map(({ st, icon: Icon, on }) => (
                        <Hint key={st} label={status === st ? `${DECISION_LABEL[st]} (다시 누르면 취소)` : DECISION_LABEL[st]}>
                          <button
                            type="button"
                            aria-label={DECISION_LABEL[st]}
                            aria-pressed={status === st}
                            disabled={busyId === s.id}
                            onClick={() => decide(s, st)}
                            className={cn(
                              "flex size-7 items-center justify-center rounded-full transition-colors disabled:opacity-50",
                              status === st ? on : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                            )}
                          >
                            <Icon className="size-3.5" />
                          </button>
                        </Hint>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
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
