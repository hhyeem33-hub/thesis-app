"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { ONLINE } from "@/lib/db";
import {
  deleteKciKey,
  fetchKciArticle,
  findKciId,
  kciDetailUrl,
  saveKciKey,
  searchKciApi,
} from "@/lib/kci";
import { getSources, saveSource } from "@/lib/sources";
import { getProjects } from "@/lib/store";
import type { KciArticle, Source } from "@/lib/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** KCI 주소(또는 ART 번호)로 논문 정보 가져오기 — 키 없이 */
export async function lookupKci(urlOrId: string): Promise<Result<{ article: KciArticle }>> {
  const id = findKciId(urlOrId);
  if (!id) return { ok: false, error: "KCI 논문 주소에서 ART로 시작하는 논문 번호를 찾지 못했어요." };
  try {
    return { ok: true, article: await fetchKciArticle(id) };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** KCI Open API 검색 — 키가 있고 내 컴퓨터일 때 (recent: 최근 논문 먼저) */
export async function searchKci(
  query: string,
  page = 1,
  recent = true
): Promise<Result<{ total: number; items: KciArticle[] }>> {
  const q = query.trim().slice(0, 100);
  if (!q) return { ok: false, error: "검색어를 적어 주세요." };
  try {
    return { ok: true, ...(await searchKciApi(q, Math.max(1, Math.floor(page)), recent)) };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** 이미 라이브러리에 있는 KCI 논문 번호들 (같은 번호를 두 번 넣지 않게) */
export async function savedKciIds(): Promise<string[]> {
  const sources = await getSources();
  return sources.map((s) => s.bib?.kciId || findKciId(s.origin) || "").filter(Boolean);
}

/** 라이브러리 자료에 붙는 출처 표시 */
const KCI_CATEGORY = "KCI 선행연구";
/** 한꺼번에 저장할 수 있는 최대 개수 */
const BATCH_MAX = 50;

const squash = (t: string) => t.replace(/\s+/g, "");
const clean = (v: string | undefined) => (v ?? "").trim();

/** KCI 논문 → 라이브러리 자료 (서지 정보·초록·출처 표시 포함) */
function toSource(a: KciArticle, projectId: string | null): Source {
  const kciId = findKciId(a.kciId || a.url) ?? "";
  const now = new Date().toISOString();
  const volIssue = a.volume ? `${a.volume}${a.issue ? `(${a.issue})` : ""}` : "";
  const lines = [
    `출처: ${KCI_CATEGORY}`,
    `저자: ${a.authors || "[보완 필요]"}`,
    `학술지: ${a.journal || "[보완 필요]"} ${volIssue}${a.pages ? `, ${a.pages}` : ""} (${a.year || "연도 [보완 필요]"})`,
    a.publisher && `발행기관: ${a.publisher}`,
    a.doi && `DOI: ${a.doi}`,
    a.keywords && `키워드: ${a.keywords}`,
    a.abstract && `\n초록\n${a.abstract}`,
  ].filter(Boolean);
  return {
    id: randomUUID(),
    projectId,
    title: a.title.trim().slice(0, 200),
    type: "web",
    origin: (a.url || (kciId ? kciDetailUrl(kciId) : "")).slice(0, 1000),
    content: lines.join("\n"),
    createdAt: now,
    updatedAt: now,
    classification: null,
    bib: {
      kind: "article",
      authors: clean(a.authors),
      year: clean(a.year),
      journal: clean(a.journal),
      volume: clean(a.volume),
      issue: clean(a.issue),
      pages: clean(a.pages),
      publisher: clean(a.publisher),
      place: "",
      doi: clean(a.doi),
      kciId,
      category: KCI_CATEGORY,
    },
  };
}

/** 이미 있는 논문인지 (KCI 번호 또는 띄어쓰기 뺀 제목이 같으면) */
function duplicateOf(sources: Source[], a: KciArticle) {
  const kciId = findKciId(a.kciId || a.url) ?? "";
  const title = squash(a.title);
  return sources.find(
    (s) => (kciId && (s.bib?.kciId === kciId || s.origin.includes(kciId))) || squash(s.title) === title
  );
}

async function projectOrNull(projectId: string) {
  const projects = await getProjects();
  return projects.find((p) => p.id === projectId)?.id ?? null;
}

function refreshLists() {
  revalidatePath("/sources");
  revalidatePath("/dashboard");
  revalidatePath("/kci");
  revalidatePath("/classify");
}

/** 라이브러리에 'KCI 선행연구'로 저장 (하나) */
export async function saveKciToLibrary(a: KciArticle, projectId: string): Promise<Result<{ id: string; duplicate?: boolean }>> {
  if (!a.title.trim()) return { ok: false, error: "논문 제목을 적어 주세요." };
  try {
    const dup = duplicateOf(await getSources(), a);
    if (dup) return { ok: true, id: dup.id, duplicate: true };
    const source = toSource(a, await projectOrNull(projectId));
    await saveSource(source);
    refreshLists();
    return { ok: true, id: source.id };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** 검색 결과 여러 개를 한꺼번에 저장 — 한 번에 최대 50개, 이미 있는 논문은 건너뜀 */
export async function saveKciBatch(
  articles: KciArticle[],
  projectId: string
): Promise<Result<{ added: { id: string; kciId: string }[]; skipped: number }>> {
  if (!articles.length) return { ok: false, error: "저장할 논문을 골라 주세요." };
  if (articles.length > BATCH_MAX) return { ok: false, error: `한 번에 ${BATCH_MAX}개까지 저장할 수 있어요.` };
  try {
    const sources = await getSources();
    const project = await projectOrNull(projectId);
    const added: { id: string; kciId: string }[] = [];
    let skipped = 0;
    for (const a of articles) {
      if (!a.title?.trim() || duplicateOf(sources, a)) {
        skipped++;
        continue;
      }
      const source = toSource(a, project);
      await saveSource(source);
      sources.push(source); // 같은 묶음 안의 중복도 막는다
      added.push({ id: source.id, kciId: source.bib?.kciId ?? "" });
    }
    if (added.length) refreshLists();
    return { ok: true, added, skipped };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function saveKciKeyAction(key: string): Promise<Result> {
  if (ONLINE) return { ok: false, error: "KCI 키는 신청한 집 IP에서만 돼서, 내 컴퓨터에서만 넣을 수 있어요." };
  const k = key.trim();
  if (k.length < 8) return { ok: false, error: "KCI API 키를 확인해 주세요." };
  await saveKciKey(k);
  revalidatePath("/settings");
  revalidatePath("/kci");
  return { ok: true };
}

export async function removeKciKeyAction(): Promise<Result> {
  if (ONLINE) return { ok: false, error: "내 컴퓨터에서만 돼요." };
  await deleteKciKey();
  revalidatePath("/settings");
  revalidatePath("/kci");
  return { ok: true };
}

/** 연결 테스트: 짧은 검색어로 한 번 검색해 본다 */
export async function testKciAction(): Promise<Result<{ total: number }>> {
  try {
    const r = await searchKciApi("수면");
    return { ok: true, total: r.total };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
