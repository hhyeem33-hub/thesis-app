"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  FileText,
  FolderOpen,
  Loader2,
  RotateCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { openFolder, retryFolder } from "@/app/actions";
import { Hint } from "@/components/hint";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FolderStatus, FolderTarget, Project, ProjectRow } from "@/lib/types";

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

const OVERVIEW_NOTE = "00_프로젝트 개요.md";

export function ProjectsTable({ projects }: { projects: ProjectRow[] }) {
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-12 text-center text-muted-foreground">
        <FolderOpen className="size-10" />
        <p className="font-medium">아직 만든 프로젝트가 없어요.</p>
        <p className="text-sm">오른쪽 위 &lsquo;새 프로젝트&rsquo; 버튼으로 시작해 보세요.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">이름</TableHead>
            <TableHead>생성일</TableHead>
            <TableHead>옵시디언 폴더</TableHead>
            <TableHead>드라이브 폴더</TableHead>
            <TableHead>AI 작성글</TableHead>
            <TableHead className="pr-4">바로가기</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="max-w-64 pl-4">
                <div className="font-medium">{p.name}</div>
                {p.description && (
                  <div className="truncate text-xs text-muted-foreground">
                    {p.description}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {dateFormat.format(new Date(p.createdAt))}
              </TableCell>
              <TableCell>
                <StatusCell projectId={p.id} target="obsidian" status={p.obsidian} />
              </TableCell>
              <TableCell>
                <StatusCell projectId={p.id} target="drive" status={p.drive} />
              </TableCell>
              <TableCell>
                <AiDocsCell project={p} />
              </TableCell>
              <TableCell className="pr-4">
                <Shortcuts project={p} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StatusCell({
  projectId,
  target,
  status,
}: {
  projectId: string;
  target: FolderTarget;
  status: FolderStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status.ok) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-success">
        <CheckCircle2 className="size-4" />
        생성됨
      </span>
    );
  }

  return (
    <div className="flex max-w-56 flex-col items-start gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-sm text-destructive">
        <XCircle className="size-4" />
        실패
      </span>
      <span className="text-xs whitespace-normal text-muted-foreground">
        {error ?? status.error}
      </span>
      <Hint label="같은 이름의 폴더를 다시 만들어 봐요 (기존 파일은 건드리지 않아요)">
        <Button
          size="xs"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await retryFolder(projectId, target);
              setError(result.ok ? null : result.error);
              const label = target === "obsidian" ? "옵시디언" : "드라이브";
              if (result.ok) toast.success(`${label} 폴더를 만들었어요`);
              else toast.error(`${label} 폴더를 또 만들지 못했어요`, { description: result.error });
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <RotateCw />}
          {pending ? "다시 시도 중…" : "다시 시도"}
        </Button>
      </Hint>
    </div>
  );
}

async function openWithToast(id: string, target: FolderTarget | "ai") {
  const result = await openFolder(id, target);
  if (!result.ok)
    toast.error("폴더를 열지 못했어요", {
      description: `${result.error} 설정의 경로와 구글 드라이브 앱이 켜져 있는지 확인해 주세요.`,
    });
}

function AiDocsCell({ project }: { project: ProjectRow }) {
  if (project.aiDocCount === null)
    return <span className="text-xs text-muted-foreground">—</span>;
  if (project.aiDocCount === 0)
    return (
      <Hint label="아래 ‘AI 글쓰기 방법’을 따라 하면 여기에 개수가 늘어나요">
        <span className="cursor-help text-sm text-muted-foreground">0개</span>
      </Hint>
    );
  return (
    <Hint label="탐색기에서 AI 작성글 폴더 열기">
      <Button size="xs" variant="secondary" onClick={() => openWithToast(project.id, "ai")}>
        <FileText />
        {project.aiDocCount}개
      </Button>
    </Hint>
  );
}

function Shortcuts({ project }: { project: Project }) {
  const notePath = project.obsidian.path
    ? `${project.obsidian.path}\\${OVERVIEW_NOTE}`
    : null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {project.obsidian.ok && notePath && (
        <Hint label="옵시디언 앱에서 개요 노트 열기">
          <a
            href={`obsidian://open?path=${encodeURIComponent(notePath)}`}
            className={buttonVariants({ size: "xs", variant: "outline" })}
          >
            옵시디언
          </a>
        </Hint>
      )}
      {project.drive.ok && (
        <Hint label="탐색기에서 드라이브 프로젝트 폴더 열기">
          <Button size="xs" variant="outline" onClick={() => openWithToast(project.id, "drive")}>
            드라이브
          </Button>
        </Hint>
      )}
      {!project.obsidian.ok && !project.drive.ok && (
        <span className="text-xs text-muted-foreground">—</span>
      )}
    </div>
  );
}
