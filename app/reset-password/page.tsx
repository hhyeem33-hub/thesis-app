import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Logo } from "@/components/logo";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { currentUser } from "@/lib/auth";
import { ONLINE } from "@/lib/online";

// 비밀번호 재설정 메일의 링크 → /auth/callback(로그인 확정) → 이 화면에서 새 비밀번호를 두 번 입력

export const metadata: Metadata = { title: "새 비밀번호 정하기 — 논문작업실" };

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-4 py-10">
      <Link href="/welcome" aria-label="첫 화면으로">
        <Logo />
      </Link>
      <div className="mt-8 w-full max-w-sm">
        <Suspense fallback={<div className="h-72 rounded-xl bg-card/70" />}>
          <ResetContent />
        </Suspense>
      </div>
    </main>
  );
}

async function ResetContent() {
  await connection();
  if (!ONLINE)
    return <Notice title="내 컴퓨터에서는 로그인이 없어요" body="비밀번호 재설정은 온라인(버셀) 앱에서만 써요." />;
  const user = await currentUser();
  if (!user)
    return (
      <Notice
        title="링크를 다시 받아 주세요"
        body="메일의 링크가 만료됐거나, 재설정을 요청한 브라우저가 아닌 곳에서 열렸어요. 로그인 화면의 ‘비밀번호를 잊으셨나요?’를 다시 누르고, 같은 브라우저에서 메일의 링크를 열어 주세요."
      />
    );
  return <ResetPasswordForm email={user.email} />;
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gold/40 bg-card/90 p-6 shadow-sm">
      <p className="font-serif text-xl font-bold">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
      <Link href="/welcome" className="text-sm font-medium underline underline-offset-2">
        로그인 화면으로
      </Link>
    </div>
  );
}
