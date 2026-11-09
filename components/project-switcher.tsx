"use client";

import { useRouter } from "next/navigation";

/** 화면 위쪽의 프로젝트 고르기 (글쓰기·연구 설정) */
export function ProjectSwitcher({
  projects,
  current,
  basePath = "/write",
}: {
  projects: { id: string; name: string }[];
  current: string;
  /** 고르면 이동할 화면 (예: /write, /research) */
  basePath?: string;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="write-project" className="text-sm font-medium">
        프로젝트
      </label>
      <select
        id="write-project"
        value={current}
        onChange={(e) => router.push(`${basePath}?project=${e.target.value}`)}
        className="h-8 min-w-60 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
