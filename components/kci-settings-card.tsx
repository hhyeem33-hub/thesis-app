"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, KeyRound, Loader2, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { removeKciKeyAction, saveKciKeyAction, testKciAction } from "@/app/kci-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Status = { source: "env" | "saved" | "none"; last4?: string };

export function KciSettingsCard({ status, online }: { status: Status; online: boolean }) {
  const [key, setKey] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    startTransition(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) toast.success(r.message);
      else toast.error("KCI 연결에 실패했어요", { description: r.message });
    });

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>KCI 연결</CardTitle>
        <CardDescription>
          KCI Open API 키를 넣으면 ‘KCI 검색’에서 앱 안에서 바로 검색돼요. KCI API는 <b>신청한 집 IP에서만</b> 되므로 내
          컴퓨터에서만 써요. 키가 없거나 온라인에서는 KCI 검색 결과를 새 탭으로 열고 주소를 붙여 넣는 방식으로 써요.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="inline-flex items-center gap-1.5 text-sm">
          <KeyRound className="size-4 text-muted-foreground" />
          {status.source === "env" && <>환경 변수(KCI_API_KEY)의 키를 쓰고 있어요 (끝자리 …{status.last4})</>}
          {status.source === "saved" && <>저장된 키가 있어요 (끝자리 …{status.last4})</>}
          {status.source === "none" && <span className="text-muted-foreground">아직 키가 없어요. (승인까지 최대 1주일)</span>}
        </p>
        {online ? (
          <p className="text-sm text-muted-foreground">온라인(버셀)에서는 KCI 키를 쓰지 않아요. 내 컴퓨터에서 넣어 주세요.</p>
        ) : (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!key.trim()) return;
              run(async () => {
                const r = await saveKciKeyAction(key);
                if (r.ok) setKey("");
                return r.ok ? { ok: true, message: "KCI 키를 저장했어요." } : { ok: false, message: r.error };
              });
            }}
          >
            <Label htmlFor="kci-key">{status.source === "none" ? "KCI API 키" : "새 키로 바꾸기"}</Label>
            <Input
              id="kci-key"
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="KCI에서 받은 API 키를 붙여 넣으세요"
            />
            <p className="text-xs text-muted-foreground">
              키는 이 컴퓨터의 data/kci-key.json 에만 저장되고 깃허브에는 올라가지 않아요. 입력한 글자는 ●●●●로 가려져요.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending || !key.trim()}>
                {pending && <Loader2 className="animate-spin" />}
                저장
              </Button>
              {status.source !== "none" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const r = await testKciAction();
                      return r.ok
                        ? { ok: true, message: `연결됐어요. ‘수면’으로 ${r.total.toLocaleString()}건 검색돼요.` }
                        : { ok: false, message: r.error };
                    })
                  }
                >
                  <PlugZap />
                  연결 테스트
                </Button>
              )}
              {status.source === "saved" && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const r = await removeKciKeyAction();
                      return r.ok ? { ok: true, message: "저장된 KCI 키를 지웠어요." } : { ok: false, message: r.error };
                    })
                  }
                >
                  저장된 키 지우기
                </Button>
              )}
            </div>
          </form>
        )}
        {result && (
          <span className={result.ok ? "inline-flex items-center gap-1.5 text-sm text-success" : "text-sm text-destructive"}>
            {result.ok && <CheckCircle2 className="size-4" />}
            {result.message}
          </span>
        )}
      </CardContent>
    </Card>
  );
}
