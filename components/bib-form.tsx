"use client";

import { useState, useTransition } from "react";
import { FileSearch, Loader2, Save, TriangleAlert } from "lucide-react";
import { suggestBibFromPdf } from "@/app/source-actions";
import { toast } from "sonner";
import { updateSourceBib } from "@/app/write-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emptyBib, formatReference, NEED } from "@/lib/bib";
import { guessMaterial, MATERIAL_TYPES } from "@/lib/material-type";
import type { Bib, Source } from "@/lib/types";
import { cn } from "@/lib/utils";
import { missingBib } from "@/lib/writing";

const KINDS: { id: Bib["kind"]; label: string }[] = [
  { id: "article", label: "학술 논문" },
  { id: "book", label: "책" },
  { id: "web", label: "웹 자료" },
];

const LABEL: Partial<Record<keyof Bib, string>> = {
  authors: "저자",
  year: "연도",
  journal: "학술지",
  volume: "권",
  issue: "호",
  pages: "쪽",
  publisher: "발행 기관",
  doi: "DOI",
};

/** 자료 상세의 서지 정보 편집 (참고문헌·각주에 쓰임) */
export function BibForm({ source }: { source: Pick<Source, "id" | "title" | "origin" | "type"> & { bib?: Bib | null } }) {
  const [bib, setBib] = useState<Bib>(source.bib ?? emptyBib(source.type === "pdf" ? "article" : "web"));
  const [pending, startTransition] = useTransition();
  const [reading, startReading] = useTransition();
  /** AI 가 PDF 첫 쪽에서 채운 칸 (저장 전 확인용으로 금색 테두리) */
  const [filled, setFilled] = useState<{ keys: (keyof Bib)[]; from: string; differ: string[] } | null>(null);
  const [savedBib, setSavedBib] = useState<Bib | null | undefined>(source.bib);
  const missing = missingBib({ type: source.type, bib: savedBib });
  const canReadPdf = source.type === "pdf" || !!source.bib?.originalPdf;
  const set = (k: keyof Bib) => (e: React.ChangeEvent<HTMLInputElement>) => setBib((b) => ({ ...b, [k]: e.target.value }));

  /** PDF 첫 쪽 → AI 서지 제안 → 빈 칸만 채움 (이미 쓴 칸은 그대로 두고 다른 값만 알려 줌). 저장은 사람이 */
  const readPdf = () =>
    startReading(async () => {
      const r = await suggestBibFromPdf(source.id);
      if (!r.ok || !r.bib) {
        toast.error("PDF 에서 서지 정보를 읽지 못했어요", { description: r.ok ? undefined : r.error });
        return;
      }
      const s = r.bib;
      const keys: (keyof Bib)[] = [];
      const differ: string[] = [];
      const next: Bib = { ...bib };
      const empty = !bib.authors && !bib.year && !bib.journal && !bib.publisher;
      if (empty && s.kind !== bib.kind) next.kind = s.kind;
      for (const k of ["authors", "year", "journal", "volume", "issue", "pages", "publisher", "doi"] as const) {
        const v = s[k].trim();
        if (!v) continue;
        if (!bib[k]?.trim()) {
          next[k] = v;
          keys.push(k);
        } else if (bib[k].trim() !== v) differ.push(`${LABEL[k]}: ${v}`);
      }
      setBib(next);
      setFilled({ keys, from: r.from ?? "PDF", differ });
      if (keys.length) toast.success(`${keys.length}칸을 채웠어요`, { description: "확인하고 ‘서지 정보 저장’을 눌러 주세요." });
      else toast.info("새로 채울 빈칸이 없어요", { description: differ.length ? "PDF 와 다른 값은 아래에 적어 뒀어요." : undefined });
    });
  const preview = formatReference({ ...source, bib });
  const guessed = guessMaterial({ ...source, bib }).type;

  const field = (k: keyof Bib, label: string, placeholder: string, className?: string) => (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label htmlFor={`bib-${k}`} className="text-xs">
        {label}
      </Label>
      <Input
        id={`bib-${k}`}
        value={bib[k] ?? ""}
        onChange={set(k)}
        placeholder={placeholder}
        className={cn("h-8 text-sm", filled?.keys.includes(k) && "border-gold ring-2 ring-gold/30")}
      />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          서지 정보
          {missing.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-xs font-medium">
              <TriangleAlert className="size-3" />
              서지 정보 보완 필요 · {missing.join("·")}
            </span>
          )}
        </CardTitle>
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
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">
            자료 유형{" "}
            {!bib.materialType && (
              <span className="font-normal text-muted-foreground">
                · 아직 안 정함{guessed ? ` (짐작: ${guessed})` : " (짐작도 어려워요 — 골라 주세요)"}
              </span>
            )}
          </span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="자료 유형">
            {MATERIAL_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={bib.materialType === t}
                onClick={() => setBib((b) => ({ ...b, materialType: b.materialType === t ? "" : t }))}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs",
                  bib.materialType === t
                    ? "border-gold bg-gold/20 font-medium"
                    : !bib.materialType && guessed === t
                      ? "border-dashed border-gold"
                      : "border-input hover:bg-accent"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        {canReadPdf && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-dashed p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" disabled={reading} onClick={readPdf}>
                {reading ? <Loader2 className="animate-spin" /> : <FileSearch />}
                PDF 첫 쪽으로 서지 정보 채우기
              </Button>
              <span className="text-xs text-muted-foreground">AI 가 빈칸만 채워요. 확인한 뒤 저장해야 반영돼요.</span>
            </div>
            {filled && (
              <p className="text-xs text-muted-foreground">
                {filled.from}에서 읽음 · 채운 칸 {filled.keys.length ? filled.keys.map((k) => LABEL[k]).join(", ") : "없음"}
                {filled.differ.length > 0 && <> · 이미 쓴 값과 다른 것: {filled.differ.join(" / ")}</>}
              </p>
            )}
          </div>
        )}
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
              if (r.ok) {
                toast.success("서지 정보를 저장했어요");
                setSavedBib(bib);
                setFilled(null);
              }
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
