"use client";

import { useTransition } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { openOriginalPdf } from "@/app/source-actions";
import { Button } from "@/components/ui/button";

/** 자료 상세 → 출처 카드: 연결된 원문 PDF 를 연다 (내 컴퓨터 전용) */
export function OriginalPdfButton({ sourceId, file }: { sourceId: string; file: string }) {
  const [pending, start] = useTransition();
  const name = file.split(/[\\/]/).pop();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await openOriginalPdf(sourceId);
            if (!r.ok) toast.error(r.error);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <FileText />}
        원문 PDF 열기
      </Button>
      <span className="break-all text-xs text-muted-foreground">{name}</span>
    </div>
  );
}
