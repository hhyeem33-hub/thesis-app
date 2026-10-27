import { Skeleton } from "@/components/ui/skeleton";

/** 프로젝트 화면을 불러오는 동안 보여줄 뼈대 */
export function ProjectsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-label="불러오는 중">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="flex flex-col gap-3 rounded-xl border p-4">
        <Skeleton className="h-5 w-full" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}

/** 설정 화면 카드 두 개의 뼈대 */
export function SettingsSkeleton() {
  return (
    <div className="flex max-w-2xl flex-col gap-4" aria-label="불러오는 중">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3 rounded-xl border p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
      <Skeleton className="h-8 w-16" />
    </div>
  );
}
