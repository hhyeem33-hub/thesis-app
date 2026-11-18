import Link from "next/link";
import { Logo } from "@/components/logo";

/** 개인정보처리방침·서비스 약관 공용 틀 */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <Link href="/welcome" aria-label="논문작업실 첫 화면">
        <Logo />
      </Link>
      <article className="flex flex-col gap-5 rounded-2xl border bg-card p-6 text-sm leading-relaxed md:p-10 [&_h2]:mt-2 [&_h2]:font-heading [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc">
        <header>
          <h1 className="font-heading text-2xl font-bold">{title}</h1>
          <p className="text-xs text-muted-foreground">시행일 {updated}</p>
        </header>
        {children}
      </article>
    </main>
  );
}
