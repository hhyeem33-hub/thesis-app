"use client";

import { useState } from "react";
import Link from "next/link";
import { GradeBadge } from "@/components/grade-badge";
import { cn } from "@/lib/utils";

export type TimelineItem = {
  id: string;
  title: string;
  year: string;
  authors: string;
  relevance: number;
  status: string | null;
  category: string;
};

/** 발행 연도별 세로 막대. 막대를 누르면 그 해 자료 목록 */
export function TimelineChart({ items, unknown }: { items: TimelineItem[]; unknown: number }) {
  const years = [...new Set(items.map((i) => i.year))].sort();
  // 빈 해도 칸을 두어 시간 흐름이 보이게 (최대 40년)
  const first = Number(years[0]);
  const last = Number(years.at(-1));
  const span = years.length && last - first < 40 ? Array.from({ length: last - first + 1 }, (_, i) => String(first + i)) : years;
  const count = new Map(span.map((y) => [y, items.filter((i) => i.year === y).length]));
  const max = Math.max(1, ...count.values());
  const [picked, setPicked] = useState<string | null>(years.at(-1) ?? null);
  const list = items.filter((i) => i.year === picked).sort((a, b) => b.relevance - a.relevance);

  if (!items.length)
    return (
      <p className="text-sm text-muted-foreground">
        발행 연도가 적힌 자료가 아직 없어요. 자료 상세의 ‘서지 정보’에서 연도를 적거나, KCI 검색으로 논문을 가져오면 생겨요.
      </p>
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-x-auto">
        <div className="flex h-64 min-w-fit items-end gap-1.5 border-b px-1 pt-9" role="group" aria-label="발행 연도별 자료 수">
          {span.map((y, i) => {
            const n = count.get(y) ?? 0;
            return (
              <button
                key={y}
                type="button"
                disabled={!n}
                onClick={() => setPicked(y)}
                aria-label={`${y}년 ${n}개`}
                aria-pressed={picked === y}
                title={`${y}년 · ${n}개`}
                className="group relative flex h-full w-9 flex-col items-center justify-end gap-1 disabled:cursor-default"
              >
                {n > 0 && (
                  <span className={cn("text-xs tabular-nums", picked === y ? "font-semibold text-foreground" : "text-muted-foreground")}>{n}</span>
                )}
                <span
                  className={cn(
                    "grow-y w-6 rounded-t-md transition-[filter,transform,box-shadow] duration-200 group-hover:brightness-110 group-hover:-translate-y-0.5",
                    picked === y && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-card",
                    !n && "bg-transparent"
                  )}
                  style={{
                    height: n ? `${Math.max(4, (n / max) * 100)}%` : 0,
                    // 자료가 많은 해일수록 진한 색 (등급 색과 같은 베이지·브라운 계열)
                    background: n ? `var(--grade-${Math.min(5, 1 + Math.ceil((n / max) * 4))})` : undefined,
                    animationDelay: `${Math.min(i, 30) * 25}ms`,
                  }}
                />
                {n > 0 && (
                  <span className="pointer-events-none absolute -top-8 z-10 rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background opacity-0 shadow transition-opacity group-hover:opacity-100">
                    {y}년 · {n}개
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex min-w-fit gap-1.5 px-1 pt-1">
          {span.map((y) => (
            <span
              key={y}
              className={cn("w-9 text-center text-[11px] tabular-nums", picked === y ? "font-semibold text-foreground" : "text-muted-foreground")}
            >
              {span.length > 12 ? `’${y.slice(2)}` : y}
            </span>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        연도가 적힌 자료 {items.length}개 · 연도 미상 {unknown}개 (자료 상세의 ‘서지 정보’에서 연도를 채우면 여기에 나타나요)
      </p>

      {picked && (
        <section className="flex flex-col gap-2">
          <h3 className="font-heading text-lg font-semibold">
            {picked}년 자료 <span className="text-sm font-normal text-muted-foreground">{list.length}개 · 관련도 높은 순</span>
          </h3>
          <ul className="flex flex-col divide-y rounded-xl border">
            {list.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <GradeBadge grade={i.relevance} />
                <div className="min-w-0 flex-1">
                  <Link href={`/sources/${i.id}`} className="font-medium hover:underline">
                    {i.category && (
                      <span className="mr-1.5 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">{i.category}</span>
                    )}
                    {i.title}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">{i.authors || "저자 미상"}</p>
                </div>
                {i.status && <span className="shrink-0 text-xs text-muted-foreground">{i.status}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
