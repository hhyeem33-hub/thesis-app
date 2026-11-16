"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, Eye, Layers, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { draftChapterAction } from "@/app/write-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ChapterDraft } from "@/lib/chapter-draft";
import type { Footnote } from "@/lib/types";
import { cn } from "@/lib/utils";

type Ok = Extract<ChapterDraft, { ok: true }>;
type Item = { status: "running" } | (ChapterDraft & { inserted?: boolean });

/** 대략 원화 (1달러 ≈ 1,400원) */
const won = (usd: number) => `약 ${Math.max(1, Math.round(usd * 1400)).toLocaleString()}원`;

const selectClass =
  "h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** 글쓰기 → AI 초안 탭: 목차의 장을 골라 채택 자료로 초안 받기 → 미리보기 → 본문에 넣기 */
export function ChapterDrafter({
  projectId,
  outline,
  adoptedCount,
  disabled,
  renderPreview,
  onInsert,
}: {
  projectId: string;
  outline: string[];
  adoptedCount: number;
  disabled?: boolean;
  renderPreview: (doc: { body: string; footnotes: Footnote[] }) => React.ReactNode;
  /** 본문에 넣고 히스토리에 저장. 성공하면 true */
  onInsert: (draft: Ok) => Promise<boolean>;
}) {
  const [chapter, setChapter] = useState(outline[0] ?? "");
  const [items, setItems] = useState<Record<string, Item>>({});
  const [running, setRunning] = useState<"one" | "all" | null>(null);
  const [viewing, setViewing] = useState<Ok | null>(null);
  const [inserting, setInserting] = useState(false);
  const stop = useRef(false);

  const set = (name: string, item: Item) => setItems((prev) => ({ ...prev, [name]: item }));

  async function runOne(name: string) {
    set(name, { status: "running" });
    const r = await draftChapterAction(projectId, name);
    set(name, r);
    return r;
  }

  async function one() {
    setRunning("one");
    const r = await runOne(chapter);
    setRunning(null);
    if (r.ok) setViewing(r);
    else if (r.insufficient) toast.warning(`‘${chapter}’ — 채택 자료가 부족해요`, { description: r.reason });
    else toast.error("초안을 받지 못했어요", { description: r.error });
  }

  async function all() {
    setRunning("all");
    stop.current = false;
    let ok = 0;
    let short = 0;
    let cost = 0;
    for (const name of outline) {
      if (stop.current) break;
      const r = await runOne(name);
      if ("costUsd" in r) cost += r.costUsd;
      if (r.ok) ok++;
      else if (r.insufficient) short++;
      else {
        toast.error(`‘${name}’ 초안을 받지 못해 멈췄어요`, { description: r.error });
        break;
      }
    }
    setRunning(null);
    toast.success(`전체 장 초안: ${ok}개 받음${short ? ` · 자료 부족 ${short}개` : ""}`, {
      description: `모두 합쳐 ${won(cost)}. 장마다 ‘미리보기’에서 확인하고 본문에 넣어 주세요.`,
    });
  }

  async function insert(d: Ok) {
    setInserting(true);
    const done = await onInsert(d);
    setInserting(false);
    if (done) {
      set(d.chapter, { ...d, inserted: true });
      setViewing(null);
    }
  }

  if (!outline.length)
    return (
      <p className="rounded-md bg-gold/15 px-3 py-2 text-sm">
        연구 설정에 목차가 없어요.{" "}
        <Link href="/research" className="font-medium underline">
          연구 설정
        </Link>
        에서 목차(예: 서론 / … / 결론)를 먼저 적어 주세요.
      </p>
    );

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-gold/50 bg-gold/5 p-3 text-sm">
      <div>
        <p className="inline-flex items-center gap-1.5 font-semibold">
          <Sparkles className="size-4 text-gold" /> 장별 AI 초안
        </p>
        <p className="text-xs text-muted-foreground">
          <b>채택한 자료 {adoptedCount}개</b>만 근거로 쓰고, 문장마다 근거 자료를 각주로 달아요 (참고문헌에도 자동으로
          들어가요). 자료에 없는 내용은 [확인 필요]로 표시해요. Claude Haiku · 한 장에 약 10원, 30초 안팎 (전체 6장이면 약
          60원, 3분).
        </p>
      </div>

      {adoptedCount === 0 ? (
        <p className="rounded-md bg-gold/15 px-3 py-2">
          채택한 자료가 없어요.{" "}
          <Link href="/sources" className="font-medium underline">
            자료 관리
          </Link>
          에서 쓸 자료를 ‘채택’해 주세요.
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <select value={chapter} onChange={(e) => setChapter(e.target.value)} className={selectClass} aria-label="초안을 받을 장">
              {outline.map((o, i) => (
                <option key={o} value={o}>
                  {i + 1}. {o}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={one} disabled={!!running || disabled}>
              {running === "one" ? <Loader2 className="animate-spin" /> : <Sparkles />}
              이 장 초안 받기
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={all} disabled={!!running || disabled}>
              {running === "all" ? <Loader2 className="animate-spin" /> : <Layers />}
              전체 장 차례로 쓰기 ({outline.length}장)
            </Button>
            {running === "all" && (
              <Button size="sm" variant="ghost" onClick={() => (stop.current = true)}>
                멈추기
              </Button>
            )}
          </div>
        </>
      )}

      {Object.keys(items).length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {outline
            .filter((o) => items[o])
            .map((o) => {
              const it = items[o];
              return (
                <li key={o} className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate font-medium">{o}</span>
                  {"status" in it ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" /> 쓰는 중…
                    </span>
                  ) : it.ok ? (
                    <>
                      <span className={cn("text-xs", it.inserted ? "text-success" : "text-muted-foreground")}>
                        {it.inserted ? (
                          <span className="inline-flex items-center gap-1">
                            <CircleCheck className="size-3.5" /> 본문에 넣음
                          </span>
                        ) : (
                          `각주 ${it.footnotes.length}개 · ${won(it.costUsd)}`
                        )}
                      </span>
                      <Button size="xs" variant="outline" onClick={() => setViewing(it)}>
                        <Eye /> 미리보기
                      </Button>
                    </>
                  ) : it.insufficient ? (
                    <span className="inline-flex items-center gap-1 text-xs" title={it.reason}>
                      <CircleAlert className="size-3.5 text-gold" /> 채택 자료가 부족해요
                    </span>
                  ) : (
                    <span className="text-xs text-destructive" title={it.error}>
                      실패
                    </span>
                  )}
                </li>
              );
            })}
        </ul>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && !inserting && setViewing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>AI 초안 미리보기 · {viewing.chapter}</DialogTitle>
                <DialogDescription>
                  각주 {viewing.footnotes.length}개 · 근거 자료 {viewing.used.length}개 · [확인 필요] {viewing.needCheck}곳 ·{" "}
                  {won(viewing.costUsd)} ({viewing.tokens.input.toLocaleString()} + {viewing.tokens.output.toLocaleString()} 토큰).
                  아직 본문에 들어가지 않았어요.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border bg-card p-4">{renderPreview({ body: viewing.body, footnotes: viewing.footnotes })}</div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">근거로 쓴 채택 자료 {viewing.used.length}개</summary>
                <ul className="mt-1 list-disc pl-5">
                  {viewing.used.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </details>
              <DialogFooter>
                <Button variant="outline" onClick={() => setViewing(null)} disabled={inserting}>
                  닫기
                </Button>
                <Button onClick={() => insert(viewing)} disabled={inserting || "inserted" in viewing}>
                  {inserting ? <Loader2 className="animate-spin" /> : <CircleCheck />}
                  본문에 넣기 (히스토리에 저장)
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
