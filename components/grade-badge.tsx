import { cn } from "@/lib/utils";

/** 등급별 색: 5 가장 진한 갈색 → 1 가장 옅은 색 (베이지 색 안에서 한 색 계열로) */
export const GRADE_STYLE: Record<number, string> = {
  5: "bg-foreground text-background",
  4: "bg-primary text-primary-foreground",
  3: "bg-gold/35 text-foreground",
  2: "bg-muted text-foreground",
  1: "border bg-background text-muted-foreground",
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
      {grade}등급
    </span>
  );
}
