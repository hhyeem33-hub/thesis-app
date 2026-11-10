import { Suspense } from "react";
import type { Metadata } from "next";
import {
  ArrowRight,
  BookMarked,
  FileOutput,
  FileText,
  Library,
  ListChecks,
  NotebookPen,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Target,
  UserCheck,
} from "lucide-react";
import { LoginPanel } from "@/components/login-panel";
import { Logo, LogoMark } from "@/components/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// 로그인 전 둘러보기 화면 (온라인). 사이드바 없이 이 화면만 보인다.

export const metadata: Metadata = {
  title: "논문작업실 — 자료 수집부터 논문 원고까지",
  description: "연구 설정, 자료 수집, AI 판단, 글쓰기·각주, 참고문헌, HWPX까지 한 흐름으로",
};

const flow = [
  { icon: Target, title: "연구 설정", body: "연구 목적·키워드·관점·질문·목차를 적어요. 모든 판단의 기준이 돼요." },
  { icon: Library, title: "자료 수집", body: "KCI 검색, 파일·엑셀 목록, 직접 입력으로 자료를 모아요." },
  { icon: Sparkles, title: "AI 판단", body: "관련도 1~5등급, 들어갈 목차, 근거, 신뢰도를 매겨요." },
  { icon: UserCheck, title: "연구자 확정", body: "AI 제안을 보고 채택·보류·제외를 직접 정해요." },
  { icon: NotebookPen, title: "글쓰기·각주", body: "장·절로 원고를 쓰고 자료를 골라 각주를 달아요." },
  { icon: BookMarked, title: "참고문헌", body: "각주에 쓴 자료가 외대 양식 참고문헌으로 자동 정리돼요." },
  { icon: FileOutput, title: "HWPX", body: "한국외대 학위논문 양식의 한글 파일로 내보내요." },
];

const features = [
  { icon: ScanSearch, title: "KCI 선행연구 검색", body: "검색 결과를 골라 한꺼번에 저장하면 서지 정보와 초록이 자동으로 들어가요." },
  { icon: Sparkles, title: "AI 관련도 판단", body: "내 연구 설정을 기준으로 자료마다 등급과 근거를 붙여요. 키가 없으면 규칙 기반으로 판단해요." },
  { icon: ListChecks, title: "연구자 확정과 기록", body: "AI가 제안해도 최종 결정은 연구자가 해요. 바꾼 내용은 기록으로 남아요." },
  { icon: FileText, title: "버전 기록", body: "원고를 저장할 때마다 버전이 남아서 언제든 예전 내용으로 되돌릴 수 있어요." },
  { icon: ShieldCheck, title: "내 자료는 나만", body: "계정마다 자료가 따로 저장되고, 다른 사람은 볼 수 없어요." },
  { icon: BookMarked, title: "외대 논문 양식", body: "국문 「논문」 『학술지·책』 표기와 국문→중문→영문 순서를 지켜요." },
];

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium tracking-[0.2em] text-gold">{eyebrow}</span>
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      <span className="h-0.5 w-10 rounded-full bg-gold" />
    </div>
  );
}

export default function WelcomePage() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-10 md:py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-14">
        <section className="relative overflow-hidden rounded-2xl bg-sand px-6 py-10 shadow-md md:px-14 md:py-16">
          <LogoMark className="pointer-events-none absolute -right-10 -bottom-12 size-80 text-foreground opacity-[0.06]" />
          <div className="pointer-events-none absolute inset-3 rounded-xl border border-gold/40" />
          <div className="relative grid items-center gap-10 md:grid-cols-[1.3fr_1fr]">
            <div className="flex flex-col items-start gap-6">
              <Logo size="lg" />
              <h1 className="font-serif text-3xl leading-snug font-bold tracking-tight md:text-4xl">
                자료 수집부터 논문 원고까지,
                <br />한 흐름으로
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-foreground/75">
                연구 설정을 기준으로 자료를 모으고 AI와 함께 판단한 뒤, 각주·참고문헌을 갖춘 외대 양식 원고로 이어 가는
                학위논문 작업 공간이에요.
              </p>
              <a href="#flow" className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
                어떻게 동작하는지 보기 <ArrowRight className="size-4" />
              </a>
            </div>
            <Suspense fallback={<div className="h-72 rounded-xl bg-card/70" />}>
              <LoginPanel />
            </Suspense>
          </div>
        </section>

        <section id="flow" className="flex scroll-mt-8 flex-col gap-6">
          <SectionTitle eyebrow="FLOW" title="동작 흐름" />
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {flow.map((s, i) => (
              <li key={s.title}>
                <Card className="h-full">
                  <CardHeader className="gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {i + 1}
                      </span>
                      <s.icon className="size-4 text-gold" />
                    </div>
                    <CardTitle className="text-base">{s.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-relaxed text-muted-foreground">{s.body}</CardContent>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-6">
          <SectionTitle eyebrow="FEATURES" title="이런 걸 할 수 있어요" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title}>
                <CardHeader>
                  <div className="mb-1 flex size-9 items-center justify-center rounded-lg bg-secondary">
                    <f.icon className="size-5 text-primary" />
                  </div>
                  <CardTitle>{f.title}</CardTitle>
                  <CardDescription className="leading-relaxed">{f.body}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <footer className="border-t pt-6 text-center text-xs text-muted-foreground">
          논문작업실 · 한국외국어대학교 학위논문 작업 공간 · 로그인하면 내 자료는 내 계정에만 저장돼요
        </footer>
      </div>
    </main>
  );
}
