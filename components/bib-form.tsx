"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { updateSourceBib } from "@/app/write-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emptyBib, formatReference, NEED } from "@/lib/bib";
import type { Bib, Source } from "@/lib/types";
import { cn } from "@/lib/utils";

const KINDS: { id: Bib["kind"]; label: string }[] = [
  { id: "article", label: "학술 논문" },
  { id: "book", label: "책" },
  { id: "web", label: "웹 자료" },
];

/** 자료 상세의 서지 정보 편집 (참고문헌·각주에 쓰임) */
export function BibForm({ source }: { source: Pick<Source, "id" | "title" | "origin" | "type"> & { bib?: Bib | null } }) {
  const [bib, setBib] = useState<Bib>(source.bib ?? emptyBib(source.type === "pdf" ? "article" : "web"));
  const [pending, startTransition] = useTransition();
  const set = (k: keyof Bib) => (e: React.ChangeEvent<HTMLInputElement>) => setBib((b) => ({ ...b, [k]: e.target.value }));
  const preview = formatReference({ ...source, bib });

  const field = (k: keyof Bib, label: string, placeholder: string, className?: string) => (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label htmlFor={`bib-${k}`} className="text-xs">
        {label}
      </Label>
      <Input id={`bib-${k}`} value={bib[k]} onChange={set(k)} placeholder={placeholder} className="h-8 text-sm" />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>서지 정보</CardTitle>
        <CardDescription>
          글쓰기에서 이 자료로 각주를 달면 참고문헌이 이 정보로 만들어져요. 비워 둔 칸은 {NEED}로 표시돼요.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="자료 종류">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={bib.kind === k.id}
              onClick={() => setBib((b) => ({ ...b, kind: k.id }))}
              className={cn(
                "rounded-lg border px-3 py-1 text-sm",
                bib.kind === k.id ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {field("authors", "저자 (쉼표로 구분)", "예: 홍길동, 김철수", "sm:col-span-2")}
          {field("year", "연도", "예: 2024")}
          {bib.kind === "article" && (
            <>
              {field("journal", "학술지명", "예: 소비자학연구", "sm:col-span-3")}
              {field("volume", "권", "예: 35")}
              {field("issue", "호", "예: 2")}
              {field("pages", "쪽", "예: 55-77")}
            </>
          )}
          {bib.kind === "book" && (
            <>
              {field("place", "출판지", "예: 서울")}
              {field("publisher", "출판사", "예: 한국외국어대학교출판부", "sm:col-span-2")}
            </>
          )}
          {bib.kind === "web" && field("publisher", "사이트·기관명", "예: 한국관광공사", "sm:col-span-3")}
          {field("category", "분류 표시 (선택)", "예: 선행연구", "sm:col-span-3")}
        </div>
        <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">
          <span className="text-xs text-muted-foreground">참고문헌 미리보기 · </span>
          {preview}
        </p>
        <Button
          className="w-fit"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await updateSourceBib(source.id, bib);
              if (r.ok) toast.success("서지 정보를 저장했어요");
              else toast.error("저장하지 못했어요", { description: r.error });
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          서지 정보 저장
        </Button>
      </CardContent>
    </Card>
  );
}
