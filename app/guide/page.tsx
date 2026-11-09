import Link from "next/link";
import {
  ArrowRight,
  BookMarked,
  FileDown,
  FilePlus2,
  ListChecks,
  NotebookPen,
  Sparkles,
  Target,
} from "lucide-react";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const flow = `flowchart LR
  R[/연구 설정<br/>목적·키워드·질문·목차/] -.기준.-> B
  A([자료 수집<br/>KCI·옵시디언·파일·목록]) --> B[AI 판단<br/>관련도·토픽·근거·신뢰도]
  B --> C{연구자 확정}
  C -->|채택| D[글쓰기·각주<br/>자료로 출처 각주]
  C -->|보류·제외| X[(라이브러리에 보관)]
  D --> E[참고문헌<br/>외대 양식 자동 정리]
  E --> F[HWPX 내려받기<br/>한국외대 학위논문 양식]
  D -.저장할 때마다.-> H[(히스토리)]`;

const steps = [
  {
    icon: <Target />,
    title: "0. 연구 설정",
    href: "/research",
    menu: "연구 설정",
    text: "프로젝트마다 연구 목적, 핵심 키워드, 나의 관점, 연구 질문, 목차를 적어요. AI가 이걸 기준으로 판단하고 초안을 써요. 고칠 때마다 이력이 남아요.",
  },
  {
    icon: <FilePlus2 />,
    title: "1. 자료 수집",
    href: "/sources/new",
    menu: "자료 수집",
    text: "KCI 검색, 옵시디언 가져오기, 파일 올리기(PDF·Word·txt·md), 직접 입력, 엑셀·CSV 목록으로 모아요. 같은 자료는 두 번 들어가지 않아요.",
  },
  {
    icon: <Sparkles />,
    title: "2. AI 판단",
    href: "/sources",
    menu: "자료 관리",
    text: "Claude가 자료마다 관련도 1~5등급, 제안 토픽, 관련 키워드, 분류 근거, 신뢰도를 매겨요. 들어오자마자 판단하거나, ‘미판단 판단’ 버튼으로 한꺼번에 해요.",
  },
  {
    icon: <ListChecks />,
    title: "3. 연구자 확정 (채택)",
    href: "/sources",
    menu: "자료 관리 → 채택·보류·제외·자세히",
    text: "AI 판단은 제안일 뿐, 최종 결정은 연구자가 해요. 자세히 창에서 최종 토픽·확정 키워드·내 관점 메모를 남기면 분류 기록이 쌓여요.",
  },
  {
    icon: <NotebookPen />,
    title: "4. 글쓰기·각주",
    href: "/write",
    menu: "글쓰기",
    text: "프로젝트 원고를 쓰고, 글자를 선택해 ‘각주 달기’ 또는 ‘자료로 각주’를 눌러요. AI 초안을 불러와 이어 쓸 수 있고, 저장할 때마다 히스토리가 남아요.",
  },
  {
    icon: <BookMarked />,
    title: "5. 참고문헌",
    href: "/write",
    menu: "글쓰기 → 참고문헌 탭",
    text: "출처 각주에 쓴 자료가 외대 양식(국문 「논문」『학술지·책』, 한국어→중국어→영어)으로 자동 정리돼요. 모르는 칸은 [보완 필요]로 표시돼요.",
  },
  {
    icon: <FileDown />,
    title: "6. HWPX",
    href: "/write",
    menu: "글쓰기 → HWPX 탭",
    text: "본문·각주·참고문헌을 한국외대 학위논문 양식(또는 내가 올린 양식)의 한글 파일로 내려받아요. 내 컴퓨터에서 실행할 때 돼요.",
  },
];

export default function GuidePage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="작동 방법"
        description="자료를 모으면 AI가 내 연구 기준으로 판단하고, 연구자가 최종 확정한 자료로 논문을 써서 HWPX로 내보내요."
      />
      <Card>
        <CardHeader>
          <CardTitle>전체 흐름</CardTitle>
          <CardDescription>자료 수집 → AI 판단 → 채택 → 글쓰기·각주 → 참고문헌 → HWPX</CardDescription>
        </CardHeader>
        <CardContent>
          <MermaidDiagram chart={flow} />
        </CardContent>
      </Card>
      <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {steps.map((s) => (
          <li key={s.title}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="inline-flex items-center gap-2 font-heading">
                  <span className="grid size-8 place-items-center rounded-full bg-secondary text-primary [&_svg]:size-4">
                    {s.icon}
                  </span>
                  {s.title}
                </CardTitle>
                <CardDescription>메뉴: {s.menu}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm leading-relaxed">
                <p>{s.text}</p>
                <Link href={s.href} className={buttonVariants({ size: "sm", variant: "outline", className: "w-fit" })}>
                  바로 가기
                  <ArrowRight />
                </Link>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
