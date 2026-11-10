import { cn } from "@/lib/utils";

/** 등급별 색: 5 가장 진한 갈색 → 1 가장 옅은 색 (베이지 색 안에서 한 색 계열로) */
export const GRADE_STYLE: Record<number, string> = {
  5: "bg-[var(--grade-5)] text-background shadow-sm",
  4: "bg-[var(--grade-4)] text-background shadow-sm",
  3: "bg-[var(--grade-3)] text-white",
  2: "bg-[var(--grade-2)] text-foreground",
  1: "bg-[var(--grade-1)] text-muted-foreground",
};

/** 차트에서 쓰는 등급 색 (CSS 변수) */
export const GRADE_COLOR: Record<number, string> = {
  5: "var(--grade-5)",
  4: "var(--grade-4)",
  3: "var(--grade-3)",
  2: "var(--grade-2)",
  1: "var(--grade-1)",
};

/** 논문 관련도 1~5등급 표시. 4~5등급(핵심 자료)은 진하게 */
export function GradeBadge({ grade, className }: { grade: number | null | undefined; className?: string }) {
  if (!grade)
    return (
      <span className={cn("rounded-md border border-dashed px-1.5 py-0.5 text-xs text-muted-foreground", className)}>
        AI 미판단
      </span>
    );
  return (
    <span
      title={`논문 관련도 ${grade}등급 (5점 만점)`}
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
        GRADE_STYLE[grade] ?? GRADE_STYLE[1],
        className
      )}
    >
      <span className="mr-1 inline-flex gap-px" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={cn("h-2 w-0.5 rounded-full", i <= grade ? "bg-current" : "bg-current opacity-25")} />
        ))}
      </span>
      {grade}등급
    </span>
  );
}
