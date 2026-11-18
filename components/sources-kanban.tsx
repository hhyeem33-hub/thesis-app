"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { decideSource } from "@/app/source-actions";
import { GradeBadge } from "@/components/grade-badge";
import { KanbanBoard, type KanbanColumn } from "@/components/kanban-board";
import { GUEST_NOTICE, useGuest } from "@/components/use-guest";

// 자료 관리 → 칸반 보기: 미정·채택·보류·제외 칸으로 끌어 옮기면 연구자 결정이 바뀐다 (기록에도 남음)

export type KanbanSource = { id: string; title: string; relevance: number; topic: string; status: string | null; projectName: string | null };

const COLUMNS: KanbanColumn[] = [
  { id: "none", label: "미정", hint: "아직 정하지 않은 자료", tone: "bg-muted-foreground/40" },
  { id: "adopted", label: "채택", hint: "논문에 쓸 자료", tone: "bg-success" },
  { id: "held", label: "보류", hint: "나중에 다시 볼 자료", tone: "bg-gold" },
  { id: "excluded", label: "제외", hint: "쓰지 않을 자료", tone: "bg-destructive/70" },
];
const LABEL: Record<string, string> = { none: "미정", adopted: "채택", held: "보류", excluded: "제외" };

export function SourcesKanban({ sources }: { sources: KanbanSource[] }) {
  const router = useRouter();
  const guest = useGuest();
  const cards = sources.map((s) => ({ ...s, column: s.status ?? "none" }));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        카드를 다른 칸으로 끌어다 놓으면 결정이 바뀌어요 (자료 기록에 남아요). {guest && GUEST_NOTICE}
      </p>
      <KanbanBoard
        columns={COLUMNS}
        cards={cards}
        disabled={guest}
        onMove={async (card, to) => {
          const r = await decideSource(card.id, { status: to === "none" ? null : (to as "adopted" | "held" | "excluded") }, `칸반에서 ‘${LABEL[to]}’(으)로 옮김`);
          if (!r.ok) {
            toast.error("옮기지 못했어요", { description: r.error });
            return false;
          }
          toast.success(`‘${card.title.slice(0, 30)}’ → ${LABEL[to]}`);
          router.refresh();
          return true;
        }}
        renderCard={(s) => (
          <div className="flex flex-col gap-1.5">
            <Link href={`/sources/${s.id}`} className="line-clamp-2 font-medium hover:underline" draggable={false}>
              {s.title}
            </Link>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              {s.relevance > 0 && <GradeBadge grade={s.relevance} />}
              {s.topic && <span className="rounded bg-secondary px-1.5 py-0.5">{s.topic}</span>}
              {s.projectName && <span className="truncate">{s.projectName}</span>}
            </div>
          </div>
        )}
      />
    </div>
  );
}
