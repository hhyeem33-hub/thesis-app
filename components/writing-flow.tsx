"use client";

import { Fragment, useState, useTransition } from "react";
import { Check, ChevronDown, CircleAlert, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { draftAbstractAction } from "@/app/write-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NEED } from "@/lib/bib";
import { outline, tableCaption, type Parts } from "@/lib/export-doc";
import { DOC_KINDS, type DocKind, type DocPlan, type ThesisDoc } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  chapterChars,
  DOC_KIND_LABEL,
  DOC_KIND_PRESET,
  presetPlan,
  resizePlan,
  STAGE_HINT,
  STAGES,
  stageDone,
  type Stage,
} from "@/lib/writing";

// 글쓰기의 ‘논문 집필’ 흐름: 단계 표시 · 국문 초록·주제어 · 분량 설정 · 최종 원고(A4)

type StageDoc = Parameters<typeof stageDone>[0];

/** 준비 → 초록 → 본문 집필 → 참고문헌 → 양식 적용 → 최종 확인. 저장된 원고 기준으로 ‘저장✓’ */
export function WritingStages({
  saved,
  live,
  savedRefs,
  liveRefs,
}: {
  saved: StageDoc;
  live: StageDoc;
  savedRefs: string[];
  liveRefs: string[];
}) {
  const done = stageDone(saved, savedRefs);
  const now = stageDone(live, liveRefs);
  const current = STAGES.find((s) => !done[s]);
  return (
    <ol className="flex flex-wrap items-stretch gap-1.5 text-xs" aria-label="집필 단계">
      {STAGES.map((s: Stage, i) => {
        const ok = done[s];
        const unsaved = !ok && now[s];
        return (
          <li key={s} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="text-muted-foreground">→</span>}
            <span
              title={STAGE_HINT[s]}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                ok
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : s === current
                    ? "border-gold bg-gold/15 font-medium"
                    : "border-dashed text-muted-foreground"
              )}
            >
              <span className="tabular-nums text-muted-foreground">{i + 1}</span>
              {s}
              {ok ? (
                <span className="inline-flex items-center gap-0.5 font-medium text-primary">
                  <Check className="size-3" />
                  저장
                </span>
              ) : unsaved ? (
                <span className="text-primary">· 저장 전</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** 국문 초록 · 주제어 + AI 초안 받기 (본문만 근거). 받은 초안은 미리 보고 ‘칸에 넣기’ 해야 들어감 */
export function AbstractCard({
  doc,
  disabled,
  onChange,
}: {
  doc: Pick<ThesisDoc, "projectId" | "title" | "body" | "abstract" | "keywords" | "plan">;
  disabled?: boolean;
  onChange: (patch: { abstract?: string; keywords?: string }) => void;
}) {
  const [open, setOpen] = useState(!doc.abstract);
  const [draft, setDraft] = useState<{ abstract: string; keywords: string } | null>(null);
  const [pending, start] = useTransition();
  const chars = Array.from(doc.abstract ?? "").length;

  const ask = () =>
    start(async () => {
      const r = await draftAbstractAction({
        projectId: doc.projectId,
        title: doc.title,
        kind: doc.plan ? DOC_KIND_LABEL[doc.plan.kind] : "학위논문",
        body: doc.body,
      });
      if (!r.ok) {
        toast.error("초록 초안을 받지 못했어요", { description: r.error });
        return;
      }
      setDraft({ abstract: r.abstract, keywords: r.keywords });
      setOpen(true);
    });

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <button type="button" className="flex items-center gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="font-heading font-semibold">국문 초록 · 주제어</span>
          <span className="text-xs text-muted-foreground">
            {doc.abstract?.trim() ? `${chars.toLocaleString()}자` : "아직 없음"}
            {doc.keywords?.trim() ? ` · 주제어 ${doc.keywords.split(/[,，]/).filter((k) => k.trim()).length}개` : ""}
          </span>
          <ChevronDown className={cn("ml-auto size-4 transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <>
            <Textarea
              value={doc.abstract ?? ""}
              onChange={(e) => onChange({ abstract: e.target.value })}
              rows={6}
              aria-label="국문 초록"
              placeholder="연구 목적 → 대상·방법 → 주요 내용 → 의의 순으로 써요. 문단은 빈 줄로 나눠요."
              className="font-serif text-[15px] leading-7"
            />
            <Input
              value={doc.keywords ?? ""}
              onChange={(e) => onChange({ keywords: e.target.value })}
              aria-label="주제어"
              placeholder="주제어 (쉼표로 나눠요. 예: 수면 건강식품, 웰니스, 한중 비교)"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={ask} disabled={pending || disabled}>
                {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                AI로 초안 받기
              </Button>
              <span className="text-xs text-muted-foreground">
                지금 본문만 근거로 써요(지어내지 않음, 모르는 결과는 [확인 필요]). 받은 뒤 확인하고 칸에 넣어요.
              </span>
            </div>
            {draft && (
              <div className="flex flex-col gap-2 rounded-lg border border-gold bg-gold/10 p-3 text-sm">
                <p className="text-xs font-medium">AI 초안 (아직 칸에 안 들어갔어요)</p>
                <p className="whitespace-pre-line font-serif leading-7">{draft.abstract}</p>
                <p className="text-xs">
                  <b>주제어</b>: {draft.keywords}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      onChange({ abstract: draft.abstract, keywords: draft.keywords });
                      setDraft(null);
                      toast.success("초록·주제어 칸에 넣었어요", { description: "저장을 눌러야 기록돼요." });
                    }}
                  >
                    칸에 넣기
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                    버리기
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** 분량 설정: 글 종류 → 장 수·장별 목표, 장마다 지금 쓴 분량 / 목표 / 진행 막대 */
export function VolumeCard({ body, plan, onChange }: { body: string; plan?: DocPlan; onChange: (plan: DocPlan) => void }) {
  const [open, setOpen] = useState(!plan);
  const written = chapterChars(body);
  const rows = plan ? Math.max(plan.chapters, written.length) : written.length;
  const total = written.reduce((a, c) => a + c.chars, 0);
  const goal = plan?.targets.reduce((a, b) => a + b, 0) ?? 0;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <button type="button" className="flex items-center gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="font-heading font-semibold">분량</span>
          <span className="text-xs text-muted-foreground">
            {plan ? `${DOC_KIND_LABEL[plan.kind]} · ${total.toLocaleString()} / ${goal.toLocaleString()}자` : "글 종류를 골라 주세요"}
          </span>
          {plan && goal > 0 && <Bar value={total} max={goal} className="ml-2 w-24" />}
          <ChevronDown className={cn("ml-auto size-4 transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="글 종류">
              {DOC_KINDS.map((k: DocKind) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={plan?.kind === k}
                  title={DOC_KIND_PRESET[k].note}
                  onClick={() => {
                    if (plan?.kind === k) return;
                    if (plan && !window.confirm(`${DOC_KIND_LABEL[k]} 기준으로 장 수·목표 분량을 다시 채울까요? (지금 목표 숫자는 바뀌어요)`)) return;
                    onChange(presetPlan(k));
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-1 text-sm",
                    plan?.kind === k ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"
                  )}
                >
                  {DOC_KIND_LABEL[k]}
                </button>
              ))}
              {plan && (
                <label className="ml-auto flex items-center gap-1.5 text-xs">
                  장 수
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={plan.chapters}
                    onChange={(e) => onChange(resizePlan(plan, Number(e.target.value) || 1))}
                    className="h-7 w-16 text-right"
                    aria-label="장 수"
                  />
                </label>
              )}
            </div>
            {plan && <p className="text-xs text-muted-foreground">{DOC_KIND_PRESET[plan.kind].note} 으로 채웠어요. 목표 숫자는 눌러서 바꿀 수 있어요.</p>}
            {rows === 0 ? (
              <p className="text-sm text-muted-foreground">본문에 ‘# 장 제목’ 줄을 넣으면 장마다 분량이 보여요.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {Array.from({ length: rows }, (_, i) => {
                  const w = written[i];
                  const target = plan?.targets[i] ?? 0;
                  const extra = plan && i >= plan.chapters;
                  return (
                    <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
                      <span className={cn("truncate", !w && "text-muted-foreground")}>
                        {i + 1}. {w ? w.title : "(아직 안 쓴 장)"}
                        {extra && <span className="ml-1 text-xs text-gold">· 목표 장 수보다 많아요</span>}
                      </span>
                      <span className="flex items-center gap-1 text-xs tabular-nums">
                        {(w?.chars ?? 0).toLocaleString()} /
                        {plan && !extra ? (
                          <Input
                            type="number"
                            min={0}
                            step={500}
                            value={target}
                            onChange={(e) => {
                              const targets = [...plan.targets];
                              targets[i] = Math.max(0, Math.round(Number(e.target.value) || 0));
                              onChange({ ...plan, targets });
                            }}
                            className="h-7 w-24 text-right"
                            aria-label={`${i + 1}장 목표 글자 수`}
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        자
                      </span>
                      {plan && !extra && <Bar value={w?.chars ?? 0} max={target} className="col-span-2" />}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Bar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${pct}%`}
    >
      <div className={cn("h-full rounded-full", value >= max && max > 0 ? "bg-gold" : "bg-primary")} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** [보완 필요] 금색 표시 */
function needMark(text: string) {
  return text.split(/(\[보완 필요\])/g).map((p, i) =>
    p === NEED ? (
      <mark key={i} className="rounded bg-gold/30 px-0.5">
        {p}
      </mark>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    )
  );
}

function PartsView({ parts }: { parts: Parts }) {
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <Fragment key={i}>{needMark(p)}</Fragment>
        ) : (
          <sup key={i} className="text-[0.7em]">
            {p.note}
          </sup>
        )
      )}
    </>
  );
}

/** 최종 원고: A4 종이 모양, 외대 양식 순서 (제목 → 이름＊ → 국문 초록·주제어 → 목차 → 본문 → 각주 → 참고문헌) */
export function FinalManuscript({
  doc,
  references,
}: {
  doc: Pick<ThesisDoc, "title" | "author" | "affiliation" | "body" | "footnotes" | "abstract" | "keywords">;
  references: string[];
}) {
  const o = outline(doc, references);
  const chapters = o.blocks.filter((b) => b.kind === "heading" && b.level === 0);
  const sheet = "mx-auto w-full max-w-[210mm] bg-white px-[8%] py-[10%] text-[#1a1a1a] shadow-md ring-1 ring-black/10 sm:min-h-[297mm]";
  return (
    <div className="flex flex-col gap-6 bg-muted/40 px-2 py-6 font-serif text-[13px] leading-[1.9] sm:px-6">
      <article className={sheet} aria-label="최종 원고 1쪽">
        <h1 className="text-center text-[20px] leading-snug font-bold">{needMark(o.title)}</h1>
        <p className="mt-3 text-right">
          {o.author || "이름 [보완 필요]"}
          <sup>＊</sup>
        </p>

        {(o.abstract || o.keywords) && (
          <section className="mt-8 border-y border-black/30 py-4 text-[12px]">
            <h2 className="mb-2 text-center font-bold">국문 초록</h2>
            {o.abstract.split(/\n\s*\n/).map((p, i) => (
              <p key={i} className="indent-[1em] text-justify">
                {needMark(p.replace(/\n/g, " "))}
              </p>
            ))}
            {o.keywords && (
              <p className="mt-2">
                <b>주제어</b>: {o.keywords}
              </p>
            )}
          </section>
        )}

        {chapters.length > 0 && (
          <table className="mt-6 w-full border-collapse text-[12px]">
            <tbody>
              <tr>
                <th className="border border-black/50 py-1 font-bold">목 차</th>
              </tr>
              <tr>
                <td className="border border-black/50 px-4 py-2">
                  {chapters.map((c) => c.kind === "heading" && <p key={c.num}>{`${c.num} ${c.text}`}</p>)}
                </td>
              </tr>
            </tbody>
          </table>
        )}

        <div className="mt-8 flex flex-col gap-2">
          {o.blocks.map((b, i) => {
            if (b.kind === "heading")
              return (
                <p key={i} className={cn("font-bold", b.level === 0 ? "mt-6 text-[15px]" : b.level === 1 ? "mt-3" : "mt-2")}>
                  {b.num} {b.text}
                </p>
              );
            if (b.kind === "table") {
              const [head, ...rest] = b.rows;
              return (
                <table key={i} className="my-2 w-full border-collapse text-[12px] leading-snug">
                  <caption className="mb-1 caption-top text-center font-bold">{tableCaption(b)}</caption>
                  <thead>
                    <tr>
                      {head.map((c, ci) => (
                        <th key={ci} className="border border-black/60 bg-black/5 px-2 py-1">
                          <PartsView parts={c} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rest.map((r, ri) => (
                      <tr key={ri}>
                        {r.map((c, ci) => (
                          <td key={ci} className="border border-black/60 px-2 py-1">
                            <PartsView parts={c} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            }
            return (
              <p key={i} className="indent-[1em] text-justify">
                <PartsView parts={b.parts} />
              </p>
            );
          })}
          {!o.blocks.length && <p className="text-center text-black/50">본문이 아직 없어요.</p>}
        </div>

        <footer className="mt-10 border-t border-black/40 pt-2 text-[11px] leading-relaxed">
          <p>＊ {o.affiliation || "소속 [보완 필요]"}</p>
          {o.notes.map((n, i) => (
            <p key={i}>
              <sup>{i + 1}</sup> {needMark(n)}
            </p>
          ))}
        </footer>
      </article>

      <article className={sheet} aria-label="참고문헌 쪽">
        <h2 className="mb-4 text-center text-[15px] font-bold">참고문헌</h2>
        {o.references.length ? (
          o.references.map((r, i) => (
            <p key={i} className="pl-[2em] -indent-[2em] text-[12px]">
              {needMark(r)}
            </p>
          ))
        ) : (
          <p className="text-center text-black/50">‘자료로 각주’로 출처를 달면 여기에 모여요.</p>
        )}
      </article>
    </div>
  );
}

/** 최종 원고 아래: 남은 확인할 곳 + ‘최종 확인 완료’ */
export function FinalCheckBar({
  need,
  noSource,
  dirty,
  checkedAt,
  pending,
  onCheck,
}: {
  need: number;
  noSource: number;
  dirty: boolean;
  checkedAt?: string;
  pending: boolean;
  onCheck: (on: boolean) => void;
}) {
  const left = need + noSource;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm">
      {left ? (
        <span className="inline-flex items-center gap-1.5">
          <CircleAlert className="size-4 text-gold" />
          확인할 곳 {left}개 · [보완 필요] {need} · 출처 없는 각주 {noSource}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <Check className="size-4 text-primary" />
          [보완 필요]·출처 없는 각주가 없어요
        </span>
      )}
      {dirty && <span className="text-xs text-primary">● 저장 안 된 변경이 있어요 — 저장한 뒤 확인해 주세요</span>}
      <div className="ml-auto flex items-center gap-2">
        {checkedAt && (
          <span className="text-xs text-muted-foreground">
            {new Date(checkedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" })} 확인함
          </span>
        )}
        {checkedAt ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => onCheck(false)}>
            확인 취소
          </Button>
        ) : (
          <Button size="sm" disabled={pending || dirty} onClick={() => onCheck(true)} title={dirty ? "먼저 저장해 주세요" : undefined}>
            {pending ? <Loader2 className="animate-spin" /> : <Check />}
            최종 확인 완료
          </Button>
        )}
      </div>
    </div>
  );
}
