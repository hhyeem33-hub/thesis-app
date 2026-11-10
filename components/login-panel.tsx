"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, MailCheck, Send } from "lucide-react";
import { toast } from "sonner";
import { googleLoginUrl, sendLoginLink } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.6-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.8h3.6c2.1-1.9 3.3-4.8 3.3-8.1z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10l3.7-2.9z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}

/** 로그인 칸: 구글로 시작하기 + 이메일 링크 로그인 */
export function LoginPanel() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState<"google" | "email" | null>(null);
  const [, startTransition] = useTransition();
  const error = params.get("error");

  function google() {
    setBusy("google");
    startTransition(async () => {
      const r = await googleLoginUrl();
      if (r.ok && r.url) {
        window.location.href = r.url;
        return;
      }
      setBusy(null);
      toast.error("구글 로그인을 시작하지 못했어요", { description: r.ok ? undefined : r.error });
    });
  }

  function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy("email");
    startTransition(async () => {
      const r = await sendLoginLink(email);
      setBusy(null);
      if (!r.ok) {
        toast.error("로그인 메일을 보내지 못했어요", { description: r.error });
        return;
      }
      setSentTo(email.trim());
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-gold/40 bg-card/90 p-6 shadow-sm backdrop-blur">
      <div>
        <p className="font-serif text-xl font-bold">시작하기</p>
        <p className="text-sm text-muted-foreground">처음이면 로그인할 때 내 계정이 만들어져요.</p>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <Button size="lg" variant="outline" className="h-11 bg-background" onClick={google} disabled={!!busy}>
        {busy === "google" ? <Loader2 className="animate-spin" /> : <GoogleIcon />}
        Google로 시작하기
      </Button>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        또는 이메일로
        <span className="h-px flex-1 bg-border" />
      </div>

      {sentTo ? (
        <div className="flex flex-col gap-2 rounded-lg bg-success/10 p-4 text-sm">
          <p className="inline-flex items-center gap-2 font-medium">
            <MailCheck className="size-4 text-success" />
            로그인 링크를 보냈어요
          </p>
          <p className="text-muted-foreground">
            <b className="text-foreground">{sentTo}</b> 메일함에서 &lsquo;Log In&rsquo; 링크를 눌러 주세요. 이 브라우저에서
            열어야 로그인돼요. (메일이 안 보이면 스팸함도 확인해 주세요)
          </p>
          <button type="button" className="w-fit text-xs underline" onClick={() => setSentTo(null)}>
            다른 이메일로 보내기
          </button>
        </div>
      ) : (
        <form onSubmit={sendLink} className="flex flex-col gap-2">
          <Label htmlFor="login-email" className="text-xs">
            이메일 주소
          </Label>
          <div className="flex gap-2">
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
            <Button type="submit" disabled={!!busy || !email.trim()}>
              {busy === "email" ? <Loader2 className="animate-spin" /> : <Send />}
              링크 받기
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">비밀번호 없이, 메일로 온 링크를 누르면 로그인돼요.</p>
        </form>
      )}
    </div>
  );
}
