import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Logo } from "@/components/logo";
import { resolveShare, type PublicItem } from "@/lib/shares";
import { SOURCE_TYPE_LABEL } from "@/lib/types";

// 읽기 전용 공유 화면 (로그인 없이): 공유로 표시된 자료·프로젝트의 제목·출처·서지·AI 요약만

export const metadata: Metadata = { title: "공유 자료 — 논문작업실", robots: { index: false } };

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <Link href="/welcome" aria-label="논문작업실 첫 화면">
        <Logo />
      </Link>
      <Suspense fallback={<div className="h-60 animate-pulse rounded-xl bg-card" />}>
        <ShareContent params={params} />
      </Suspense>
    </main>
  );
}

function Item({ it }: { it: PublicItem }) {
  return (
    <article className="flex flex-col gap-2 rounded-xl border bg-card p-5">
      <p className="text-xs font-medium tracking-wide text-primary">{SOURCE_TYPE_LABEL[it.type]}</p>
      <h2 className="font-heading text-lg font-bold">{it.title}</h2>
      <p className="text-sm">
        <span className="text-muted-foreground">서지 </span>
        {it.reference}
      </p>
      {it.origin && (
        <a href={it.origin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm break-all underline">
          {it.origin} <ExternalLink className="size-3.5 shrink-0" />
        </a>
      )}
      {it.summary && (
        <p className="rounded-lg bg-secondary/60 p-3 text-sm leading-relaxed">
          <span className="font-medium">AI 요약 · </span>
          {it.summary}
        </p>
      )}
    </article>
  );
}

async function ShareContent({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const data = await resolveShare(token).catch(() => null);
  if (!data) notFound();
  const when = new Date(data.sharedAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs text-muted-foreground">읽기 전용 공유 · {when}부터</p>
        <h1 className="font-heading text-2xl font-bold">
          {data.kind === "source" ? "공유된 자료" : `${data.name} · 공유 자료 ${data.items.length}개`}
        </h1>
      </div>
      {data.kind === "source" ? <Item it={data.item} /> : data.items.map((it, i) => <Item key={i} it={it} />)}
      {data.kind === "project" && !data.items.length && <p className="text-sm text-muted-foreground">공유된 자료가 아직 없어요.</p>}
    </div>
  );
}
