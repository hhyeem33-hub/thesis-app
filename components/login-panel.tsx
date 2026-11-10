"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, LogIn, MailCheck } from "lucide-react";
// Eye 는 비밀번호 보기와 둘러보기 버튼에 같이 쓴다
import { toast } from "sonner";
import { enterGuest, googleLoginUrl, loginOptions, passwordLogin, sendLoginLink } from "@/app/auth-actions";
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

/** 로그인 칸: 이메일 + 비밀번호 (처음이면 바로 가입), 구글(켜져 있을 때만), 이메일 링크(작은 글씨) */
export function LoginPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [google, setGoogle] = useState(false);
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState<"login" | "google" | "link" | null>(null);
  const [, startTransition] = useTransition();
  const error = params.get("error");

  // 구글 로그인은 슈파베이스에서 켰을 때만 버튼을 보여 준다
  useEffect(() => {
    let alive = true;
    loginOptions().then((o) => alive && setGoogle(o.google)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy("login");
    startTransition(async () => {
      const r = await passwordLogin(email, password);
      if (!r.ok) {
        setBusy(null);
        toast.error("들어가지 못했어요", { description: r.error });
        return;
      }
      toast.success(r.created ? "새 계정을 만들고 들어왔어요" : "로그인했어요");
      router.replace("/dashboard");
      router.refresh();
    });
  }

  function googleLogin() {
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

  function sendLink() {
    if (!email.trim()) {
      toast.info("위 칸에 이메일을 먼저 적어 주세요");
      return;
    }
    setBusy("link");
    startTransition(async () => {
      const r = await sendLoginLink(email);
      setBusy(null);
      if (!r.ok) toast.error("로그인 메일을 보내지 못했어요", { description: r.error });
      else setLinkSentTo(email.trim());
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-gold/40 bg-card/90 p-6 shadow-sm backdrop-blur">
      <div>
        <p className="font-serif text-xl font-bold">시작하기</p>
        <p className="text-sm text-muted-foreground">처음 쓰는 이메일이면 계정이 바로 만들어져요.</p>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <form onSubmit={login} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="login-email" className="text-xs">
            이메일
          </Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="h-10 bg-background"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="login-password" className="text-xs">
            비밀번호 <span className="text-muted-foreground">(6자 이상)</span>
          </Label>
          <div className="relative">
            <Input
              id="login-password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 bg-background pr-10"
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
        </div>
        <Button type="submit" size="lg" className="h-11" disabled={!!busy || !email.trim() || password.length < 6}>
          {busy === "login" ? <Loader2 className="animate-spin" /> : <LogIn />}
          {busy === "login" ? "들어가는 중…" : "들어가기"}
        </Button>
      </form>

      {google && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            또는
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button size="lg" variant="outline" className="h-11 bg-background" onClick={googleLogin} disabled={!!busy}>
            {busy === "google" ? <Loader2 className="animate-spin" /> : <GoogleIcon />}
            Google로 시작하기
          </Button>
        </>
      )}

      <form action={enterGuest} className="flex flex-col gap-1">
        <Button type="submit" variant="ghost" className="h-10 border border-dashed border-gold/60 bg-background/60" disabled={!!busy}>
          <Eye />
          둘러보기 (로그인 없이 보기)
        </Button>
        <p className="text-center text-xs text-muted-foreground">만든 사람의 자료·AI 분류 결과를 읽기 전용으로 볼 수 있어요.</p>
      </form>

      {linkSentTo ? (
        <p className="inline-flex items-start gap-1.5 text-xs text-muted-foreground">
          <MailCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
          {linkSentTo} 로 로그인 링크를 보냈어요. 이 브라우저에서 메일의 링크를 눌러 주세요.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          비밀번호 없이 들어가려면{" "}
          <button type="button" onClick={sendLink} disabled={!!busy} className="underline underline-offset-2 hover:text-foreground">
            {busy === "link" ? "보내는 중…" : "이메일 링크로 들어가기"}
          </button>
        </p>
      )}
    </div>
  );
}
