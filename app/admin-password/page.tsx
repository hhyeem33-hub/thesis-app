import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ShieldAlert } from "lucide-react";
import { isLocalAdmin, ownerEmail } from "@/lib/local-admin";
import { AdminPasswordForm } from "@/components/admin-password-form";
import { Logo } from "@/components/logo";

// 내 컴퓨터(localhost) 전용: 메일 없이 주인 계정 비밀번호 바꾸기. 온라인에서는 "없는 화면"(404)으로 보인다.

export const metadata: Metadata = { title: "관리자 비밀번호 바꾸기 — 논문작업실", robots: { index: false } };

export default function AdminPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-4 py-10">
      <Logo />
      <div className="mt-8 w-full max-w-sm">
        <Suspense fallback={<div className="h-72 rounded-xl bg-card/70" />}>
          <AdminContent />
        </Suspense>
      </div>
    </main>
  );
}

async function AdminContent() {
  await connection();
  if (!(await isLocalAdmin())) notFound();
  const email = ownerEmail();
  return (
    <div className="flex flex-col gap-3">
      <p className="inline-flex items-start gap-2 rounded-lg bg-gold/15 px-3 py-2 text-xs">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          내 컴퓨터에서만 열리는 화면이에요. 슈파베이스 비밀 열쇠로 온라인 앱의 로그인 비밀번호를 메일 없이 바로 바꿔요.
        </span>
      </p>
      {email ? (
        <AdminPasswordForm email={email} />
      ) : (
        <p className="rounded-xl border bg-card p-6 text-sm">
          <code>.env.local</code> 에 <code>OWNER_EMAIL=내 이메일</code> 한 줄을 넣고 앱을 다시 켜 주세요.
        </p>
      )}
    </div>
  );
}
