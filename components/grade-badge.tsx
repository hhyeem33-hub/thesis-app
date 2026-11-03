import { cn } from "@/lib/utils";

/** 논문 관련도 1~5등급 표시. 4~5등급(핵심 자료)은 진하게 */
export function GradeBadge({ grade, className }: { grade: number | null | undefined; className?: string }) {
  if (!grade)
    return (
      <span className={cn("rounded-md border border-dashed px-1.5 py-0.5 text-xs text-muted-foreground", className)}>
        미분류
      </span>
    );
  return (
    <span
      title={`논문 관련도 ${grade}등급 (5점 만점)`}
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
        grade >= 4
          ? "bg-primary text-primary-foreground"
          : grade === 3
            ? "bg-gold/25 text-foreground"
            : "bg-muted text-muted-foreground",
        className
      )}
    >
      {grade}등급
    </span>
  );
}
