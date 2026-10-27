"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateSettings } from "@/app/actions";
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
import type { Settings } from "@/lib/types";

export function SettingsForm({ initial }: { initial: Settings }) {
  const [obsidianVaultPath, setObsidianVaultPath] = useState(initial.obsidianVaultPath);
  const [driveRootPath, setDriveRootPath] = useState(initial.driveRootPath);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const r = await updateSettings({ obsidianVaultPath, driveRootPath });
      setResult(r.ok ? { ok: true, message: "저장했어요." } : { ok: false, message: r.error });
      if (r.ok) toast.success("설정을 저장했어요", { description: "새 프로젝트부터 이 경로를 써요." });
      else toast.error("저장하지 못했어요", { description: r.error });
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>옵시디언 보관함</CardTitle>
          <CardDescription>
            프로젝트 폴더는 이 보관함 안의 &lsquo;논문작업실&rsquo; 폴더 아래에 만들어져요.
            기존 노트는 절대 수정하거나 지우지 않아요.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="obsidian-path">보관함 경로</Label>
          <Input
            id="obsidian-path"
            value={obsidianVaultPath}
            placeholder="예: C:\Users\이름\Documents\Obsidian Vault"
            onChange={(e) => setObsidianVaultPath(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            만들어지는 위치: {obsidianVaultPath || "…"}\논문작업실\프로젝트 이름
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>구글 드라이브</CardTitle>
          <CardDescription>
            구글 드라이브 데스크톱 앱의 &lsquo;내 드라이브&rsquo; 폴더예요. AI가 쓴 글은
            프로젝트 폴더 안의 &lsquo;AI 작성글&rsquo; 폴더에 저장돼요.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="drive-path">내 드라이브 경로</Label>
          <Input
            id="drive-path"
            value={driveRootPath}
            placeholder="예: G:\내 드라이브"
            onChange={(e) => setDriveRootPath(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            만들어지는 위치: {driveRootPath || "…"}\논문작업실\프로젝트 이름\AI 작성글
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Hint label="경로가 맞는지 확인한 뒤 저장해요">
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {pending ? "저장 중…" : "저장"}
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
    </form>
  );
}
