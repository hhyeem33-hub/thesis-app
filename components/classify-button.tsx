"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { classifyPending, classifySourceAction } from "@/app/source-actions";
import { Button } from "@/components/ui/button";

function keyHelp(error: string) {
  return error.includes("API 키") ? (
    <>
      {error} <Link href="/settings" className="underline">설정으로 가기</Link>
    </>
  ) : (
    error
  );
}

/** 자료 하나 분류 (다시 분류) */
export function ClassifyButton({
  sourceId,
  again = false,
  size = "default",
}: {
  sourceId: string;
  again?: boolean;
  size?: "default" | "sm" | "xs";
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size={size}
      variant={again ? "outline" : "default"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await classifySourceAction(sourceId);
          if (r.ok) toast.success("AI 분류를 마쳤어요");
          else toast.error("AI 분류에 실패했어요", { description: keyHelp(r.error) });
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {pending ? "분류 중…" : again ? "다시 분류" : "AI 분류"}
    </Button>
  );
}

/** 아직 분류하지 않은 자료를 한꺼번에 분류 */
export function ClassifyAllButton({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending || count === 0}
      onClick={() =>
        startTransition(async () => {
          const r = await classifyPending();
          if (!r.ok) {
            toast.error("AI 분류가 중간에 멈췄어요", { description: keyHelp(r.error) });
            return;
          }
          toast.success(`${r.done}개를 분류했어요`, {
            description: r.left ? `남은 ${r.left}개는 한 번 더 눌러 주세요.` : "모두 분류했어요.",
          });
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {pending ? "분류 중… (자료 1개에 몇 초)" : `미분류 ${count}개 모두 분류`}
    </Button>
  );
}
