"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 화면을 다시 불러와 상태를 새로 확인 */
export function RefreshButton({ label = "다시 확인" }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      {label}
    </Button>
  );
}
