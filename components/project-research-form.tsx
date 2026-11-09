"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, History, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { updateProjectResearch } from "@/app/source-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectResearchRecord } from "@/lib/types";

const when = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });

/** 프로젝트별 연구 설정: AI 판단·AI 초안의 기준. 고칠 때마다 수정 이력이 남는다 */
export function ProjectResearchForm({ projectId, initial }: { projectId: string; initial: ProjectResearchRecord }) {
  const [purpose, setPurpose] = useState(initial.purpose);
  const [keywords, setKeywords] = useState(initial.keywords.join(", "));
  const [perspective, setPerspective] = useState(initial.perspective);
  const [questions, setQuestions] = useState(initial.questions.join("\n"));
  const [outline, setOutline] = useState(initial.outline.join(" / "));
  const [history, setHistory] = useState(initial.history);
  const [pending, startTransition] = useTransition();

  const tags = [...new Set(keywords.split(/[,，\n]/).map((k) => k.trim().replace(/^#/, "")).filter(Boolean))];
  const outlineItems = outline.split(/[/\n]/).map((o) => o.trim()).filter(Boolean);

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await updateProjectResearch(projectId, { purpose, keywords, perspective, questions, outline });
      if (!r.ok) {
        toast.error("저장하지 못했어요", { description: r.error });
        return;
      }
      if (!r.changed?.length) {
        toast.info("바뀐 내용이 없어요");
        return;
      }
      setHistory((h) => [
        {
          at: new Date().toISOString(),
          changed: r.changed!,
          snapshot: {
            purpose,
            keywords: tags,
            perspective,
            questions: questions.split("\n").map((q) => q.trim()).filter(Boolean),
            outline: outlineItems,
            updatedAt: new Date().toISOString(),
          },
        },
        ...h,
      ]);
      toast.success("연구 설정을 저장했어요", {
        description: `바뀐 칸: ${r.changed.join(", ")} · 다음 AI 판단부터 이 기준을 써요.`,
      });
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <form onSubmit={save} className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>연구 설정</CardTitle>
            <CardDescription>
              AI가 자료의 관련도·토픽을 판단하고 초안을 쓸 때 이 내용을 기준으로 삼아요. 구체적으로 적을수록 판단이
              정확해져요.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="r-purpose">연구 목적</Label>
              <Textarea
                id="r-purpose"
                value={purpose}
                rows={3}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="예: 한·중 소비자의 수면 건강식품 소비에 나타난 웰니스 가치지향의 차이를 밝힌다."
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="r-keywords">핵심 키워드 (쉼표로 구분)</Label>
              <Input
                id="r-keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="예: 웰니스, 수면 건강식품, 슬리포노믹스, 소비자 구매행동"
              />
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((k) => (
                    <span key={k} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                      #{k}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="r-perspective">나의 관점</Label>
              <Textarea
                id="r-perspective"
                value={perspective}
                rows={3}
                onChange={(e) => setPerspective(e.target.value)}
                placeholder="예: 수면 건강식품 소비는 단순한 기능 소비가 아니라 자기 돌봄·웰니스 가치의 표현이라고 본다."
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="r-questions">연구 질문 (한 줄에 하나)</Label>
              <Textarea
                id="r-questions"
                value={questions}
                rows={4}
                onChange={(e) => setQuestions(e.target.value)}
                placeholder={"예:\n한·중 소비자의 수면 건강식품 구매 동기는 어떻게 다른가?\n웰니스 가치지향은 구매의도에 어떤 영향을 주는가?"}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="r-outline">목차 (/ 로 구분)</Label>
              <Input
                id="r-outline"
                value={outline}
                onChange={(e) => setOutline(e.target.value)}
                placeholder="예: 서론 / 이론적 배경 / 한국 소비 트렌드 / 중국 소비 트렌드 / 비교 분석 / 결론"
              />
              {outlineItems.length > 0 && (
                <ol className="flex flex-wrap gap-1.5 text-xs">
                  {outlineItems.map((o, i) => (
                    <li key={o} className="rounded-md border px-2 py-0.5">
                      {i + 1}. {o}
                    </li>
                  ))}
                </ol>
              )}
              <p className="text-xs text-muted-foreground">AI가 자료의 ‘제안 토픽’을 고를 때 이 목차 항목에서 골라요.</p>
            </div>
          </CardContent>
        </Card>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />}
            저장
          </Button>
        </div>
      </form>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-1.5">
            <History className="size-4" />
            수정 이력
          </CardTitle>
          <CardDescription>저장할 때마다 바뀐 칸이 기록돼요.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 기록이 없어요.</p>
          ) : (
            <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto text-sm">
              {history.map((h) => (
                <li key={h.at} className="rounded-lg border p-2.5">
                  <details>
                    <summary className="cursor-pointer">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <CheckCircle2 className="size-3.5 text-success" />
                        {when(h.at)}
                      </span>
                      <span className="block text-xs text-muted-foreground">바뀐 칸: {h.changed.join(", ")}</span>
                    </summary>
                    <dl className="mt-2 grid gap-1 text-xs">
                      <dt className="font-medium">연구 목적</dt>
                      <dd className="text-muted-foreground">{h.snapshot.purpose || "—"}</dd>
                      <dt className="font-medium">핵심 키워드</dt>
                      <dd className="text-muted-foreground">{h.snapshot.keywords.join(", ") || "—"}</dd>
                      <dt className="font-medium">연구 질문</dt>
                      <dd className="text-muted-foreground">{h.snapshot.questions.join(" · ") || "—"}</dd>
                      <dt className="font-medium">목차</dt>
                      <dd className="text-muted-foreground">{h.snapshot.outline.join(" / ") || "—"}</dd>
                    </dl>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
