"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FilePlus2,
  FolderKanban,
  House,
  LayoutDashboard,
  NotebookPen,
  ScanSearch,
  Library,
  Settings,
  Sparkles,
  Target,
} from "lucide-react";
import { Logo } from "@/components/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const menuGroups = [
  {
    label: null,
    items: [
      { title: "홈", href: "/", icon: House },
      { title: "대시보드", href: "/dashboard", icon: LayoutDashboard },
      { title: "프로젝트", href: "/projects", icon: FolderKanban },
      { title: "글쓰기", href: "/write", icon: NotebookPen },
    ],
  },
  {
    label: "자료",
    items: [
      { title: "자료 수집", href: "/sources/new", icon: FilePlus2 },
      { title: "자료 관리", href: "/sources", icon: Library },
      { title: "KCI 검색", href: "/kci", icon: ScanSearch },
      { title: "AI 분류", href: "/classify", icon: Sparkles },
    ],
  },
  {
    label: "설정",
    items: [
      { title: "연구 설정", href: "/research", icon: Target },
      { title: "설정", href: "/settings", icon: Settings },
    ],
  },
];

const allHrefs = menuGroups.flatMap((g) => g.items.map((i) => i.href));

/** 지금 주소와 가장 길게 맞는 메뉴 하나만 켠다 (/sources/new 는 '자료 수집', /sources/abc 는 '자료 관리') */
function activeHref(pathname: string) {
  if (pathname === "/") return "/";
  return allHrefs
    .filter(
      (h) => h !== "/" && (pathname === h || pathname.startsWith(`${h}/`)),
    )
    .sort((a, b) => b.length - a.length)[0];
}

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border">
        <Link href="/" aria-label="홈으로" className="px-2 py-4">
          <Logo />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {/* 자료 상세(/sources/아이디)처럼 주소를 미리 알 수 없는 화면에서는
            현재 주소를 읽는 동안 켜진 메뉴 없이 먼저 그린다 */}
        <Suspense fallback={<SidebarNav active={undefined} />}>
          <ActiveSidebarNav />
        </Suspense>
      </SidebarContent>
    </Sidebar>
  );
}

function ActiveSidebarNav() {
  return <SidebarNav active={activeHref(usePathname())} />;
}

function SidebarNav({ active }: { active: string | undefined }) {
  return menuGroups.map((group, gi) => (
    <SidebarGroup key={gi} className={gi === 0 ? "pt-4" : undefined}>
      {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                isActive={active === item.href}
                className="h-10 data-active:shadow-[inset_3px_0_0_var(--gold)]"
                render={<Link href={item.href} />}
              >
                <item.icon />
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));
}
