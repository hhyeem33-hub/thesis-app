"use client";

import { useState } from "react";

export type BarDatum = { label: string; value: number };

/**
 * 가로 막대그래프 (계열 하나 → 색 하나, 범례 없음).
 * 막대에 올리면 값·비율 풍선이 뜨고, 막대 끝에 값이 적혀 있어 색 없이도 읽을 수 있다.
 */
export function BarChart({
  data,
  unit = "개",
  showPercent = false,
}: {
  data: BarDatum[];
  unit?: string;
  /** 값 옆에 전체 대비 비율(%)도 보여 준다 */
  showPercent?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);

  return (
    <div className="flex flex-col gap-2" role="list">
      {data.map((d, i) => (
        <div
          key={d.label}
          role="listitem"
          aria-label={`${d.label} ${d.value}${unit}${showPercent ? ` (${pct(d.value)}%)` : ""}`}
          className="relative grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 rounded-md py-1 text-sm"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
        >
          <span className="truncate text-muted-foreground">{d.label}</span>
          <div className="h-3 rounded-r bg-muted/60">
            <div
              className="h-full rounded-r bg-primary transition-[width,opacity] duration-300"
              style={{
                width: `${(d.value / max) * 100}%`,
                minWidth: d.value ? 4 : 0,
                opacity: hover === null || hover === i ? 1 : 0.45,
              }}
            />
          </div>
          <span className="min-w-12 text-right tabular-nums">
            {d.value}
            <span className="text-xs text-muted-foreground">
              {unit}
              {showPercent && ` · ${pct(d.value)}%`}
            </span>
          </span>
          {hover === i && (
            <div className="pointer-events-none absolute -top-8 left-24 z-10 rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background shadow">
              {d.label}: {d.value}
              {unit} ({pct(d.value)}%)
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
