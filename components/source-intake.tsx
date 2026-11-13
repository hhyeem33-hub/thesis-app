"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChevronRight,
  Cloud,
  FileSpreadsheet,
  FileUp,
  Folder,
  FolderUp,
  Link2,
  Loader2,
  NotebookText,
  PenLine,
  ScanSearch,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { browseDriveFolder, importDriveFiles, importLink, importObsidian, previewObsidian } from "@/app/intake-actions";
import { AutoClassifyProgress, useAutoClassify } from "@/components/auto-classify";
import { DrivePicker } from "@/components/drive-picker";
import { KciSearch } from "@/components/kci-search";
import { SourceForm } from "@/components/source-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { GoogleConfig } from "@/lib/google";
import { cn } from "@/lib/utils";

type Tab = "kci" | "obsidian" | "drive" | "link" | "list";
const TABS: Tab[] = ["kci", "obsidian", "drive", "link", "list"];
const selectClass =
  "h-8 min-w-56 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** 자료가 들어와서 연구 방향이 정해지기까지 (이 화면은 1단계) */
function FlowRibbon() {
  const steps = [
    { n: 1, title: "자료 모으기", note: "KCI · 옵시디언 · 드라이브 · 링크 · 목록", href: null },
    { n: 2, title: "판단하기", note: "AI 관련도 → 채택·보류·제외", href: "/sources" },
    { n: 3, title: "토픽·방향", note: "토픽 묶기 → 연구 설정·글쓰기", href: "/research" },
  ];
  return (
    <section aria-label="진행 순서" className="rounded-xl border bg-card px-4 py-3">
      <ol className="relative grid gap-3 sm:grid-cols-3 sm:gap-0">
        {/* 세 단계를 잇는 금색 선 */}
        <span aria-hidden className="absolute top-3.5 right-[16%] left-[16%] hidden h-px bg-gold/60 sm:block" />
        {steps.map((s) => {
          const current = s.n === 1;
          const body = (
            <>
              <span
                className={cn(
                  "relative z-10 flex size-7 items-center justify-center rounded-full border font-heading text-sm font-bold",
                  current ? "border-primary bg-primary text-primary-foreground" : "border-gold/70 bg-card text-primary"
                )}
              >
                {s.n}
              </span>
              <span className={cn("text-sm font-semibold", current && "text-primary")}>{s.title}</span>
              <span className="text-xs text-muted-foreground">{s.note}</span>
            </>
          );
          return (
            <li key={s.n} className="flex flex-col items-start gap-1 sm:items-center sm:text-center">
              {s.href ? (
                <Link href={s.href} className="flex flex-col items-start gap-1 rounded-md hover:opacity-80 sm:items-center">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function SourceIntake({
  projects,
  hasKey,
  online,
  kci,
  google,
  driveFolder,
}: {
  projects: { id: string; name: string }[];
  hasKey: boolean;
  online: boolean;
  kci: { apiReady: boolean; saved: string[] };
  google: GoogleConfig;
  /** 내 컴퓨터의 구글 드라이브 폴더가 있는지 */
  driveFolder: boolean;
}) {
  const asked = useSearchParams().get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(asked && TABS.includes(asked) ? asked : "kci");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const { run, progress } = useAutoClassify();
  // 들어온 자료는 모두 바로 판단한다 (키가 없는 온라인 계정은 규칙 기반)
  const afterAdd = (ids: string[]) => {
    if (hasKey && ids.length) void run(ids);
  };

  const methods: { id: Tab; label: string; hint: string; icon: React.ReactNode; off?: string }[] = [
    { id: "kci", label: "KCI 검색", hint: "국내 학술지 논문", icon: <ScanSearch /> },
    { id: "obsidian", label: "Obsidian 가져오기", hint: "보관함 스크랩 노트", icon: <NotebookText />, off: online ? "내 컴퓨터" : undefined },
    { id: "drive", label: "Google Drive", hint: "PDF · Word · HWP", icon: <Cloud /> },
    { id: "link", label: "링크 (유튜브)", hint: "영상 자막 · 웹 본문", icon: <Link2 /> },
    { id: "list", label: "목록 가져오기", hint: "RISS · KCI 엑셀 · CSV", icon: <FileSpreadsheet /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <FlowRibbon />
      <p className="inline-flex items-start gap-2 text-sm text-muted-foreground">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-gold" />
        <span>
          받는 즉시 AI가{" "}
          <Link href="/research" className="underline underline-offset-2">
            연구 설정
          </Link>{" "}
          기준으로 관련도를 매깁니다.
          {!hasKey && (
            <>
              {" "}지금은 AI 키가 없어서 판단하지 않아요 —{" "}
              <Link href="/settings" className="font-medium text-foreground underline">
                API 키 넣기
              </Link>
            </>
          )}
        </span>
      </p>

      <div className="grid gap-4 md:grid-cols-[13rem_minmax(0,1fr)]">
        {/* 가져오는 방법: 세로 목록 (좁은 화면에서는 옆으로 밀어 보기) */}
        <nav aria-label="자료를 가져오는 방법" role="tablist" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {methods.map((m) => {
            const active = tab === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(m.id)}
                className={cn(
                  "flex min-w-40 items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-left text-sm transition-colors md:min-w-0 [&_svg]:size-4 [&_svg]:shrink-0",
                  active
                    ? "border-primary bg-secondary font-semibold"
                    : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                )}
              >
                <span className={active ? "text-primary" : ""}>{m.icon}</span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{m.label}</span>
                  <span className="truncate text-[11px] font-normal text-muted-foreground">
                    {m.hint}
                    {m.off && ` · ${m.off}에서만`}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-col gap-3">
          {tab !== "kci" && (
            <label className="inline-flex flex-wrap items-center gap-2 text-sm">
              연결할 프로젝트
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={selectClass}>
                <option value="">연결 안 함</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <AutoClassifyProgress progress={progress} />

          {tab === "kci" && (
            <KciSearch
              apiReady={kci.apiReady}
              online={online}
              projects={projects}
              initialSaved={kci.saved}
              onSaved={(id) => afterAdd([id])}
            />
          )}
          {tab === "obsidian" && <ObsidianTab online={online} projectId={projectId} onAdded={afterAdd} />}
          {tab === "drive" && (
            <DriveTab online={online} google={google} driveFolder={driveFolder} projectId={projectId} onAdded={afterAdd} />
          )}
          {tab === "link" && <LinkTab projects={projects} projectId={projectId} hasKey={hasKey} onAdded={afterAdd} />}
          {tab === "list" && <ListTab projectId={projectId} onAdded={afterAdd} />}
        </div>
      </div>
    </div>
  );
}

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

/** Google Drive: 온라인은 구글 로그인 + 파일 선택 창, 내 컴퓨터는 드라이브 데스크톱 앱 폴더에서 바로 고르기 */
function DriveTab({
  online,
  google,
  driveFolder,
  projectId,
  onAdded,
}: {
  online: boolean;
  google: GoogleConfig;
  driveFolder: boolean;
  projectId: string;
  onAdded: (ids: string[]) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Drive에서 가져오기</CardTitle>
        <CardDescription>
          PDF · Word(.docx) · 한글(.hwp · .hwpx) 파일의 글자를 꺼내 자료로 저장해요. 스캔한 이미지 PDF는 글자가 없어서 읽을
          수 없어요.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!online && driveFolder && <LocalDriveBrowser projectId={projectId} onAdded={onAdded} />}
        {(online || google.ready) && (
          <section className="flex flex-col gap-2">
            {!online && <h3 className="text-sm font-semibold">구글 계정으로 고르기</h3>}
            <DrivePicker config={google} projectId={projectId} onAdded={onAdded} />
          </section>
        )}
        {!online && !driveFolder && !google.ready && (
          <p className="rounded-md bg-gold/15 px-3 py-2 text-sm">
            구글 드라이브 데스크톱 앱 폴더를 찾지 못했어요.{" "}
            <Link href="/settings" className="underline">
              설정
            </Link>
            에서 내 드라이브 경로를 확인해 주세요.
          </p>
        )}
        <details className="rounded-lg border border-dashed px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">드라이브에 없는 파일은 내 컴퓨터에서 바로 올리기</summary>
          <div className="mt-3">
            <FileTab projectId={projectId} onAdded={onAdded} />
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

type DriveView = { root: string; rel: string; folders: string[]; files: { name: string; size: number }[] };

function LocalDriveBrowser({ projectId, onAdded }: { projectId: string; onAdded: (ids: string[]) => void }) {
  const [view, setView] = useState<DriveView | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const open = (rel: string) =>
    startTransition(async () => {
      const r = await browseDriveFolder(rel);
      if (!r.ok) {
        toast.error("드라이브 폴더를 열지 못했어요", { description: r.error });
        return;
      }
      setView(r);
      setChecked(new Set());
    });

  const save = () =>
    startTransition(async () => {
      if (!view) return;
      const r = await importDriveFiles(view.rel, [...checked], projectId);
      if (!r.ok) {
        toast.error("가져오지 못했어요", { description: r.error });
        return;
      }
      if (r.added.length) {
        toast.success(`${r.added.length}개를 자료로 저장했어요`, {
          description: r.skipped.length ? `이미 있는 ${r.skipped.length}개는 건너뛰었어요.` : undefined,
        });
        onAdded(r.added);
      } else if (!r.failed.length) toast.info("새로 저장한 자료가 없어요", { description: "모두 이미 있는 자료예요." });
      r.failed.forEach((f) => toast.error(f.name, { description: f.error }));
      setChecked(new Set());
    });

  if (!view)
    return (
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">내 컴퓨터의 구글 드라이브 폴더에서 고르기</h3>
        <p className="text-xs text-muted-foreground">드라이브 데스크톱 앱 폴더를 읽기만 해요. 파일은 옮기거나 바꾸지 않아요.</p>
        <Button variant="outline" className="w-fit" disabled={pending} onClick={() => open("")}>
          {pending ? <Loader2 className="animate-spin" /> : <Folder />}
          내 드라이브 열기
        </Button>
      </section>
    );

  const parts = view.rel ? view.rel.split(/[\\/]/) : [];
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">내 컴퓨터의 구글 드라이브 폴더에서 고르기</h3>
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <button type="button" className="underline-offset-2 hover:underline" onClick={() => open("")}>
          내 드라이브
        </button>
        {parts.map((p, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <ChevronRight className="size-3 text-muted-foreground" />
            <button type="button" className="underline-offset-2 hover:underline" onClick={() => open(parts.slice(0, i + 1).join("/"))}>
              {p}
            </button>
          </span>
        ))}
      </div>
      <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border text-sm">
        {view.rel && (
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-muted-foreground hover:bg-accent/50"
              onClick={() => open(parts.slice(0, -1).join("/"))}
            >
              <FolderUp className="size-4" /> 위 폴더로
            </button>
          </li>
        )}
        {view.folders.map((f) => (
          <li key={`d-${f}`}>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-accent/50"
              onClick={() => open(view.rel ? `${view.rel}/${f}` : f)}
            >
              <Folder className="size-4 text-gold" /> {f}
            </button>
          </li>
        ))}
        {view.files.map((f) => (
          <li key={`f-${f.name}`}>
            <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-accent/50">
              <input
                type="checkbox"
                checked={checked.has(f.name)}
                onChange={(e) => {
                  const next = new Set(checked);
                  if (e.target.checked) next.add(f.name);
                  else next.delete(f.name);
                  setChecked(next);
                }}
              />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground">{kb(f.size)}</span>
            </label>
          </li>
        ))}
        {!view.folders.length && !view.files.length && (
          <li className="px-3 py-3 text-center text-xs text-muted-foreground">이 폴더에는 PDF·Word·한글 파일이 없어요.</li>
        )}
      </ul>
      <Button className="w-fit" disabled={pending || !checked.size} onClick={save}>
        {pending ? <Loader2 className="animate-spin" /> : <Upload />}
        {checked.size ? `${checked.size}개 자료로 저장` : "파일을 골라 주세요"}
      </Button>
    </section>
  );
}

/** 링크(유튜브·웹): 주소 하나로 제목·채널·날짜·자막(또는 본문)을 가져온다 */
function LinkTab({
  projects,
  projectId,
  hasKey,
  onAdded,
}: {
  projects: { id: string; name: string }[];
  projectId: string;
  hasKey: boolean;
  onAdded: (ids: string[]) => void;
}) {
  const [url, setUrl] = useState("");
  const [manual, setManual] = useState(false);
  const [last, setLast] = useState<{ title: string; note?: string; saved: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const isYoutube = /youtu\.?be/.test(url);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    startTransition(async () => {
      const r = await importLink(url, projectId);
      if (!r.ok) {
        toast.error("가져오지 못했어요", { description: r.error });
        return;
      }
      setLast({ title: r.title, note: r.note, saved: r.added.length > 0 });
      if (r.added.length) {
        toast.success("링크 자료를 저장했어요", { description: `${r.title} — ${r.note ?? ""}` });
        onAdded(r.added);
        setUrl("");
      } else toast.info("이미 있는 자료예요", { description: r.title });
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>링크로 가져오기</CardTitle>
        <CardDescription>
          유튜브 주소면 제목 · 채널 · 게시일 · 자막(한국어 우선)을, 일반 웹 주소면 제목 · 본문을 가져와요.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=… 또는 기사·블로그 주소"
            disabled={pending}
            aria-label="가져올 주소"
          />
          <Button type="submit" disabled={pending || !url.trim()} className="shrink-0">
            {pending ? <Loader2 className="animate-spin" /> : <Link2 />}
            {pending ? (isYoutube ? "자막 가져오는 중…" : "본문 가져오는 중…") : "가져오기"}
          </Button>
        </form>
        {last && (
          <p className="text-sm">
            <b>{last.title}</b> — {last.saved ? "저장했어요." : "이미 있는 자료라 건너뛰었어요."}{" "}
            <span className="text-muted-foreground">{last.note}</span>
          </p>
        )}
        <div className="border-t pt-3">
          <Button variant="ghost" size="sm" onClick={() => setManual((m) => !m)}>
            <PenLine />
            {manual ? "직접 입력 닫기" : "주소가 없는 자료는 직접 입력"}
          </Button>
          {manual && (
            <div className="mt-3">
              <SourceForm projects={projects} autoClassify={hasKey} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ObsidianTab({ online, projectId, onAdded }: { online: boolean; projectId: string; onAdded: (ids: string[]) => void }) {
  const [preview, setPreview] = useState<{ vault: string; total: number; fresh: { title: string }[] } | null>(null);
  const [pending, startTransition] = useTransition();
  if (online)
    return (
      <p className="rounded-md bg-gold/15 px-3 py-2 text-sm">
        옵시디언 보관함은 내 컴퓨터에 있어서, 이 기능은 <b>내 컴퓨터에서 앱을 실행할 때만</b> 써요.
      </p>
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>옵시디언 보관함의 스크랩 노트 가져오기</CardTitle>
        <CardDescription>
          보관함의 Clippings 폴더에서 <b>아직 라이브러리에 없는 노트만</b> 가져와요. 같은 글(본문·주소가 같은 사본)은
          하나만 넣고, 보관함 원본은 읽기만 해요. 저자·발행 연도는 노트 머리말에서 채워요.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await previewObsidian();
                if (r.ok) setPreview(r);
                else toast.error("보관함을 읽지 못했어요", { description: r.error });
              })
            }
          >
            {pending && !preview ? <Loader2 className="animate-spin" /> : <NotebookText />}
            새 노트 찾기
          </Button>
          {preview && preview.fresh.length > 0 && (
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await importObsidian(projectId);
                  if (!r.ok) {
                    toast.error("가져오지 못했어요", { description: r.error });
                    return;
                  }
                  toast.success(`새 노트 ${r.added.length}개를 가져왔어요`);
                  setPreview({ ...preview, fresh: [] });
                  onAdded(r.added);
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Upload />}
              {preview.fresh.length}개 가져오기
            </Button>
          )}
        </div>
        {preview && (
          <div className="text-sm">
            <p className="text-muted-foreground">
              보관함 노트 {preview.total}개 중 새 노트 <b className="text-foreground">{preview.fresh.length}</b>개
            </p>
            {preview.fresh.length > 0 && (
              <ul className="mt-2 max-h-48 list-disc overflow-y-auto pl-5 text-xs text-muted-foreground">
                {preview.fresh.slice(0, 50).map((f, i) => (
                  <li key={i}>{f.title}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FileTab({ projectId, onAdded }: { projectId: string; onAdded: (ids: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: string[]; skipped: string[]; failed: { name: string; error: string }[] } | null>(null);

  async function upload(files: FileList) {
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("projectId", projectId);
      for (const f of Array.from(files)) form.append("files", f);
      const res = await fetch("/api/sources/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        toast.error("올리지 못했어요", { description: data.error });
        return;
      }
      setResult(data);
      if (data.added.length) {
        toast.success(`${data.added.length}개 파일을 자료로 저장했어요`);
        onAdded(data.added);
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>파일 올리기</CardTitle>
        <CardDescription>
          PDF·Word(.docx)·한글(.hwp·.hwpx)·txt·md 파일에서 글자를 꺼내 자료로 저장해요. 여러 개를 한꺼번에 골라도
          돼요. (스캔한 이미지 PDF와 .doc 는 글자를 꺼낼 수 없어요)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <input
          ref={input}
          type="file"
          multiple
          accept=".pdf,.docx,.hwp,.hwpx,.txt,.md"
          className="hidden"
          onChange={(e) => e.target.files?.length && upload(e.target.files)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
          }}
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-sm text-muted-foreground hover:bg-accent/40"
        >
          {busy ? <Loader2 className="size-6 animate-spin" /> : <FileUp className="size-6" />}
          {busy ? "글자를 꺼내는 중…" : "여기를 눌러 파일을 고르거나, 파일을 끌어다 놓으세요"}
        </button>
        {result && (
          <div className="text-sm">
            <p>
              저장 {result.added.length}개 · 이미 있어 건너뜀 {result.skipped.length}개 · 실패 {result.failed.length}개
            </p>
            {result.failed.map((f) => (
              <p key={f.name} className="text-xs text-destructive">
                {f.name}: {f.error}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ListTab({ projectId, onAdded }: { projectId: string; onAdded: (ids: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    total: number;
    columns: string[];
    ignored: string[];
    preview: { title: string; authors?: string; year?: string; origin: string }[];
  } | null>(null);

  async function send(f: File, mode: "preview" | "import") {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", f);
      form.append("mode", mode);
      form.append("projectId", projectId);
      const res = await fetch("/api/sources/list", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        toast.error("목록을 읽지 못했어요", { description: data.error });
        if (mode === "preview") setPreview(null);
        return;
      }
      if (mode === "preview") setPreview(data);
      else {
        toast.success(`${data.added.length}개를 저장했어요`, {
          description: data.skipped.length ? `이미 있는 ${data.skipped.length}개는 건너뛰었어요.` : undefined,
        });
        setPreview(null);
        setFile(null);
        onAdded(data.added);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>목록 가져오기 (엑셀·CSV)</CardTitle>
        <CardDescription>
          RISS · KCI에서 내려받은 엑셀(.xlsx)이나 CSV를 그대로 올리면 논문명 · 저자 · 학술지 · 발행년도 · 권호 · 초록을
          읽어요. 직접 만든 목록이면 첫 줄에 <b>제목</b>(꼭 필요) · 저자 · 연도 · 학술지 · 권 · 호 · 쪽 · 출판사 · 출처 · 초록을
          적어 주세요. <b>DOI · KCI 논문 ID · 제목+연도</b>가 같은 자료는 건너뛰어요.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <input
          ref={input}
          type="file"
          accept=".xlsx,.csv,.tsv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setFile(f);
              void send(f, "preview");
            }
            e.target.value = "";
          }}
        />
        <Button variant="outline" className="w-fit" disabled={busy} onClick={() => input.current?.click()}>
          {busy && !preview ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
          엑셀·CSV 파일 고르기
        </Button>
        {!preview && (
          <div className="grid gap-3 sm:grid-cols-2">
            <HowTo
              title="RISS에서 엑셀 받는 법"
              steps={[
                <>riss.kr 에서 검색 → <b>국내학술논문</b> 탭</>,
                <>필요한 논문에 체크 → <b>내보내기</b> → <b>엑셀</b></>,
                <>받은 .xlsx 파일을 위 버튼으로 올리기</>,
              ]}
            />
            <HowTo
              title="KCI에서 받는 법"
              steps={[
                <>kci.go.kr 에서 논문 검색</>,
                <>결과에서 논문 체크 → <b>엑셀 저장</b>(또는 CSV)</>,
                <>받은 파일을 위 버튼으로 올리기</>,
              ]}
            />
          </div>
        )}
        {preview && file && (
          <div className="flex flex-col gap-2 text-sm">
            <p>
              <b>{file.name}</b> · 자료 {preview.total}개 · 읽은 칸: {preview.columns.join(", ")}
              {preview.ignored.length > 0 && <span className="text-muted-foreground"> · 모르는 칸(무시): {preview.ignored.join(", ")}</span>}
            </p>
            <ul className="divide-y rounded-lg border text-xs">
              {preview.preview.map((r, i) => (
                <li key={i} className="px-3 py-1.5">
                  <span className="font-medium">{r.title}</span>{" "}
                  <span className="text-muted-foreground">
                    {r.authors || "저자 미상"} · {r.year || "연도 미상"}
                  </span>
                </li>
              ))}
            </ul>
            <Button className="w-fit" disabled={busy} onClick={() => send(file, "import")}>
              {busy ? <Loader2 className="animate-spin" /> : <Upload />}
              {preview.total}개 라이브러리에 저장
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** 다른 사이트에서 파일 받는 순서 (작은 번호 목록) */
function HowTo({ title, steps }: { title: string; steps: React.ReactNode[] }) {
  return (
    <div className="rounded-lg bg-secondary/60 p-3 text-sm">
      <p className="mb-2 font-semibold">{title}</p>
      <ol className="flex flex-col gap-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-gold/70 text-[11px] font-bold text-primary">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
