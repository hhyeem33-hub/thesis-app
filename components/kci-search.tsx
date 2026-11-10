"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardPaste, ExternalLink, Loader2, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { lookupKci, saveKciBatch, saveKciToLibrary, searchKci } from "@/app/kci-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { KciArticle } from "@/lib/types";
import { cn } from "@/lib/utils";

const EMPTY: KciArticle = {
  kciId: "",
  title: "",
  authors: "",
  journal: "",
  year: "",
  volume: "",
  issue: "",
  pages: "",
  publisher: "",
  doi: "",
  keywords: "",
  abstract: "",
  url: "",
};
/** 한꺼번에 저장할 수 있는 최대 개수 (서버도 같은 값으로 막음) */
const BATCH_MAX = 50;
/** KCI 검색 한 번에 가져오는 결과 수 (lib/kci.ts 의 KCI_PAGE_SIZE 와 같게) */
const KCI_PAGE_SIZE = 50;
const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function KciSearch({
  apiReady,
  online,
  projects,
  initialSaved,
  onSaved,
}: {
  /** 키가 있고 내 컴퓨터일 때 true → Open API 검색 */
  apiReady: boolean;
  online: boolean;
  projects: { id: string; name: string }[];
  initialSaved: string[];
  /** 새로 저장했을 때 (예: 바로 AI 판단) */
  onSaved?: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KciArticle[] | null>(null);
  const [total, setTotal] = useState(0);
  const [link, setLink] = useState("");
  const [form, setForm] = useState<KciArticle>(EMPTY);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [saved, setSaved] = useState(new Set(initialSaved));
  const [busy, setBusy] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [recent, setRecent] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const kciForm = useRef<HTMLFormElement>(null);
  const formCard = useRef<HTMLDivElement>(null);

  const set = (k: keyof KciArticle) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    if (!apiReady) {
      kciForm.current?.submit(); // KCI 검색 결과를 새 탭에서 연다
      return;
    }
    load(1);
  }

  /** page 1 = 새 검색, 2 이상 = 결과 아래에 더 붙이기 */
  function load(nextPage: number) {
    setBusy(nextPage === 1 ? "search" : "more");
    startTransition(async () => {
      const r = await searchKci(query, nextPage, recent);
      setBusy(null);
      if (!r.ok) {
        toast.error("KCI 검색에 실패했어요", { description: r.error });
        return;
      }
      setPage(nextPage);
      setTotal(r.total);
      setResults((prev) => (nextPage === 1 || !prev ? r.items : [...prev, ...r.items]));
      if (nextPage === 1) setChecked(new Set());
    });
  }

  const keyOf = (a: KciArticle) => a.kciId || a.title;
  const savable = (results ?? []).filter((a) => !(a.kciId && saved.has(a.kciId)));
  const allChecked = savable.length > 0 && savable.every((a) => checked.has(keyOf(a)));
  const toggle = (a: KciArticle) =>
    setChecked((c) => {
      const n = new Set(c);
      if (n.has(keyOf(a))) n.delete(keyOf(a));
      else n.add(keyOf(a));
      return n;
    });
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(savable.slice(0, BATCH_MAX).map(keyOf)));

  function saveChecked() {
    const picked = savable.filter((a) => checked.has(keyOf(a)));
    if (picked.length > BATCH_MAX) {
      toast.error(`한 번에 ${BATCH_MAX}개까지 저장할 수 있어요`, { description: `지금 ${picked.length}개를 골랐어요.` });
      return;
    }
    setBusy("batch");
    startTransition(async () => {
      const r = await saveKciBatch(picked, projectId);
      setBusy(null);
      if (!r.ok) {
        toast.error("저장하지 못했어요", { description: r.error });
        return;
      }
      setSaved((s) => {
        const n = new Set(s);
        picked.forEach((a) => a.kciId && n.add(a.kciId));
        return n;
      });
      setChecked(new Set());
      r.added.forEach((x) => onSaved?.(x.id));
      toast.success(`${r.added.length}개를 라이브러리에 저장했어요`, {
        description: r.skipped ? `이미 있는 ${r.skipped}개는 건너뛰었어요.` : "출처는 ‘KCI 선행연구’로 표시돼요.",
      });
    });
  }

  function lookup() {
    setBusy("lookup");
    startTransition(async () => {
      const r = await lookupKci(link);
      setBusy(null);
      if (!r.ok) {
        toast.error("논문 정보를 가져오지 못했어요", { description: r.error });
        return;
      }
      setForm(r.article);
      toast.success("논문 정보를 채웠어요", { description: "확인하고 ‘라이브러리에 저장’을 누르세요." });
      formCard.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function save(a: KciArticle) {
    setBusy(`save-${a.kciId || a.title}`);
    startTransition(async () => {
      const r = await saveKciToLibrary(a, projectId);
      setBusy(null);
      if (!r.ok) {
        toast.error("저장하지 못했어요", { description: r.error });
        return;
      }
      if (a.kciId) setSaved((s) => new Set(s).add(a.kciId));
      if (!r.duplicate) onSaved?.(r.id);
      if (r.duplicate) toast.info("이미 라이브러리에 있는 논문이에요", { description: "중복으로 넣지 않았어요." });
      else
        toast.success("라이브러리에 선행연구로 저장했어요", {
          description: "출처(KCI 주소)와 서지 정보가 자동으로 들어갔어요.",
          action: { label: "보기", onClick: () => window.open(`/sources/${r.id}`, "_self") },
        });
      if (a === form) setForm(EMPTY);
    });
  }

  const field = (k: keyof KciArticle, label: string, placeholder = "", className?: string) => (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label htmlFor={`kci-${k}`} className="text-xs">
        {label}
      </Label>
      <Input id={`kci-${k}`} value={form[k]} onChange={set(k)} placeholder={placeholder} className="h-8 text-sm" />
    </div>
  );

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      {/* 키 없을 때: KCI 검색 결과를 새 탭으로 (KCI 사이트의 검색 양식과 같은 값) */}
      <form
        ref={kciForm}
        action="https://www.kci.go.kr/kciportal/po/search/poTotalSearList.kci"
        method="post"
        target="_blank"
        className="hidden"
      >
        <input type="hidden" name="poSearchBean.searType" value="all" />
        <input type="hidden" name="poSearchBean.startPg" value="1" />
        <input type="hidden" name="poSearchBean.keywordList" value={query} />
        <input type="hidden" name="poSearchBean.userRecommend" value="N" />
      </form>

      <Card>
        <CardHeader>
          <CardTitle>1. KCI에서 선행연구 찾기</CardTitle>
          <CardDescription>
            {apiReady
              ? "설정에 넣은 KCI API 키로 검색해요. 결과에서 ‘라이브러리에 저장’을 누르면 출처가 자동으로 들어가요."
              : online
                ? "온라인에서는 KCI 키를 쓸 수 없어서, KCI 검색 결과를 새 탭에서 열어 드려요. 마음에 드는 논문의 주소를 복사해 아래 2번에 붙여 넣으세요."
                : "KCI API 키가 아직 없어서, KCI 검색 결과를 새 탭에서 열어 드려요. 마음에 드는 논문의 주소를 복사해 아래 2번에 붙여 넣으세요. (키는 설정 → KCI 연결에서 넣어요)"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form onSubmit={search} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="예: 수면 건강기능식품, 웰니스 소비, 중국 소비자"
                className="pl-8"
                aria-label="KCI 검색어"
              />
            </div>
            <Button type="submit" disabled={busy === "search" || !query.trim()}>
              {busy === "search" ? <Loader2 className="animate-spin" /> : apiReady ? <Search /> : <ExternalLink />}
              {apiReady ? "검색" : "KCI에서 검색 (새 탭)"}
            </Button>
          </form>

          {apiReady && (
            <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={recent} onChange={(e) => setRecent(e.target.checked)} className="size-3.5 accent-primary" />
              최근 논문 먼저 (발행 연도 순)
            </label>
          )}

          {results && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/60 px-3 py-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    disabled={!savable.length}
                    className="size-4 accent-primary"
                    aria-label="검색 결과 전체 선택"
                  />
                  전체 선택
                </label>
                <span className="text-xs text-muted-foreground">
                  {total.toLocaleString()}건 중 {results.length}건 · {checked.size}개 고름 (한 번에 최대 {BATCH_MAX}개)
                </span>
                <Button size="sm" className="ml-auto" onClick={saveChecked} disabled={!!busy || checked.size === 0}>
                  {busy === "batch" ? <Loader2 className="animate-spin" /> : <Save />}
                  {busy === "batch" ? "저장 중…" : `고른 ${checked.size}개 한꺼번에 저장`}
                </Button>
              </div>
              <ul className="flex flex-col divide-y rounded-lg border">
                {results.map((a) => {
                  const done = !!a.kciId && saved.has(a.kciId);
                  return (
                    <li key={a.kciId || a.title} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:gap-3">
                      {!done && (
                        <input
                          type="checkbox"
                          checked={checked.has(keyOf(a))}
                          onChange={() => toggle(a)}
                          className="size-4 shrink-0 accent-primary"
                          aria-label={`${a.title} 고르기`}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                          {a.title}
                        </a>
                        <p className="text-xs text-muted-foreground">
                          {a.authors || "저자 미상"} · {a.journal} {a.volume}
                          {a.issue && `(${a.issue})`} · {a.year}
                        </p>
                      </div>
                      {done ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <CheckCircle2 className="size-4" />
                          저장됨
                        </span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => save(a)} disabled={!!busy}>
                          {busy === `save-${a.kciId || a.title}` ? <Loader2 className="animate-spin" /> : <Save />}
                          라이브러리에 저장
                        </Button>
                      )}
                    </li>
                  );
                })}
                {results.length === 0 && <li className="p-6 text-center text-muted-foreground">검색 결과가 없어요.</li>}
              </ul>
              {results.length < total && (
                <Button variant="outline" size="sm" className="self-center" onClick={() => load(page + 1)} disabled={!!busy}>
                  {busy === "more" ? <Loader2 className="animate-spin" /> : <Search />}
                  결과 {Math.min(KCI_PAGE_SIZE, total - results.length)}건 더 보기
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. KCI 논문 주소로 가져오기</CardTitle>
          <CardDescription>
            KCI 논문 상세 페이지 주소(…artiId=ART…)를 붙여 넣으면 제목·저자·학술지·연도·초록을 자동으로 채워요.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART…"
            aria-label="KCI 논문 주소"
            onKeyDown={(e) => e.key === "Enter" && link.trim() && lookup()}
          />
          <Button onClick={lookup} disabled={busy === "lookup" || !link.trim()}>
            {busy === "lookup" ? <Loader2 className="animate-spin" /> : <ClipboardPaste />}
            정보 불러오기
          </Button>
        </CardContent>
      </Card>

      <Card ref={formCard}>
        <CardHeader>
          <CardTitle>3. 확인하고 라이브러리에 저장</CardTitle>
          <CardDescription>
            자동으로 못 채운 칸은 직접 고치거나 붙여 넣으세요. 저장하면 <b>선행연구</b> 표시가 붙고, 글쓰기에서 출처
            각주로 고를 수 있어요. 이미 있는 논문은 다시 넣지 않아요.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-4">
            {field("title", "논문 제목", "", "sm:col-span-4")}
            {field("authors", "저자 (쉼표로 구분)", "예: 안가청, 남영운", "sm:col-span-2")}
            {field("journal", "학술지", "예: 소비자학연구", "sm:col-span-2")}
            {field("year", "연도", "2024")}
            {field("volume", "권", "35")}
            {field("issue", "호", "2")}
            {field("pages", "쪽", "55-77")}
            {field("publisher", "발행기관", "", "sm:col-span-2")}
            {field("doi", "DOI", "", "sm:col-span-2")}
            {field("url", "KCI 주소 (출처)", "", "sm:col-span-4")}
            {field("keywords", "키워드", "", "sm:col-span-4")}
            <div className="flex flex-col gap-1 sm:col-span-4">
              <Label htmlFor="kci-abstract" className="text-xs">
                초록 (선택)
              </Label>
              <Textarea id="kci-abstract" value={form.abstract} onChange={set("abstract")} rows={4} className="text-sm" />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-56 flex-col gap-1">
              <Label htmlFor="kci-project" className="text-xs">
                연결할 프로젝트
              </Label>
              <select id="kci-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={selectClass}>
                <option value="">연결 안 함</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={() => save({ ...form, kciId: form.kciId || (form.url.match(/ART\d{9}/)?.[0] ?? "") })} disabled={!!busy || !form.title.trim()}>
              {busy?.startsWith("save-") ? <Loader2 className="animate-spin" /> : <Save />}
              라이브러리에 선행연구로 저장
            </Button>
            <Link href="/sources" className="text-xs text-muted-foreground underline">
              자료 관리에서 보기
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
