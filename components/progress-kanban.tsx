"use client";

import Link from "next/link";
import { toast } from "sonner";
import { setProjectStage } from "@/app/kanban-actions";
import type { Stage } from "@/lib/progress";
import { KanbanBoard, type KanbanColumn } from "@/components/kanban-board";
import { useGuest } from "@/components/use-guest";

// 논문 진행 칸반: 프로젝트 카드를 자료 모으기 → 초안 → 수정 → 출력 칸으로 끌어 옮긴다

export type ProgressCard = { id: string; name: string; stage: Stage; sources: number; chars: number };

const COLUMNS: KanbanColumn[] = [
  { id: "collect", label: "자료 모으기", hint: "자료 수집·AI 판단", tone: "bg-gold" },
  { id: "draft", label: "초안", hint: "장별 AI 초안·글쓰기", tone: "bg-primary/60" },
  { id: "revise", label: "수정", hint: "각주·참고문헌 다듬기", tone: "bg-primary" },
  { id: "output", label: "출력", hint: "HWPX·PDF 내보내기", tone: "bg-success" },
];
const LINK: Record<Stage, string> = { collect: "/sources/new", draft: "/write", revise: "/write", output: "/write" };

export function ProgressKanban({ projects }: { projects: ProgressCard[] }) {
  const guest = useGuest();
  return (
    <KanbanBoard
      columns={COLUMNS}
      cards={projects.map((p) => ({ ...p, column: p.stage }))}
      disabled={guest}
      emptyText="프로젝트 카드를 끌어다 놓으세요"
      onMove={async (card, to) => {
        const r = await setProjectStage(card.id, to as Stage);
        if (!r.ok) {
          toast.error("단계를 바꾸지 못했어요", { description: r.error });
          return false;
        }
        toast.success(`‘${card.name}’ → ${COLUMNS.find((c) => c.id === to)?.label}`);
        return true;
      }}
      renderCard={(p) => (
        <div className="flex flex-col gap-1">
          <Link href={`${LINK[p.stage]}${LINK[p.stage] === "/write" ? `?project=${p.id}` : ""}`} className="font-medium hover:underline" draggable={false}>
            {p.name}
          </Link>
          <p className="text-[11px] text-muted-foreground">
            자료 {p.sources.toLocaleString()}개 · 원고 {p.chars.toLocaleString()}자
          </p>
        </div>
      )}
    />
  );
}
