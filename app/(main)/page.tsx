import Link from "next/link";
import { ArrowRight, FilePenLine, FolderPlus, FolderSync, Plus } from "lucide-react";
import { Logo, LogoMark } from "@/components/logo";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const steps = [
  {
    icon: FolderPlus,
    title: "프로젝트 만들기",
    body: "‘새 프로젝트’ 버튼을 누르고 이름과 설명을 적어요. 만든 프로젝트는 프로젝트 화면의 표에 차곡차곡 쌓여요.",
  },
  {
    icon: FolderSync,
    title: "옵시디언·드라이브 폴더 자동 생성",
    body: "옵시디언 보관함과 구글 드라이브의 ‘논문작업실’ 폴더 안에 같은 이름의 폴더가 생겨요. 옵시디언에는 개요 노트가, 드라이브에는 ‘AI 작성글’ 폴더가 함께 만들어져요.",
  },
  {
    icon: FilePenLine,
    title: "AI로 외대 양식 논문 작성",
    body: "Claude Code에 “OO 프로젝트로 OO 주제 논문 초안 써줘”라고 하면 AI가 외대 양식 hwpx 파일을 만들어 드라이브의 ‘AI 작성글’ 폴더에 저장해요.",
  },
];

const flowChart = `flowchart LR
  A([사용자]) --> B[새 프로젝트 만들기]
  B --> C[(프로젝트 기록<br/>projects.json)]
  B --> D[옵시디언 보관함<br/>논문작업실/프로젝트]
  B --> E[구글 드라이브<br/>논문작업실/프로젝트]
  D --> F[00_프로젝트 개요.md]
  E --> G[AI 작성글 폴더]
  J([Claude Code<br/>논문 초안 요청]) --> H[AI 글쓰기]
  H --> I[외대 학위논문 양식<br/>hwpx 출력]
  I --> G`;

/** 금색 짧은 줄이 붙은 구역 제목 */
function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium tracking-[0.2em] text-gold">{eyebrow}</span>
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      <span className="h-0.5 w-10 rounded-full bg-gold" />
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col gap-14">
      <section className="relative overflow-hidden rounded-2xl bg-sand px-8 py-12 text-foreground shadow-md md:px-14 md:py-16">
        {/* 배경의 큰 로고 그림 (장식) */}
        <LogoMark className="pointer-events-none absolute -right-10 -bottom-12 size-80 text-foreground opacity-[0.06]" />
        <div className="pointer-events-none absolute inset-3 rounded-xl border border-gold/40" />
        <div className="relative flex flex-col items-start gap-8">
          <Logo size="lg" />
          <p className="max-w-2xl text-lg leading-relaxed text-foreground/75">
            프로젝트 하나로 옵시디언·구글 드라이브 폴더 준비부터 한국외대 학위논문 양식의
            한글(hwpx) 초안까지 한 번에.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/projects?new=1"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-11 px-5"
              )}
            >
              <Plus />새 프로젝트 만들기
            </Link>
            <Link
              href="/projects"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "h-11 border-foreground/25 bg-transparent px-5 text-foreground hover:bg-foreground/5"
              )}
            >
              내 프로젝트 보기
              <ArrowRight />
            </Link>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <SectionTitle eyebrow="사용법" title="세 단계면 충분해요" />
        <div className="grid gap-5 md:grid-cols-3">
          {steps.map((step, i) => (
            <Card key={step.title} className="border-t-2 border-t-gold shadow-sm">
              <CardHeader className="gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-serif text-3xl font-bold text-gold">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-primary">
                    <step.icon className="size-5" />
                  </span>
                </div>
                <CardTitle className="text-lg font-semibold">{step.title}</CardTitle>
                <CardDescription className="leading-relaxed">{step.body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <SectionTitle eyebrow="동작 흐름" title="앱 안에서 일어나는 일" />
        <Card className="shadow-sm">
          <CardContent className="py-6">
            <MermaidDiagram chart={flowChart} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
