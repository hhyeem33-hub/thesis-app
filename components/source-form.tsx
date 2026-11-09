"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { addSource, classifySourceAction } from "@/app/source-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SOURCE_TYPES, SOURCE_TYPE_LABEL, type SourceType } from "@/lib/types";
import { cn } from "@/lib/utils";

const ORIGIN_HINT: Record<SourceType, string> = {
  pdf: "예: 홍길동(2024), 「논문 제목」, 『학술지명』 12(3)",
  markdown: "예: 옵시디언 노트 이름 또는 원래 출처",
  web: "예: https://… (웹 주소)",
  youtube: "예: https://youtube.com/watch?v=… (영상 주소)",
};

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function SourceForm({
  projects,
  autoClassify = false,
}: {
  projects: { id: string; name: string }[];
  /** 저장 뒤 바로 AI 판단 */
  autoClassify?: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<SourceType>("pdf");
  const [origin, setOrigin] = useState("");
  const [content, setContent] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const r = await addSource({ title, type, origin, content, projectId });
      if (!r.ok) {
        setError(r.error);
        toast.error("자료를 저장하지 못했어요", { description: r.error });
        return;
      }
      if (autoClassify && r.id) {
        toast.info("자료를 저장했어요. AI가 판단하는 중…");
        const c = await classifySourceAction(r.id);
        if (c.ok) toast.success(`AI 판단: ${c.relevance}등급`, { description: "자료 관리에서 채택·보류·제외를 정해 주세요." });
        else toast.error("AI 판단은 실패했어요", { description: c.error });
      } else
        toast.success("자료를 저장했어요", {
          description: "자료 상세에서 ‘AI 분류’를 누르면 관련도와 요약이 붙어요.",
        });
      router.push(`/sources/${r.id}`);
    });
  }

  return (
    <Card className="max-w-3xl">
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="source-title">제목</Label>
            <Input
              id="source-title"
              value={title}
              maxLength={200}
              autoFocus
              disabled={pending}
              placeholder="예: 수면 건강식품 소비자 인식 연구"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>유형</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="자료 유형">
              {SOURCE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={type === t}
                  disabled={pending}
                  onClick={() => setType(t)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    type === t
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input hover:bg-accent"
                  )}
                >
                  {SOURCE_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="source-origin">출처 (선택)</Label>
              <Input
                id="source-origin"
                value={origin}
                maxLength={1000}
                disabled={pending}
                placeholder={ORIGIN_HINT[type]}
                onChange={(e) => setOrigin(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                비워 두면 대시보드에 &lsquo;미확인 출처&rsquo;로 세어져요.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="source-project">연결할 프로젝트</Label>
              <select
                id="source-project"
                value={projectId}
                disabled={pending}
                onChange={(e) => setProjectId(e.target.value)}
                className={selectClass}
              >
                <option value="">연결 안 함</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="source-content">내용</Label>
            <Textarea
              id="source-content"
              value={content}
              rows={12}
              disabled={pending}
              placeholder="PDF·웹 글·영상 자막·노트의 내용을 복사해서 붙여 넣으세요. AI 분류와 요약에 쓰여요."
              onChange={(e) => setContent(e.target.value)}
              className="font-mono text-xs leading-relaxed"
            />
            <p className="text-right text-xs text-muted-foreground tabular-nums">
              {content.length.toLocaleString()}자
            </p>
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <div>
            <Button type="submit" disabled={pending || !title.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />}
              {pending ? "저장 중…" : "자료 저장"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
