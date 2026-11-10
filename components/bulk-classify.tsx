"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";
import { classifySourceAction, classifyTargets } from "@/app/source-actions";
import { Button } from "@/components/ui/button";

/** 동시에 몇 개씩 AI 판단할지 (너무 많으면 요청 제한에 걸림) */
const PARALLEL = 4;

/** 전체 자료 AI 판단 (제목 + 앞부분만 써서 비용 절약, 진행률 표시) */
export function BulkClassify({
  hasKey,
  pendingCount,
  total,
  basisProjectId,
  basisName,
  kciPendingCount = 0,
}: {
  hasKey: boolean;
  pendingCount: number;
  total: number;
  /** 이 프로젝트의 연구 설정 기준으로 (없으면 자료마다 자기 프로젝트) */
  basisProjectId?: string | null;
  basisName?: string;
  /** 아직 판단 안 한 KCI 선행연구 수 (있으면 'KCI 선행연구만' 버튼) */
  kciPendingCount?: number;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number; lastError?: string } | null>(null);
  const stopRef = useRef(false);
  const [running, setRunning] = useState(false);
  const stop = () => {
    stopRef.current = true;
  };

  async function run(all: boolean, category?: string) {
    if (all && !window.confirm(`자료 ${total}개를 모두 AI가 다시 판단할까요? (연구자 확정 분류는 그대로 둬요)`)) return;
    stopRef.current = false;
    const ids = await classifyTargets(all, category);
    if (!ids.length) {
      toast.info("판단할 자료가 없어요");
      return;
    }
    const state = { done: 0, total: ids.length, failed: 0, lastError: undefined as string | undefined };
    setProgress({ ...state });
    setRunning(true);
    let next = 0;
    const worker = async () => {
      while (next < ids.length && !stopRef.current) {
        const id = ids[next++];
        const r = await classifySourceAction(id, basisProjectId);
        state.done++;
        if (!r.ok) {
          state.failed++;
          state.lastError = r.error;
          // 키가 없거나 틀리면 더 해도 소용없으니 멈춘다
          if (/API 키/.test(r.error)) stopRef.current = true;
        }
        setProgress({ ...state });
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    const stopped = stopRef.current;
    setRunning(false);
    setProgress({ ...state });
    router.refresh();
    if (state.failed)
      toast.error(`${state.done - state.failed}개 판단, ${state.failed}개 실패`, { description: state.lastError });
    else toast.success(`${state.done}개를 AI가 판단했어요${stopped ? " (중간에 멈춤)" : ""}`);
  }

  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <p className="text-sm">
          <b>AI 판단</b> — {basisName ? <>‘{basisName}’ 연구 설정</> : "연구 설정"}을 기준으로 관련도·토픽·키워드·근거·신뢰도를 매겨요. 아직 판단 안 한 자료{" "}
          <b className="tabular-nums">{pendingCount}</b>개
        </p>
        <div className="ml-auto flex gap-1.5">
          {running ? (
            <Button size="sm" variant="outline" onClick={stop}>
              <Square />
              멈추기
            </Button>
          ) : (
            <>
              {kciPendingCount > 0 && (
                <Button size="sm" variant="secondary" disabled={!hasKey} onClick={() => run(false, "KCI 선행연구")}>
                  <Sparkles />
                  KCI 선행연구 {kciPendingCount}개만 판단
                </Button>
              )}
              <Button size="sm" disabled={!hasKey || pendingCount === 0} onClick={() => run(false)}>
                <Sparkles />
                미판단 {pendingCount}개 판단
              </Button>
              <Button size="sm" variant="outline" disabled={!hasKey} onClick={() => run(true)}>
                전체 {total}개 다시 판단
              </Button>
            </>
          )}
        </div>
      </div>
      {!hasKey && (
        <p className="text-xs text-muted-foreground">
          AI를 쓰려면{" "}
          <Link href="/settings" className="underline">
            설정 → AI 연결
          </Link>
          에서 Claude API 키를 넣어 주세요.
        </p>
      )}
      {progress && (
        <div className="flex flex-col gap-1">
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {running && <Loader2 className="mr-1 inline size-3 animate-spin" />}
            {progress.done}/{progress.total} ({pct}%){progress.failed ? ` · 실패 ${progress.failed}개` : ""} · 제목과 앞부분
            2,000자만 보내 비용을 아껴요 (Claude Haiku)
          </p>
        </div>
      )}
    </div>
  );
}
