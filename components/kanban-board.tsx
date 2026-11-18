"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// 칸반 공용 틀: 칸 여러 개 + 카드 끌어 옮기기 (마우스 끌기, 키보드는 카드의 ‘옮기기’ 선택)

export type KanbanColumn = { id: string; label: string; hint?: string; tone?: string };
export type KanbanCard = { id: string; column: string };

export function KanbanBoard<T extends KanbanCard>({
  columns,
  cards,
  disabled,
  onMove,
  renderCard,
  emptyText = "여기로 끌어다 놓으세요",
}: {
  columns: KanbanColumn[];
  cards: T[];
  disabled?: boolean;
  /** 옮기기에 성공하면 true (실패하면 원래 칸으로 되돌림) */
  onMove: (card: T, to: string) => Promise<boolean>;
  renderCard: (card: T, move: (to: string) => void) => React.ReactNode;
  emptyText?: string;
}) {
  const [over, setOver] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  const columnOf = (c: T) => local[c.id] ?? c.column;

  async function move(card: T, to: string) {
    const from = columnOf(card);
    if (from === to || disabled) return;
    setLocal((m) => ({ ...m, [card.id]: to }));
    setMoving(card.id);
    const ok = await onMove(card, to);
    setMoving(null);
    if (!ok) setLocal((m) => ({ ...m, [card.id]: from }));
  }

  return (
    <div className="grid gap-3 overflow-x-auto md:grid-cols-[repeat(var(--cols),minmax(13rem,1fr))]" style={{ "--cols": columns.length } as React.CSSProperties}>
      {columns.map((col) => {
        const list = cards.filter((c) => columnOf(c) === col.id);
        return (
          <section
            key={col.id}
            aria-label={`${col.label} 칸`}
            onDragOver={(e) => {
              if (disabled) return;
              e.preventDefault();
              setOver(col.id);
            }}
            onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const card = cards.find((c) => c.id === e.dataTransfer.getData("text/plain"));
              if (card) void move(card, col.id);
            }}
            className={cn(
              "flex min-h-40 flex-col gap-2 rounded-2xl border bg-secondary/50 p-2.5 transition-colors",
              over === col.id && "border-primary bg-primary/10"
            )}
          >
            <header className="flex items-center gap-2 px-1 pt-0.5">
              <span className={cn("size-2.5 rounded-full", col.tone ?? "bg-muted-foreground/40")} aria-hidden />
              <h3 className="text-sm font-semibold">{col.label}</h3>
              <span className="ml-auto rounded-full bg-card px-2 text-xs tabular-nums text-muted-foreground">{list.length}</span>
            </header>
            {col.hint && <p className="px-1 text-[11px] text-muted-foreground">{col.hint}</p>}
            <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-0.5">
              {list.map((card) => (
                <div
                  key={card.id}
                  draggable={!disabled}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", card.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className={cn(
                    "rounded-xl border bg-card p-2.5 text-sm shadow-xs transition-shadow",
                    !disabled && "cursor-grab hover:shadow-md active:cursor-grabbing",
                    moving === card.id && "opacity-60"
                  )}
                >
                  {renderCard(card, (to) => void move(card, to))}
                </div>
              ))}
              {!list.length && <p className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">{emptyText}</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
