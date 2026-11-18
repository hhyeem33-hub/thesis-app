import Link from "next/link";

/** 모든 화면 맨 아래 작은 글씨 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 px-4 py-4 text-center text-[11px] leading-relaxed text-muted-foreground">
      <p>© 2026 박예은 · 한국외국어대학교 대학원 한중문화학과 석사과정 · 논문작업실</p>
      <p className="mt-0.5">
        <Link href="/privacy" className="underline-offset-2 hover:underline">
          개인정보처리방침
        </Link>
        <span aria-hidden> · </span>
        <Link href="/terms" className="underline-offset-2 hover:underline">
          서비스 약관
        </Link>
      </p>
    </footer>
  );
}
