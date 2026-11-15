"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminSetOwnerPassword } from "@/app/admin-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MIN = 6;

/** 새 비밀번호 두 번 + 저장 (내 컴퓨터 전용 관리자 화면) */
export function AdminPasswordForm({ email }: { email: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const short = pw.length > 0 && pw.length < MIN;
  const mismatch = pw2.length > 0 && pw !== pw2;

  function save(e: React.FormEvent) {
    e.preventDefault();
    setDone(false);
    startTransition(async () => {
      const r = await adminSetOwnerPassword(pw);
      if (!r.ok) {
        toast.error("비밀번호를 바꾸지 못했어요", { description: r.error });
        return;
      }
      setPw("");
      setPw2("");
      setDone(true);
      toast.success("비밀번호를 바꿨어요", { description: "온라인 앱에서 이메일과 새 비밀번호로 로그인해 보세요." });
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 rounded-xl border border-gold/40 bg-card/90 p-6 shadow-sm">
      <div>
        <p className="font-serif text-xl font-bold">관리자 비밀번호 바꾸기</p>
        <p className="text-sm break-all text-muted-foreground">대상 계정: {email}</p>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="admin-pw" className="text-xs">
          새 비밀번호 <span className="text-muted-foreground">({MIN}자 이상)</span>
        </Label>
        <div className="relative">
          <Input
            id="admin-pw"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            autoFocus
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="h-10 bg-background pr-10"
            aria-invalid={short}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label={show ? "비밀번호 가리기" : "비밀번호 보기"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {short && <p className="text-xs text-destructive">{MIN}자 이상으로 적어 주세요.</p>}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="admin-pw2" className="text-xs">
          한 번 더
        </Label>
        <Input
          id="admin-pw2"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          className="h-10 bg-background"
          aria-invalid={mismatch}
        />
        {mismatch && <p className="text-xs text-destructive">두 비밀번호가 달라요.</p>}
      </div>
      <Button type="submit" size="lg" className="h-11" disabled={pending || pw.length < MIN || pw !== pw2}>
        {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
        {pending ? "바꾸는 중…" : "저장"}
      </Button>
      {done && (
        <p className="inline-flex items-start gap-1.5 text-sm text-success">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          바꿨어요. 온라인 앱에서 새 비밀번호로 로그인해 보세요.
        </p>
      )}
    </form>
  );
}
