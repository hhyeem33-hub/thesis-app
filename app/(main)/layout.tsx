import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { GuestBanner } from "@/components/guest-banner";
import { GoogleLoginButton } from "@/components/google-login-button";
import { Hint } from "@/components/hint";
import { isGuest } from "@/lib/auth";
import { ONLINE } from "@/lib/online";
import { connection } from "next/server";
import { SidebarAccount, SidebarAccountSkeleton } from "@/components/sidebar-account";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

/** 오른쪽 위: 둘러보기 중인 사람에게만 작은 구글 로그인 버튼 */
async function HeaderLogin() {
  await connection();
  if (!ONLINE || !(await isGuest())) return null;
  return <GoogleLoginButton />;
}

// 사이드바가 있는 앱 화면들. (로그인 전 둘러보기 화면 /welcome 은 이 밖에 있어서 사이드바 없이 보인다)
export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider>
      <AppSidebar
        footer={
          <Suspense fallback={<SidebarAccountSkeleton />}>
            <SidebarAccount />
          </Suspense>
        }
      />
      <SidebarInset className="min-w-0">
        <Suspense fallback={null}>
          <GuestBanner />
        </Suspense>
        <header className="flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <Hint label="사이드바 접기/펼치기 (Ctrl+B)">
            <SidebarTrigger aria-label="사이드바 열기/닫기" />
          </Hint>
          <div className="ml-auto">
            <Suspense fallback={null}>
              <HeaderLogin />
            </Suspense>
          </div>
        </header>
        <main className="flex flex-1 flex-col p-6 md:p-10">
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
