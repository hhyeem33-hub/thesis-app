"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { googleLoginUrl, loginOptions } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";

export function GoogleIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.6-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.8h3.6c2.1-1.9 3.3-4.8 3.3-8.1z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10l3.7-2.9z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}

/**
 * 화면 오른쪽 위의 작은 구글 로그인 버튼 (온라인에서 구글 로그인이 켜져 있을 때만 보임).
 * 로그인 때는 이메일·프로필만 묻는다. 드라이브 권한은 ‘구글 드라이브 연결’ 버튼에서 따로 묻는다.
 */
export function GoogleLoginButton() {
  const [show, setShow] = useState(false);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    let alive = true;
    loginOptions()
      .then((o) => alive && setShow(o.google && !o.local))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!show) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8 gap-1.5 rounded-full bg-card/90 px-3 text-xs shadow-sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await googleLoginUrl();
          if (r.ok && r.url) window.location.href = r.url;
          else toast.error("구글 로그인을 시작하지 못했어요", { description: r.ok ? undefined : r.error });
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <GoogleIcon className="size-3.5" />}
      Google로 로그인
    </Button>
  );
}
