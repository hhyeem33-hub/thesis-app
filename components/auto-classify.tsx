"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { classifySourceAction } from "@/app/source-actions";

type Progress = { done: number; total: number; failed: number; lastError?: string; running: boolean };

/** 새로 들어온 자료를 바로 AI 판단 (4개씩 동시에, 진행률 표시) */
export function useAutoClassify() {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);

  const run = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      const s: Progress = { done: 0, total: ids.length, failed: 0, running: true };
      setProgress({ ...s });
      let next = 0;
      let stop = false;
      const worker = async () => {
        while (next < ids.length && !stop) {
          const r = await classifySourceAction(ids[next++]);
          s.done++;
          if (!r.ok) {
            s.failed++;
            s.lastError = r.error;
            if (/API 키/.test(r.error)) stop = true;
          }
          setProgress({ ...s });
        }
      };
      await Promise.all(Array.from({ length: 4 }, worker));
      s.running = false;
      setProgress({ ...s });
      router.refresh();
      if (s.failed) toast.error(`AI 판단 ${s.done - s.failed}개 완료, ${s.failed}개 실패`, { description: s.lastError });
      else toast.success(`새 자료 ${s.done}개를 AI가 판단했어요`, { description: "자료 관리에서 채택·보류·제외를 정해 주세요." });
    },
    [router]
  );

  return { run, progress };
}

export function AutoClassifyProgress({ progress }: { progress: Progress | null }) {
  if (!progress) return null;
  const pct = Math.round((progress.done / progress.total) * 100);
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
      <p className="inline-flex items-center gap-1.5 text-sm">
        {progress.running ? <Loader2 className="size-4 animate-spin" /> : progress.failed ? <Sparkles className="size-4" /> : <CheckCircle2 className="size-4 text-success" />}
        AI 판단 {progress.done}/{progress.total} ({pct}%){progress.failed ? ` · 실패 ${progress.failed}개` : ""}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      {progress.lastError && <p className="text-xs text-destructive">{progress.lastError}</p>}
    </div>
  );
}
