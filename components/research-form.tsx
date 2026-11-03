"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateResearch } from "@/app/source-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Research } from "@/lib/types";

export function ResearchForm({ initial }: { initial: Research }) {
  const [topic, setTopic] = useState(initial.topic);
  const [keywords, setKeywords] = useState(initial.keywords.join(", "));
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const preview = [
    ...new Set(
      keywords
        .split(/[,，\n]/)
        .map((k) => k.trim().replace(/^#/, ""))
        .filter(Boolean)
    ),
  ];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    startTransition(async () => {
      const r = await updateResearch({ topic, keywords });
      if (r.ok) {
        setSaved(true);
        toast.success("연구 설정을 저장했어요", { description: "다음 AI 분류부터 이 주제로 관련도를 매겨요." });
      } else toast.error("저장하지 못했어요", { description: r.error });
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>내 연구</CardTitle>
          <CardDescription>
            AI 분류가 자료의 &lsquo;논문 관련도&rsquo;를 매길 때 이 주제와 키워드를 기준으로 삼아요.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="research-topic">연구 주제</Label>
            <Textarea
              id="research-topic"
              value={topic}
              rows={2}
              maxLength={300}
              disabled={pending}
              placeholder="예: 한·중 소비자의 수면 건강식품 소비에 나타난 웰니스 가치지향 비교"
              onChange={(e) => {
                setTopic(e.target.value);
                setSaved(false);
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="research-keywords">키워드</Label>
            <Input
              id="research-keywords"
              value={keywords}
              disabled={pending}
              placeholder="쉼표로 나눠 적어요. 예: 웰니스, 수면, 건강식품, 소비자 가치"
              onChange={(e) => {
                setKeywords(e.target.value);
                setSaved(false);
              }}
            />
            {preview.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {preview.slice(0, 20).map((k) => (
                  <span key={k} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                    #{k}
                  </span>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "저장 중…" : "저장"}
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="size-4" />
            저장했어요.
          </span>
        )}
      </div>
    </form>
  );
}
