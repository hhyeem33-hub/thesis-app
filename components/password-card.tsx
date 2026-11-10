"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setMyPassword } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** 온라인: 내 계정 비밀번호 정하기·바꾸기 (이메일 링크로 만든 계정도 여기서 비밀번호를 정함) */
export function PasswordCard({ email }: { email: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pending, startTransition] = useTransition();
  const mismatch = pw2.length > 0 && pw !== pw2;

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await setMyPassword(pw);
      if (!r.ok) {
        toast.error("비밀번호를 저장하지 못했어요", { description: r.error });
        return;
      }
      setPw("");
      setPw2("");
      toast.success("비밀번호를 정했어요", { description: "다음부터 이메일과 이 비밀번호로 들어올 수 있어요." });
    });
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>내 계정 비밀번호</CardTitle>
        <CardDescription>
          {email} 계정의 비밀번호를 정하거나 바꿔요. 이메일 링크로 처음 들어왔다면 여기서 비밀번호를 정하면, 다음부터는 이메일 +
          비밀번호로 바로 들어와요.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="new-pw" className="text-xs">
              새 비밀번호 (6자 이상)
            </Label>
            <Input id="new-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="new-pw2" className="text-xs">
              한 번 더
            </Label>
            <Input id="new-pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </div>
          {mismatch && <p className="text-xs text-destructive sm:col-span-2">두 비밀번호가 달라요.</p>}
          <Button type="submit" className="w-fit" disabled={pending || pw.length < 6 || pw !== pw2}>
            {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
            비밀번호 저장
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
