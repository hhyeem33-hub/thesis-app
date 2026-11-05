"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookMarked,
  Copy,
  Eye,
  FileDown,
  History,
  Library,
  Loader2,
  PenLine,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { fetchVersion, restoreVersion, saveDocument } from "@/app/write-actions";
import { HwpxExport, type TemplateInfo } from "@/components/hwpx-export";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  buildReferences,
  countChars,
  footnoteCitation,
  footnoteNumbers,
  manuscriptToDoc,
  MARK_RE,
  NEED,
  newFootnoteId,
} from "@/lib/bib";
import type { AiDraftRecord, Bib, DocVersion, Footnote, Source, ThesisDoc } from "@/lib/types";
import { cn } from "@/lib/utils";

export type LibrarySource = Pick<Source, "id" | "title" | "origin" | "type"> & { bib?: Bib | null };
type VersionInfo = Omit<DocVersion, "doc">;
type Tab = "footnotes" | "references" | "history" | "drafts" | "export";

const when = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });

/** [보완 필요] 자리를 금색으로 */
function Need({ text }: { text: string }) {
  return text.split(/(\[보완 필요\])/g).map((part, i) =>
    part === NEED ? (
      <mark key={i} className="rounded bg-gold/25 px-0.5 font-medium text-foreground">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

/** 본문 미리보기: 1. / 1.1. / 1.1.1 번호, 각주 위첨자 */
function Preview({ doc, references }: { doc: Pick<ThesisDoc, "title" | "body" | "footnotes">; references: string[] }) {
  const numbers = footnoteNumbers(doc.body);
  const fnText = new Map(doc.footnotes.map((f) => [f.id, f.text]));
  const blocks = doc.body.split(/\n\s*\n|\n(?=#{1,3}\s)/).map((b) => b.trim()).filter(Boolean);
  const count = [0, 0, 0];
  const withMarks = (t: string) =>
    t.split(MARK_RE).map((part, i) =>
      i % 2 === 1 ? (
        <sup key={i} className="mx-px font-semibold text-primary">
          {numbers.get(part)}
        </sup>
      ) : (
        part
      )
    );
  return (
    <article className="flex flex-col gap-3 font-serif text-[15px] leading-8">
      <h2 className="text-center font-heading text-xl font-bold">{doc.title || "(제목 없음)"}</h2>
      {blocks.map((b, i) => {
        const h = b.match(/^(#{1,3})\s+(.+)$/);
        if (h && !b.includes("\n")) {
          const level = h[1].length - 1;
          count[level]++;
          for (let k = level + 1; k < 3; k++) count[k] = 0;
          const num = count.slice(0, level + 1).join(".") + (level < 2 ? "." : "");
          return (
            <p key={i} className={cn("font-heading font-bold", level === 0 ? "mt-4 text-lg" : "mt-2")}>
              {num} {h[2]}
            </p>
          );
        }
        return (
          <p key={i} className="indent-4">
            {withMarks(b.replace(/\n/g, " "))}
          </p>
        );
      })}
      {numbers.size > 0 && (
        <ol className="mt-4 flex flex-col gap-1 border-t pt-3 font-sans text-xs leading-5 text-muted-foreground">
          {[...numbers].map(([id, n]) => (
            <li key={id}>
              <sup>{n}</sup> <Need text={fnText.get(id) || NEED} />
            </li>
          ))}
        </ol>
      )}
      {references.length > 0 && (
        <section className="mt-4">
          <p className="text-center font-heading font-bold">참고문헌</p>
          {references.map((r, i) => (
            <p key={i} className="pl-6 -indent-6 text-sm leading-6">
              <Need text={r} />
            </p>
          ))}
        </section>
      )}
    </article>
  );
}

export function WriteEditor({
  initialDoc,
  sources,
  initialVersions,
  drafts,
  templates,
  online,
}: {
  initialDoc: ThesisDoc;
  sources: LibrarySource[];
  initialVersions: VersionInfo[];
  drafts: AiDraftRecord[];
  templates: TemplateInfo[];
  online: boolean;
}) {
  const router = useRouter();
  const [doc, setDoc] = useState(initialDoc);
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(initialDoc));
  const [versions, setVersions] = useState(initialVersions);
  const [memo, setMemo] = useState("");
  const [tab, setTab] = useState<Tab>("footnotes");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [picker, setPicker] = useState<{ footnoteId: string | null } | null>(null);
  const [viewing, setViewing] = useState<DocVersion | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<VersionInfo | null>(null);
  const focusFn = useRef<string | null>(null);
  const [pending, startTransition] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);

  const dirty = JSON.stringify(doc) !== savedSnapshot;
  const numbers = useMemo(() => footnoteNumbers(doc.body), [doc.body]);
  const references = useMemo(() => buildReferences(doc, sources), [doc, sources]);
  const chars = countChars(doc.body);
  const usedFns = [...numbers.keys()].map((id) => doc.footnotes.find((f) => f.id === id)).filter(Boolean) as Footnote[];
  const orphanFns = doc.footnotes.filter((f) => !numbers.has(f.id));
  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  // 저장 안 한 채 나가려 하면 묻기
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // 방금 단 각주 입력칸으로
  useEffect(() => {
    if (!focusFn.current) return;
    document.getElementById(`fn-${focusFn.current}`)?.focus();
    focusFn.current = null;
  }, [doc.footnotes, tab]);

  const update = (patch: Partial<ThesisDoc>) => setDoc((d) => ({ ...d, ...patch }));
  const setFootnote = (id: string, patch: Partial<Footnote>) =>
    setDoc((d) => ({ ...d, footnotes: d.footnotes.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));

  /** 선택한 글자 뒤(또는 커서 자리)에 각주 표시를 넣는다 */
  function addFootnote(source?: LibrarySource) {
    const el = area.current;
    if (mode !== "edit" || !el) {
      toast.info("편집 화면에서 각주를 달 글자를 먼저 선택해 주세요.");
      setMode("edit");
      return;
    }
    const at = el.selectionEnd ?? doc.body.length;
    const id = newFootnoteId();
    const body = `${doc.body.slice(0, at)}[^${id}]${doc.body.slice(at)}`;
    setDoc((d) => ({
      ...d,
      body,
      footnotes: [...d.footnotes, { id, text: source ? footnoteCitation(source) : "", sourceId: source?.id ?? null }],
    }));
    setTab("footnotes");
    if (source)
      requestAnimationFrame(() => {
        el.focus();
        const pos = at + id.length + 3;
        el.setSelectionRange(pos, pos);
      });
    else focusFn.current = id;
  }

  function insertLine(prefix: string, placeholder: string) {
    const el = area.current;
    if (!el) return;
    const at = el.selectionStart ?? doc.body.length;
    const before = doc.body.slice(0, at);
    const gap = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const text = `${gap}${prefix} ${placeholder}\n\n`;
    update({ body: before + text + doc.body.slice(at) });
    requestAnimationFrame(() => {
      el.focus();
      const s = at + gap.length + prefix.length + 1;
      el.setSelectionRange(s, s + placeholder.length);
    });
  }

  function removeFootnote(id: string) {
    setDoc((d) => ({
      ...d,
      body: d.body.replaceAll(`[^${id}]`, ""),
      footnotes: d.footnotes.filter((f) => f.id !== id),
    }));
  }

  function save() {
    if (pending) return;
    startTransition(async () => {
      const r = await saveDocument({ doc, memo });
      if (!r.ok) {
        toast.error("저장하지 못했어요", { description: r.error });
        return;
      }
      setSavedSnapshot(JSON.stringify(doc));
      setVersions((v) => [r.version, ...v]);
      setMemo("");
      toast.success("저장했어요", { description: `히스토리에 기록됨 · ${r.version.chars.toLocaleString()}자` });
    });
  }

  // Ctrl+S 로 저장
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function view(v: VersionInfo) {
    startTransition(async () => {
      const r = await fetchVersion(v.id);
      if (r.ok) setViewing(r.version);
      else toast.error("버전을 열지 못했어요", { description: r.error });
    });
  }

  function restore(v: VersionInfo) {
    startTransition(async () => {
      const r = await restoreVersion(v.id);
      setConfirmRestore(null);
      if (!r.ok) {
        toast.error("되돌리지 못했어요", { description: r.error });
        return;
      }
      setDoc(r.doc);
      setSavedSnapshot(JSON.stringify(r.doc));
      setVersions((list) => [r.version, ...list]);
      setViewing(null);
      toast.success("예전 버전으로 되돌렸어요", { description: "되돌린 내용도 새 버전으로 기록했어요." });
    });
  }

  function loadDraft(d: AiDraftRecord, how: "append" | "replace") {
    const { title, body, footnotes } = manuscriptToDoc(d.manuscript);
    setDoc((cur) =>
      how === "replace" || !cur.body.trim()
        ? { ...cur, title: cur.title || title, body, footnotes }
        : { ...cur, body: `${cur.body.trimEnd()}\n\n${body}`, footnotes: [...cur.footnotes, ...footnotes] }
    );
    setMode("edit");
    toast.success(how === "replace" ? "AI 초안으로 바꿨어요" : "AI 초안을 본문 뒤에 붙였어요", {
      description: "저장 버튼을 눌러야 기록돼요.",
    });
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "footnotes", label: "각주", icon: <StickyNote />, badge: numbers.size },
    { id: "references", label: "참고문헌", icon: <BookMarked />, badge: references.length },
    { id: "history", label: "히스토리", icon: <History />, badge: versions.length },
    { id: "drafts", label: "AI 초안", icon: <Sparkles /> },
    { id: "export", label: "HWPX", icon: <FileDown /> },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      {/* ── 왼쪽: 원고 ── */}
      <div className="flex min-w-0 flex-col gap-3">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <Input
              value={doc.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="논문 제목"
              aria-label="논문 제목"
              className="h-10 font-heading text-lg"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={doc.author}
                onChange={(e) => update({ author: e.target.value })}
                placeholder="이름 (예: 홍길동)"
                aria-label="이름"
              />
              <Input
                value={doc.affiliation}
                onChange={(e) => update({ affiliation: e.target.value })}
                placeholder="소속 (예: 한국외국어대학교 대학원 ○○학과 석사과정)"
                aria-label="소속"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="mr-1 inline-flex rounded-lg border p-0.5">
            <Button size="sm" variant={mode === "edit" ? "secondary" : "ghost"} onClick={() => setMode("edit")}>
              <PenLine />
              편집
            </Button>
            <Button size="sm" variant={mode === "preview" ? "secondary" : "ghost"} onClick={() => setMode("preview")}>
              <Eye />
              미리보기
            </Button>
          </div>
          {mode === "edit" && (
            <>
              <Hint label="줄 맨 앞의 # 하나가 장(1.)이 돼요">
                <Button size="sm" variant="outline" onClick={() => insertLine("#", "장 제목")}>
                  장
                </Button>
              </Hint>
              <Hint label="## 는 절(1.1.)이 돼요">
                <Button size="sm" variant="outline" onClick={() => insertLine("##", "절 제목")}>
                  절
                </Button>
              </Hint>
              <Hint label="### 는 목(1.1.1)이 돼요">
                <Button size="sm" variant="outline" onClick={() => insertLine("###", "목 제목")}>
                  목
                </Button>
              </Hint>
              <Hint label="본문에서 글자를 선택하고 누르면 그 뒤에 각주 번호가 붙어요">
                <Button size="sm" onClick={() => addFootnote()}>
                  <StickyNote />
                  각주 달기
                </Button>
              </Hint>
              <Hint label="라이브러리 자료를 골라 출처 각주를 달아요">
                <Button size="sm" variant="outline" onClick={() => setPicker({ footnoteId: null })}>
                  <Library />
                  자료로 각주
                </Button>
              </Hint>
            </>
          )}
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {chars.toLocaleString()}자 · 각주 {numbers.size}개
          </span>
        </div>

        <Card className="min-w-0">
          <CardContent>
            {mode === "edit" ? (
              <Textarea
                ref={area}
                value={doc.body}
                onChange={(e) => update({ body: e.target.value })}
                rows={26}
                spellCheck={false}
                aria-label="논문 본문"
                placeholder={
                  "# 서론\n\n여기에 본문을 써요. 문단은 빈 줄로 나눠요.\n\n## 연구 목적\n\n글자를 선택하고 ‘각주 달기’를 누르면 [^…] 표시가 붙고, 오른쪽에 각주 내용을 적을 수 있어요."
                }
                className="min-h-[60vh] resize-y font-serif text-[15px] leading-8"
              />
            ) : (
              <div className="min-h-[60vh] px-2 py-1">
                <Preview doc={doc} references={references.map((r) => r.text)} />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-background/95 p-3 backdrop-blur">
          <Input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={100}
            placeholder="한 줄 메모 (예: 2장 선행연구 정리)"
            aria-label="저장 메모"
            className="min-w-48 flex-1"
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
          <Hint label="저장할 때마다 히스토리에 버전이 기록돼요 (Ctrl+S)">
            <Button onClick={save} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />}
              저장
            </Button>
          </Hint>
          <span className={cn("text-xs", dirty ? "text-primary" : "text-muted-foreground")}>
            {dirty ? "● 저장 안 된 변경이 있어요" : versions[0] ? `마지막 저장 ${when(versions[0].savedAt)}` : "아직 저장 전"}
          </span>
        </div>
      </div>

      {/* ── 오른쪽: 각주 · 참고문헌 · 히스토리 · AI 초안 · HWPX ── */}
      <Card className="h-fit xl:sticky xl:top-4">
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1" role="tablist">
            {tabs.map((t) => (
              <Button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                size="sm"
                variant={tab === t.id ? "secondary" : "ghost"}
                onClick={() => setTab(t.id)}
              >
                {t.icon}
                {t.label}
                {!!t.badge && <span className="text-xs text-muted-foreground tabular-nums">{t.badge}</span>}
              </Button>
            ))}
          </div>

          {tab === "footnotes" && (
            <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
              {usedFns.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  본문에서 글자를 선택하고 <b>각주 달기</b>를 누르면 여기에 1, 2, 3… 각주가 생겨요.
                </p>
              )}
              {usedFns.map((f) => {
                const src = f.sourceId ? sourceById.get(f.sourceId) : null;
                return (
                  <div key={f.id} className="flex flex-col gap-1.5 rounded-lg border p-2.5">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold text-primary tabular-nums">{numbers.get(f.id)}</span>
                      {src ? (
                        <Link href={`/sources/${src.id}`} className="truncate text-xs text-muted-foreground underline">
                          출처: {src.title}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">직접 쓴 각주</span>
                      )}
                      <div className="ml-auto flex gap-1">
                        <Hint label="라이브러리 자료를 출처로 연결">
                          <Button size="icon-xs" variant="ghost" onClick={() => setPicker({ footnoteId: f.id })} aria-label="자료 연결">
                            <Library />
                          </Button>
                        </Hint>
                        <Hint label="각주와 본문 표시를 함께 지워요">
                          <Button size="icon-xs" variant="ghost" onClick={() => removeFootnote(f.id)} aria-label="각주 지우기">
                            <Trash2 />
                          </Button>
                        </Hint>
                      </div>
                    </div>
                    <Textarea
                      id={`fn-${f.id}`}
                      value={f.text}
                      rows={2}
                      onChange={(e) => setFootnote(f.id, { text: e.target.value })}
                      placeholder="각주 내용 (예: 홍길동(2024:15) 참고.)"
                      className="min-h-14 text-sm"
                    />
                  </div>
                );
              })}
              {orphanFns.length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground">
                  <p>본문에서 표시가 지워진 각주 {orphanFns.length}개 (HWPX·참고문헌에 안 들어가요)</p>
                  {orphanFns.map((f) => (
                    <div key={f.id} className="flex items-center gap-2">
                      <span className="truncate">{f.text || "(빈 각주)"}</span>
                      <Button size="xs" variant="ghost" className="ml-auto" onClick={() => removeFootnote(f.id)}>
                        지우기
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "references" && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                라이브러리 자료로 단 각주가 자동으로 모여요. 외대 양식(국문 「논문」 『책·학술지』, 한국어 → 중국어 →
                영어 순)으로 정리하고, 모르는 서지 정보는 <Need text={NEED} />로 표시해요. 자료 제목을 눌러 서지
                정보를 채우면 바로 반영돼요.
              </p>
              {references.length === 0 ? (
                <p className="text-sm text-muted-foreground">아직 출처 각주가 없어요. ‘자료로 각주’를 써 보세요.</p>
              ) : (
                <ol className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto text-sm">
                  {references.map((r) => (
                    <li key={r.id} className="pl-5 -indent-5 leading-6">
                      <Link href={`/sources/${r.id}`} className="hover:underline">
                        <Need text={r.text} />
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
              {references.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-fit"
                  onClick={async () => {
                    await navigator.clipboard.writeText(references.map((r) => r.text).join("\n"));
                    toast.success("참고문헌을 복사했어요");
                  }}
                >
                  <Copy />
                  목록 복사
                </Button>
              )}
            </div>
          )}

          {tab === "history" && (
            <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
              {versions.length === 0 && (
                <p className="text-sm text-muted-foreground">저장 버튼을 누를 때마다 여기에 버전이 기록돼요.</p>
              )}
              {versions.map((v, i) => (
                <div key={v.id} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-medium">
                      {when(v.savedAt)}
                      {i === 0 && <span className="rounded bg-secondary px-1.5 text-xs">최신</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {v.chars.toLocaleString()}자 · {v.memo || "메모 없음"}
                    </p>
                  </div>
                  <Button size="xs" variant="outline" onClick={() => view(v)} disabled={pending}>
                    보기
                  </Button>
                  {i > 0 && (
                    <Button size="xs" variant="ghost" onClick={() => setConfirmRestore(v)} disabled={pending}>
                      <RotateCcw />
                      되돌리기
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === "drafts" && (
            <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
              <p className="text-xs text-muted-foreground">
                ‘AI로 초안 쓰기’로 만든 초안을 불러와 이어 쓸 수 있어요. 불러온 뒤 저장해야 기록돼요.
              </p>
              {drafts.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  아직 불러올 초안이 없어요.{" "}
                  <Link href="/projects" className="underline">
                    프로젝트 화면
                  </Link>
                  의 ‘AI로 초안 쓰기’로 먼저 만들어 주세요.
                </p>
              )}
              {drafts.map((d) => (
                <div key={d.id} className="flex flex-col gap-1.5 rounded-lg border p-2.5 text-sm">
                  <p className="font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {when(d.createdAt)} · 주제: {d.topic}
                  </p>
                  <div className="flex gap-1.5">
                    <Button size="xs" variant="outline" onClick={() => loadDraft(d, "append")}>
                      본문 뒤에 붙이기
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        if (!doc.body.trim() || window.confirm("지금 본문을 이 초안으로 바꿀까요? (저장 전이라면 히스토리에서 되돌릴 수 없어요)"))
                          loadDraft(d, "replace");
                      }}
                    >
                      본문을 이걸로 바꾸기
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "export" && (
            <HwpxExport
              projectId={doc.projectId}
              templates={templates}
              online={online}
              dirty={dirty}
              onTemplatesChange={() => router.refresh()}
            />
          )}
        </CardContent>
      </Card>

      <SourcePicker
        open={!!picker}
        sources={sources}
        onClose={() => setPicker(null)}
        onPick={(s) => {
          if (picker?.footnoteId) setFootnote(picker.footnoteId, { sourceId: s.id, text: footnoteCitation(s) });
          else addFootnote(s);
          setPicker(null);
        }}
      />

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>{when(viewing.savedAt)} 버전</DialogTitle>
                <DialogDescription>
                  {viewing.chars.toLocaleString()}자 · {viewing.memo || "메모 없음"} — 읽기 전용이에요.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border bg-card p-4">
                <Preview doc={viewing.doc} references={buildReferences(viewing.doc, sources).map((r) => r.text)} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setViewing(null)}>
                  닫기
                </Button>
                <Button onClick={() => setConfirmRestore(versions.find((v) => v.id === viewing.id) ?? null)}>
                  <RotateCcw />이 버전으로 되돌리기
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmRestore} onOpenChange={(o) => !o && setConfirmRestore(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>이 버전으로 되돌릴까요?</DialogTitle>
            <DialogDescription>
              {confirmRestore && when(confirmRestore.savedAt)} 버전의 내용이 지금 원고가 되고, 새 버전으로 기록돼요.
              지금까지의 기록은 지워지지 않아요.
              {dirty && " 저장하지 않은 변경은 사라져요."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRestore(null)}>
              취소
            </Button>
            <Button onClick={() => confirmRestore && restore(confirmRestore)} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              되돌리기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SourcePicker({
  open,
  sources,
  onClose,
  onPick,
}: {
  open: boolean;
  sources: LibrarySource[];
  onClose: () => void;
  onPick: (s: LibrarySource) => void;
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    const list = k
      ? sources.filter((s) => `${s.title} ${s.bib?.authors ?? ""} ${s.origin}`.toLowerCase().includes(k))
      : sources;
    return list.slice(0, 80);
  }, [q, sources]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>출처로 쓸 자료 고르기</DialogTitle>
          <DialogDescription>고른 자료는 각주에 출처로 들어가고, 참고문헌 목록에 자동으로 모여요.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목·저자로 찾기" className="pl-8" autoFocus />
        </div>
        <ul className="flex max-h-[50vh] flex-col divide-y overflow-y-auto text-sm">
          {shown.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onPick(s)}
                className="flex w-full flex-col items-start gap-0.5 px-1 py-2 text-left hover:bg-accent"
              >
                <span className="font-medium">
                  {s.bib?.category && (
                    <span className="mr-1.5 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
                      {s.bib.category}
                    </span>
                  )}
                  {s.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {s.bib?.authors || "저자 [보완 필요]"} · {s.bib?.year || "연도 [보완 필요]"}
                </span>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="py-6 text-center text-muted-foreground">맞는 자료가 없어요.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
