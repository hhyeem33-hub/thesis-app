"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center">
      <TriangleAlert className="size-10 text-destructive" />
      <p className="text-lg font-medium">화면을 불러오지 못했어요</p>
      <p className="max-w-md text-sm text-muted-foreground">
        잠시 후 다시 시도해 보세요. 계속 안 되면 설정 화면에서 옵시디언·드라이브 경로가
        맞는지 확인하고, 구글 드라이브 앱이 켜져 있는지 확인해 주세요.
      </p>
      {error.message && (
        <p className="max-w-md text-xs text-muted-foreground">오류 내용: {error.message}</p>
      )}
      <Button onClick={() => retry()}>다시 시도</Button>
    </div>
  );
}
