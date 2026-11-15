"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setMyPassword } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MIN = 6;

/** 재설정 링크로 들어온 사람: 새 비밀번호를 두 번 입력 */
export function ResetPasswordForm({ email }: { email: string }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [pending, startTransition] = useTransition();
  const short = pw.length > 0 && pw.length < MIN;
  const mismatch = pw2.length > 0 && pw !== pw2;

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await setMyPassword(pw);
      if (!r.ok) {
        toast.error("비밀번호를 바꾸지 못했어요", { description: r.error });
        return;
      }
      toast.success("새 비밀번호로 바꿨어요", { description: "다음부터 이메일과 새 비밀번호로 들어오면 돼요." });
      router.replace("/dashboard");
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 rounded-xl border border-gold/40 bg-card/90 p-6 shadow-sm">
      <div>
        <p className="font-serif text-xl font-bold">새 비밀번호 정하기</p>
        <p className="text-sm break-all text-muted-foreground">{email}</p>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="reset-pw" className="text-xs">
          새 비밀번호 <span className="text-muted-foreground">({MIN}자 이상)</span>
        </Label>
        <div className="relative">
          <Input
            id="reset-pw"
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
        <Label htmlFor="reset-pw2" className="text-xs">
          한 번 더
        </Label>
        <Input
          id="reset-pw2"
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
        {pending ? "바꾸는 중…" : "새 비밀번호 저장"}
      </Button>
    </form>
  );
}
