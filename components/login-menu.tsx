"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LogIn, X } from "lucide-react";
import { LoginPanel } from "@/components/login-panel";
import { cn } from "@/lib/utils";

/** 화면 오른쪽 위의 작은 ‘로그인’ 버튼: 누르면 바로 아래에 로그인 칸이 펼쳐진다 (바깥을 누르거나 Esc 로 닫힘) */
export function LoginMenu() {
  const failed = !!useSearchParams().get("error");
  const [open, setOpen] = useState(failed);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full border border-gold/70 px-3.5 text-xs font-medium tracking-wide transition-colors",
          open ? "bg-gold text-espresso" : "text-ivory hover:bg-gold/15"
        )}
      >
        {open ? <X className="size-3.5" /> : <LogIn className="size-3.5" />}
        로그인
      </button>
      {open && (
        <div role="dialog" aria-label="로그인" className="absolute top-full right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl bg-card text-foreground shadow-2xl">
          <LoginPanel />
        </div>
      )}
    </div>
  );
}
