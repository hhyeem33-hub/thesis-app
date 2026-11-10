"use client";

import { useState } from "react";
import { GRADE_COLOR } from "@/components/grade-badge";
import { cn } from "@/lib/utils";

export type ChartDatum = { label: string; value: number };

/** 베이지 계열 색 8가지 (globals.css 의 --cat-1 ~ --cat-8) */
export const CAT_COLORS = Array.from({ length: 8 }, (_, i) => `var(--cat-${i + 1})`);
const pct = (v: number, total: number) => (total ? Math.round((v / total) * 100) : 0);

/** 관련도 등급 분포: 등급마다 색이 다른 세로 막대 (5 진함 → 1 연함), 올리면 개수·비율 */
export function GradeColumns({ data }: { data: { grade: number; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex h-52 items-end gap-3 border-b px-1 pt-6" role="list" aria-label="관련도 등급 분포">
      {data.map((d, i) => (
        <div
          key={d.grade}
          role="listitem"
          aria-label={`${d.grade}등급 ${d.value}개`}
          className="relative flex h-full flex-1 flex-col items-center justify-end gap-1"
          onMouseEnter={() => setHover(d.grade)}
          onMouseLeave={() => setHover(null)}
        >
          <span className="text-xs font-medium tabular-nums">{d.value}</span>
          <div
            className="grow-y w-full max-w-14 rounded-t-md transition-[opacity,filter] duration-200"
            style={{
              height: `${Math.max(d.value ? 3 : 0, (d.value / max) * 100)}%`,
              background: GRADE_COLOR[d.grade],
              animationDelay: `${i * 70}ms`,
              opacity: hover === null || hover === d.grade ? 1 : 0.45,
            }}
          />
          <span className="absolute -bottom-6 text-xs text-muted-foreground">{d.grade}등급</span>
          {hover === d.grade && (
            <div className="pointer-events-none absolute -top-2 z-10 -translate-y-full rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background shadow">
              {d.grade}등급 · {d.value}개 ({pct(d.value, total)}%)
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** 도넛 차트 + 범례 (가운데에 합계), 조각에 올리면 그 항목이 강조된다 */
export function DonutChart({ data, unit = "개", centerLabel = "합계" }: { data: ChartDatum[]; unit?: string; centerLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const R = 42;
  const C = 2 * Math.PI * R;
  // 조각마다 길이와 시작 위치를 미리 계산
  const lens = data.map((d) => (total ? (d.value / total) * C : 0));
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
  const shown = hover === null ? null : data[hover];

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg viewBox="0 0 120 120" className="size-40 shrink-0 -rotate-90" role="img" aria-label={data.map((d) => `${d.label} ${d.value}${unit}`).join(", ")}>
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--muted)" strokeWidth="16" />
        {data.map((d, i) => {
          const len = lens[i];
          return (
            <circle
              key={d.label}
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={CAT_COLORS[i % CAT_COLORS.length]}
              strokeWidth={hover === i ? 20 : 16}
              strokeDasharray={`${Math.max(0, len - 1)} ${C}`}
              strokeDashoffset={-starts[i]}
              className="cursor-pointer transition-[stroke-width,opacity] duration-200"
              style={{ opacity: hover === null || hover === i ? 1 : 0.4 }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <animate attributeName="stroke-dasharray" from={`0 ${C}`} to={`${Math.max(0, len - 1)} ${C}`} dur="0.9s" fill="freeze" calcMode="spline" keySplines="0.2 0.7 0.2 1" keyTimes="0;1" />
            </circle>
          );
        })}
        <g className="rotate-90" style={{ transformOrigin: "60px 60px" }}>
          <text x="60" y="56" textAnchor="middle" className="fill-foreground text-[18px] font-bold tabular-nums">
            {shown ? shown.value : total}
          </text>
          <text x="60" y="72" textAnchor="middle" className="fill-muted-foreground text-[8px]">
            {shown ? `${pct(shown.value, total)}%` : centerLabel}
          </text>
        </g>
      </svg>
      <ul className="flex w-full flex-col gap-1.5 text-sm">
        {data.map((d, i) => (
          <li
            key={d.label}
            className={cn("flex items-center gap-2 rounded-md px-1.5 py-0.5 transition-colors", hover === i && "bg-secondary")}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate">{d.label}</span>
            <span className="tabular-nums">
              {d.value}
              <span className="text-xs text-muted-foreground">
                {unit} · {pct(d.value, total)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 비율 막대: 한 줄을 항목 비율대로 나눠 색칠 + 범례 */
export function RatioBar({ data, unit = "개" }: { data: ChartDatum[]; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const items = data.filter((d) => d.value > 0);
  const total = items.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="grow-x flex h-5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={items.map((d) => `${d.label} ${pct(d.value, total)}%`).join(", ")}>
        {items.map((d, i) => (
          <div
            key={d.label}
            className="h-full transition-opacity duration-200 first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(d.value / total) * 100}%`,
              background: CAT_COLORS[i % CAT_COLORS.length],
              opacity: hover === null || hover === i ? 1 : 0.4,
            }}
            title={`${d.label} ${d.value}${unit} (${pct(d.value, total)}%)`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {items.map((d, i) => (
          <li
            key={d.label}
            className={cn("flex items-center gap-2 rounded-md px-1.5 py-0.5 transition-colors", hover === i && "bg-secondary")}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate">{d.label}</span>
            <span className="font-medium tabular-nums">{pct(d.value, total)}%</span>
          </li>
        ))}
      </ul>
      {!items.length && <p className="text-sm text-muted-foreground">아직 자료가 없어요.</p>}
    </div>
  );
}
