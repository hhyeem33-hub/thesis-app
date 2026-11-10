import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, Target } from "lucide-react";
import { ONLINE } from "@/lib/online";
import { getProjectResearch } from "@/lib/research";
import { getProjects } from "@/lib/store";

// 온라인에서 처음 로그인한 사람에게: 연구 설정이 하나도 없으면 대시보드 위에 안내를 띄운다
// (내 컴퓨터는 지금 화면 그대로 — 안내를 띄우지 않음)
export async function ResearchFirstBanner() {
  await connection();
  if (!ONLINE) return null;
  let first: string | null = null;
  try {
    const projects = await getProjects();
    for (const p of projects) {
      const r = await getProjectResearch(p.id);
      if (r.purpose || r.keywords.length || r.questions.length || r.outline.length) return null;
    }
    first = projects.at(-1)?.id ?? projects[0]?.id ?? null;
  } catch {
    return null;
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gold/50 bg-gold/10 p-4 sm:flex-row sm:items-center">
      <Target className="size-6 shrink-0 text-gold" />
      <div className="flex-1">
        <p className="font-medium">먼저 연구 설정을 채워 주세요</p>
        <p className="text-sm text-muted-foreground">
          연구 목적·핵심 키워드·연구 질문·목차를 적으면, 자료를 모을 때 AI가 그 기준으로 관련도와 들어갈 목차를 판단해요.
        </p>
      </div>
      <Link
        href={first ? `/research?project=${first}` : "/research"}
        className="inline-flex h-9 items-center gap-1 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        연구 설정으로 <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
