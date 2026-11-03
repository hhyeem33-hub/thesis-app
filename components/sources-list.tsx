"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FilePlus2, Library, Search } from "lucide-react";
import { GradeBadge } from "@/components/grade-badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PARA_LABEL, SOURCE_TYPE_LABEL, type Source } from "@/lib/types";

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeZone: "Asia/Seoul",
});

/** 목록에 필요한 것만 (본문 전체는 상세 화면에서) */
export type SourceListItem = Omit<Source, "content"> & { projectName: string | null; excerpt: string };

export function SourcesList({ sources }: { sources: SourceListItem[] }) {
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter((s) =>
      [s.title, s.origin, s.excerpt, s.projectName ?? "", s.classification?.summary ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [query, sources]);

  if (sources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center text-muted-foreground">
        <Library className="size-10" />
        <p className="font-medium">아직 모은 자료가 없어요.</p>
        <Link href="/sources/new" className={buttonVariants({ size: "sm" })}>
          <FilePlus2 />
          첫 자료 수집하기
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제목·출처·내용·요약으로 검색"
          className="pl-8"
          aria-label="자료 검색"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {query ? `${shown.length}개 찾음 (전체 ${sources.length}개)` : `전체 ${sources.length}개`}
      </p>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">제목</TableHead>
              <TableHead>유형</TableHead>
              <TableHead>분류</TableHead>
              <TableHead>관련도</TableHead>
              <TableHead>프로젝트</TableHead>
              <TableHead className="pr-4">수정일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((s) => (
              <TableRow key={s.id} className="cursor-pointer">
                <TableCell className="max-w-80 pl-4">
                  <Link href={`/sources/${s.id}`} className="font-medium hover:underline">
                    {s.title}
                  </Link>
                  <div className="truncate text-xs text-muted-foreground">
                    {s.origin || <span className="text-destructive/80">출처 미확인</span>}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{SOURCE_TYPE_LABEL[s.type]}</TableCell>
                <TableCell className="text-muted-foreground">
                  {s.classification ? PARA_LABEL[s.classification.para] : "—"}
                </TableCell>
                <TableCell>
                  <GradeBadge grade={s.classification?.relevance} />
                </TableCell>
                <TableCell className="max-w-40 truncate text-muted-foreground">
                  {s.projectName ?? "—"}
                </TableCell>
                <TableCell className="pr-4 text-muted-foreground">
                  {dateFormat.format(new Date(s.updatedAt))}
                </TableCell>
              </TableRow>
            ))}
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  &lsquo;{query}&rsquo;와(과) 맞는 자료가 없어요.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
