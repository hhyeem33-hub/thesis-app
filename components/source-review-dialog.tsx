"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Bot, CheckCheck, ExternalLink, Loader2, Pause, RotateCcw, Save, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { classifySourceAction, decideSource, sourceForReview } from "@/app/source-actions";
import { BibForm } from "@/components/bib-form";
import { GradeBadge } from "@/components/grade-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DECISION_LABEL, PARA_LABEL, type Classification, type Decision, type Source } from "@/lib/types";
import { cn } from "@/lib/utils";

type Review = NonNullable<Awaited<ReturnType<typeof sourceForReview>>>;

const when = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" });
const CONF_STYLE = { 높음: "text-success", 중간: "text-foreground", 낮음: "text-destructive" } as const;

export function SourceReviewDialog({
  sourceId,
  onClose,
  onChange,
}: {
  sourceId: string | null;
  onClose: () => void;
  onChange: (id: string, c: Classification) => void;
}) {
  const [data, setData] = useState<Review | null>(null);
  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  // 창을 열 때 자료 불러오기
  useEffect(() => {
    if (!sourceId) return;
    let alive = true;
    sourceForReview(sourceId).then((r) => {
      if (!alive) return;
      setData(r);
      const d = r?.source.classification?.decision;
      setTopic(d?.finalTopic ?? "");
      setKeywords((d?.finalKeywords ?? []).join(", "));
      setNote(d?.note ?? "");
    });
    return () => {
      alive = false;
    };
  }, [sourceId]);

  const source = data?.source;
  const c = source?.classification ?? null;
  const decision = c?.decision;

  const apply = (next: Classification) => {
    if (!source) return;
    setData((d) => (d ? { ...d, source: { ...d.source, classification: next } } : d));
    onChange(source.id, next);
  };

  function decide(patch: Partial<Pick<Decision, "status" | "finalTopic" | "finalKeywords" | "note">>, what: string) {
    if (!source) return;
    startTransition(async () => {
      const r = await decideSource(source.id, patch, what);
      if (!r.ok || !r.classification) {
        toast.error("저장하지 못했어요", { description: r.ok ? undefined : r.error });
        return;
      }
      apply(r.classification);
      toast.success(what);
    });
  }

  function reclassify() {
    if (!source) return;
    startTransition(async () => {
      const r = await classifySourceAction(source.id);
      if (!r.ok) {
        toast.error("AI 판단에 실패했어요", { description: r.error });
        return;
      }
      const fresh = await sourceForReview(source.id);
      if (fresh?.source.classification) apply(fresh.source.classification);
      setData(fresh);
      toast.success(`AI가 ${r.relevance}등급으로 판단했어요`);
    });
  }

  const finalKeywords = () => [...new Set(keywords.split(/[,，]/).map((k) => k.trim()).filter(Boolean))];
  const topicChoices = [...new Set([...(data?.outline ?? []), ...(c?.topic ? [c.topic] : [])])];

  return (
    <Dialog open={!!sourceId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        {!source || source.id !== sourceId ? (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            불러오는 중…
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle className="pr-6 leading-snug">{source.title}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                {/^https?:\/\//.test(source.origin) ? (
                  <a href={source.origin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
                    출처 열기
                    <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <span>{source.origin || "출처 미확인"}</span>
                )}
                <Link href={`/sources/${source.id}`} className="underline">
                  자료 상세 페이지
                </Link>
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              {/* 왼쪽: AI 제안 */}
              <section className="flex flex-col gap-3 rounded-xl border p-4">
                <h3 className="inline-flex items-center gap-1.5 font-heading font-semibold">
                  <Bot className="size-4" />
                  AI 제안
                </h3>
                {c?.relevance ? (
                  <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">관련도</dt>
                    <dd>
                      <GradeBadge grade={c.relevance} /> <span className="text-xs text-muted-foreground">5점 만점</span>
                    </dd>
                    <dt className="text-muted-foreground">제안 토픽</dt>
                    <dd className="font-medium">{c.topic || "—"}</dd>
                    <dt className="text-muted-foreground">관련 키워드</dt>
                    <dd className="flex flex-wrap gap-1">
                      {(c.keywords ?? []).map((k) => (
                        <span key={k} className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                          #{k}
                        </span>
                      ))}
                    </dd>
                    <dt className="text-muted-foreground">분류 근거</dt>
                    <dd className="leading-relaxed">{c.reason || "—"}</dd>
                    <dt className="text-muted-foreground">신뢰도</dt>
                    <dd className={cn("font-medium", c.confidence && CONF_STYLE[c.confidence])}>{c.confidence ?? "—"}</dd>
                    <dt className="text-muted-foreground">PARA</dt>
                    <dd>{PARA_LABEL[c.para]}</dd>
                    <dt className="text-muted-foreground">요약</dt>
                    <dd className="leading-relaxed text-muted-foreground">{c.summary}</dd>
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">아직 AI가 판단하지 않았어요.</p>
                )}
                <Button size="sm" variant="outline" className="w-fit" disabled={pending} onClick={reclassify}>
                  {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  {c?.relevance ? "AI 판단 다시 하기" : "AI 판단 받기"}
                </Button>
              </section>

              {/* 오른쪽: 연구자 확정 분류 */}
              <section className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
                <h3 className="inline-flex items-center gap-1.5 font-heading font-semibold">
                  <UserRound className="size-4" />
                  연구자 확정 분류
                  <span className="ml-auto text-xs font-normal">
                    {decision?.status ? DECISION_LABEL[decision.status] : "미정"}
                  </span>
                </h3>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rv-topic" className="text-xs">
                    최종 토픽
                  </Label>
                  <Input
                    id="rv-topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    list="rv-topic-list"
                    placeholder={c?.topic ? `예: ${c.topic}` : "목차 항목이나 주제명"}
                  />
                  <datalist id="rv-topic-list">
                    {topicChoices.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rv-keywords" className="text-xs">
                    확정 키워드 (쉼표로 구분)
                  </Label>
                  <Input id="rv-keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    disabled={pending || !c?.relevance}
                    onClick={() => {
                      setTopic(c?.topic ?? "");
                      setKeywords((c?.keywords ?? []).join(", "));
                      decide(
                        { status: "adopted", finalTopic: c?.topic ?? "", finalKeywords: c?.keywords ?? [] },
                        "AI 제안 승인 (채택)"
                      );
                    }}
                  >
                    <CheckCheck />
                    AI 제안 승인
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => decide({ status: "adopted", finalTopic: topic, finalKeywords: finalKeywords() }, "직접 정한 토픽으로 채택")}
                  >
                    <Save />
                    이대로 채택
                  </Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => decide({ status: "held" }, "보류")}>
                    <Pause />
                    보류
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      setTopic("");
                      setKeywords("");
                      decide({ status: null, finalTopic: "", finalKeywords: [] }, "미분류로 되돌림");
                    }}
                  >
                    <RotateCcw />
                    미분류
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => decide({ status: "excluded" }, "제외")}
                  >
                    제외
                  </Button>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rv-note" className="text-xs">
                    내 관점 메모
                  </Label>
                  <Textarea
                    id="rv-note"
                    value={note}
                    rows={3}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="이 자료를 논문에서 어떻게 쓸지, 동의·반박하는 점 등"
                  />
                  <Button
                    size="xs"
                    variant="outline"
                    className="w-fit"
                    disabled={pending || note === (decision?.note ?? "")}
                    onClick={() => decide({ note }, "내 관점 메모 저장")}
                  >
                    메모 저장
                  </Button>
                </div>
              </section>
            </div>

            <BibForm source={source as Source} />

            <section className="flex flex-col gap-2 rounded-xl border p-4">
              <h3 className="font-heading font-semibold">분류 수정 기록</h3>
              {(c?.log ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">아직 기록이 없어요.</p>
              ) : (
                <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
                  {c!.log!.map((l, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{when(l.at)}</span>
                      <span className={cn("shrink-0 text-xs font-medium", l.who === "AI" ? "text-muted-foreground" : "text-primary")}>
                        {l.who}
                      </span>
                      <span>{l.what}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
