"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { FileSpreadsheet, FileUp, Loader2, NotebookText, PenLine, ScanSearch, Upload } from "lucide-react";
import { toast } from "sonner";
import { importObsidian, previewObsidian } from "@/app/intake-actions";
import { AutoClassifyProgress, useAutoClassify } from "@/components/auto-classify";
import { KciSearch } from "@/components/kci-search";
import { SourceForm } from "@/components/source-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tab = "manual" | "kci" | "obsidian" | "file" | "list";
const selectClass =
  "h-8 min-w-56 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function SourceIntake({
  projects,
  hasKey,
  online,
  kci,
}: {
  projects: { id: string; name: string }[];
  hasKey: boolean;
  online: boolean;
  kci: { apiReady: boolean; saved: string[] };
}) {
  const [tab, setTab] = useState<Tab>("manual");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [auto, setAuto] = useState(hasKey);
  const { run, progress } = useAutoClassify();
  const afterAdd = (ids: string[]) => {
    if (auto && hasKey && ids.length) void run(ids);
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode; off?: string }[] = [
    { id: "manual", label: "직접 입력", icon: <PenLine /> },
    { id: "kci", label: "KCI 검색", icon: <ScanSearch /> },
    { id: "obsidian", label: "옵시디언 가져오기", icon: <NotebookText />, off: online ? "내 컴퓨터에서만" : undefined },
    { id: "file", label: "파일 올리기", icon: <FileUp /> },
    { id: "list", label: "목록 가져오기", icon: <FileSpreadsheet /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1 rounded-xl border p-1" role="tablist" aria-label="자료 수집 방법">
        {tabs.map((t) => (
          <Button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            variant={tab === t.id ? "secondary" : "ghost"}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            {t.label}
            {t.off && <span className="text-xs text-muted-foreground">({t.off})</span>}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {tab !== "manual" && tab !== "kci" && (
          <label className="inline-flex items-center gap-2">
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
        <label className={cn("inline-flex items-center gap-2", !hasKey && "text-muted-foreground")}>
          <input type="checkbox" checked={auto && hasKey} disabled={!hasKey} onChange={(e) => setAuto(e.target.checked)} />
          들어오면 바로 AI 판단 (연구 설정 기준)
          {!hasKey && (
            <Link href="/settings" className="text-xs underline">
              API 키 넣기
            </Link>
          )}
        </label>
      </div>

      <AutoClassifyProgress progress={progress} />

      {tab === "manual" && <SourceForm projects={projects} autoClassify={auto && hasKey} />}
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
      {tab === "file" && <FileTab projectId={projectId} onAdded={afterAdd} />}
      {tab === "list" && <ListTab projectId={projectId} onAdded={afterAdd} />}
    </div>
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
          PDF·Word(.docx)·txt·md 파일에서 글자를 꺼내 자료로 저장해요. 여러 개를 한꺼번에 골라도 돼요. (스캔한 이미지 PDF와
          .hwp·.doc 는 글자를 꺼낼 수 없어요)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <input
          ref={input}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md"
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
          첫 줄에 머리글을 쓰고 둘째 줄부터 자료를 적은 .xlsx·.csv 파일을 올려요. 쓸 수 있는 머리글: <b>제목</b>(꼭 필요),
          저자, 연도, 학술지, 권, 호, 쪽, 출판사, 출처(주소), 내용(초록), 유형, 분류. 제목·주소가 같은 자료는 건너뛰어요.
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
