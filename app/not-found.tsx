import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center">
      <SearchX className="size-10 text-muted-foreground" />
      <p className="text-lg font-medium">없는 화면이에요</p>
      <p className="text-sm text-muted-foreground">
        왼쪽 메뉴에서 홈, 프로젝트, 설정 중 하나를 골라 주세요.
      </p>
      <Link href="/" className={buttonVariants()}>
        홈으로 가기
      </Link>
    </div>
  );
}
