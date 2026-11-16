"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardPaste, Loader2, Subtitles } from "lucide-react";
import { toast } from "sonner";
import { saveTranscript } from "@/app/source-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GUEST_NOTICE, useGuest } from "@/components/use-guest";
import { cn } from "@/lib/utils";

/** 유튜브 자료: 스크립트(자막) 붙여넣기 → 저장 → AI 판단 자동으로 다시 */
export function TranscriptCard({
  sourceId,
  hasTranscript,
  url,
}: {
  sourceId: string;
  /** 이미 자막이 들어 있는지 (없으면 금색으로 눈에 띄게) */
  hasTranscript: boolean;
  url: string;
}) {
  const router = useRouter();
  const guest = useGuest();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(!hasTranscript);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const r = await saveTranscript(sourceId, text);
      if (!r.ok) {
        toast.error("스크립트를 저장하지 못했어요", { description: r.error });
        return;
      }
      setText("");
      setOpen(false);
      if (r.classifyError)
        toast.warning(`스크립트 ${r.chars?.toLocaleString()}자를 저장했어요`, {
          description: `AI 판단은 다시 하지 못했어요: ${r.classifyError}`,
        });
      else
        toast.success(`스크립트 ${r.chars?.toLocaleString()}자를 저장하고 AI가 다시 판단했어요`, {
          description: `관련도 ${r.relevance}등급`,
        });
      router.refresh();
    });
  }

  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4",
        hasTranscript ? "bg-card" : "border-gold bg-gold/10 ring-2 ring-gold/30"
      )}
      aria-label="유튜브 스크립트 붙여넣기"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Subtitles className="size-5 text-primary" />
        <h2 className="font-semibold">유튜브 스크립트 붙여넣기</h2>
        {hasTranscript ? (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="size-3.5" /> 자막이 들어 있어요
          </span>
        ) : (
          <span className="rounded bg-gold/30 px-1.5 py-0.5 text-xs font-medium">자막이 없어요 · AI가 영상 설명만 보고 판단했어요</span>
        )}
        {hasTranscript && !open && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setOpen(true)}>
            <ClipboardPaste /> 다시 붙여넣기
          </Button>
        )}
      </div>

      {open && (
        <>
          <ol className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-3">
            <li>
              <b className="text-foreground">1.</b>{" "}
              <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
                유튜브에서 영상 열기
              </a>
            </li>
            <li>
              <b className="text-foreground">2.</b> 영상 아래 설명의 <b>…더보기</b> → <b>스크립트 표시</b>
            </li>
            <li>
              <b className="text-foreground">3.</b> 오른쪽 스크립트를 끌어서 모두 선택 → 복사 → 아래에 붙여넣기
            </li>
          </ol>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            disabled={pending || guest}
            placeholder={"0:00\n안녕하세요 오늘은…\n0:05\n…\n(시간 표시는 저장할 때 자동으로 지워져요)"}
            className="bg-background font-mono text-xs"
            aria-label="유튜브 스크립트"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={pending || guest || text.trim().length < 20} title={guest ? GUEST_NOTICE : undefined}>
              {pending ? <Loader2 className="animate-spin" /> : <ClipboardPaste />}
              {pending ? "저장하고 AI가 다시 판단하는 중…" : "저장하고 AI 판단 다시 하기"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {text.trim() ? `${text.trim().length.toLocaleString()}자` : "붙여 넣은 내용이 자료 내용의 ‘자막’ 칸으로 들어가요."}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
