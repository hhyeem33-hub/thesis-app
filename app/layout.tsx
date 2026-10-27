import type { Metadata } from "next";
import { Noto_Sans_KR, Noto_Serif_KR, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Hint } from "@/components/hint";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

// 제목용 명조 글꼴
const notoSerifKr = Noto_Serif_KR({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "논문작업실",
  description: "학위논문 작성을 돕는 로컬 작업 공간",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${notoSansKr.variable} ${notoSerifKr.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <TooltipProvider delay={300}>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <header className="flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
                <Hint label="사이드바 접기/펼치기 (Ctrl+B)">
                  <SidebarTrigger aria-label="사이드바 열기/닫기" />
                </Hint>
              </header>
              <main className="flex flex-1 flex-col p-6 md:p-10">
                <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">{children}</div>
              </main>
            </SidebarInset>
          </SidebarProvider>
          <Toaster position="bottom-center" richColors closeButton />
        </TooltipProvider>
      </body>
    </html>
  );
}
