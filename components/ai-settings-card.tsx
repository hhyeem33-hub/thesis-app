"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, KeyRound, Loader2, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { removeAiKey, saveAiKey, testAiConnection } from "@/app/actions";
import { Hint } from "@/components/hint";
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
import type { AiKeyStatus } from "@/lib/ai";

export function AiSettingsCard({ status, onVercel }: { status: AiKeyStatus; onVercel: boolean }) {
  const [apiKey, setApiKey] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setResult(null);
    startTransition(async () => {
      const r = await action();
      setResult(r);
      if (r.ok) toast.success(r.message);
      else toast.error("AI 연결에 실패했어요", { description: r.message });
    });
  }

  const handleTest = () =>
    run(async () => {
      const r = await testAiConnection(apiKey);
      return r.ok ? { ok: true, message: r.warning ?? "연결됐어요." } : { ok: false, message: r.error };
    });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    run(async () => {
      const r = await saveAiKey(apiKey);
      if (r.ok) setApiKey("");
      return r.ok ? { ok: true, message: "키를 저장했어요." } : { ok: false, message: r.error };
    });
  };

  const handleRemove = () =>
    run(async () => {
      const r = await removeAiKey();
      return r.ok ? { ok: true, message: "저장된 키를 지웠어요." } : { ok: false, message: r.error };
    });

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>AI 연결</CardTitle>
        <CardDescription>
          {onVercel ? (
            <>
              Claude API 키를 넣으면 AI 판단·AI 초안을 쓸 수 있어요. 키는 <b>내 계정에만</b> 저장되고 다른 사람은 볼 수
              없어요. 키가 없으면 AI 분류는 <b>규칙 기반</b>(연구 설정 키워드와 겹치는 정도)으로 동작해요.
            </>
          ) : (
            <>
              Claude API 키를 넣으면 프로젝트 화면에서 &lsquo;AI로 초안 쓰기&rsquo;를 쓸 수 있어요. 키는 이 컴퓨터에만
              저장되고 깃허브에는 올라가지 않아요.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="inline-flex items-center gap-1.5 text-sm">
          <KeyRound className="size-4 text-muted-foreground" />
          {status.source === "env" &&
            (onVercel ? (
              <>앱 주인 계정이라 버셀에 넣은 키를 쓰고 있어요 (끝자리 …{status.last4})</>
            ) : (
              <>환경 변수(ANTHROPIC_API_KEY)의 키를 쓰고 있어요 (끝자리 …{status.last4})</>
            ))}
          {status.source === "saved" && <>저장된 키가 있어요 (끝자리 …{status.last4})</>}
          {status.source === "none" && <span className="text-muted-foreground">아직 키가 없어요.</span>}
        </p>

        {onVercel && status.source === "env" ? (
          <p className="text-sm text-muted-foreground">
            버셀의 키는 앱 주인 계정만 써요. 다른 사람은 이 칸에서 자기 키를 넣어요.
          </p>
        ) : (
          <form onSubmit={handleSave} className="flex flex-col gap-2">
            <Label htmlFor="api-key">{status.source === "none" ? "API 키" : "새 API 키로 바꾸기"}</Label>
            <Input
              id="api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              placeholder="sk-ant-로 시작하는 키를 붙여 넣으세요"
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              키는 Claude 콘솔(platform.claude.com)의 API Keys에서 만들 수 있어요. 입력한 글자는
              ●●●●로 가려져요.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Hint label="키가 맞는지 확인하고 저장해요">
                <Button type="submit" disabled={pending || !apiKey.trim()}>
                  {pending && <Loader2 className="animate-spin" />}
                  저장
                </Button>
              </Hint>
              {status.source === "saved" && (
                <Button type="button" variant="ghost" disabled={pending} onClick={handleRemove}>
                  저장된 키 지우기
                </Button>
              )}
            </div>
          </form>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Hint label="입력한 키(없으면 저장된 키)로 Claude에 연결해 봐요. 비용은 들지 않아요.">
            <Button
              type="button"
              variant="outline"
              disabled={pending || (status.source === "none" && !apiKey.trim())}
              onClick={handleTest}
            >
              <PlugZap />
              연결 테스트
            </Button>
          </Hint>
          {result && (
            <span
              className={
                result.ok
                  ? "inline-flex items-center gap-1.5 text-sm text-success"
                  : "text-sm text-destructive"
              }
            >
              {result.ok && <CheckCircle2 className="size-4" />}
              {result.message}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
