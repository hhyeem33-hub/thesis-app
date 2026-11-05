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

/** KCI Open API 검색 — 키가 있고 내 컴퓨터일 때 */
export async function searchKci(query: string): Promise<Result<{ total: number; items: KciArticle[] }>> {
  const q = query.trim().slice(0, 100);
  if (!q) return { ok: false, error: "검색어를 적어 주세요." };
  try {
    return { ok: true, ...(await searchKciApi(q)) };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** 이미 라이브러리에 있는 KCI 논문 번호들 (같은 번호를 두 번 넣지 않게) */
export async function savedKciIds(): Promise<string[]> {
  const sources = await getSources();
  return sources.map((s) => s.bib?.kciId || findKciId(s.origin) || "").filter(Boolean);
}

/** 라이브러리에 '선행연구'로 저장 */
export async function saveKciToLibrary(a: KciArticle, projectId: string): Promise<Result<{ id: string; duplicate?: boolean }>> {
  const title = a.title.trim();
  if (!title) return { ok: false, error: "논문 제목을 적어 주세요." };
  try {
    const sources = await getSources();
    const kciId = findKciId(a.kciId || a.url) ?? "";
    const dup = sources.find(
      (s) =>
        (kciId && (s.bib?.kciId === kciId || s.origin.includes(kciId))) ||
        s.title.replace(/\s+/g, "") === title.replace(/\s+/g, "")
    );
    if (dup) return { ok: true, id: dup.id, duplicate: true };

    const projects = await getProjects();
    const project = projects.find((p) => p.id === projectId) ?? null;
    const now = new Date().toISOString();
    const lines = [
      `저자: ${a.authors || "[보완 필요]"}`,
      `학술지: ${a.journal || "[보완 필요]"} ${a.volume ? `${a.volume}${a.issue ? `(${a.issue})` : ""}` : ""}${a.pages ? `, ${a.pages}` : ""} (${a.year || "연도 [보완 필요]"})`,
      a.publisher && `발행기관: ${a.publisher}`,
      a.doi && `DOI: ${a.doi}`,
      a.keywords && `키워드: ${a.keywords}`,
      a.abstract && `\n초록\n${a.abstract}`,
    ].filter(Boolean);
    const source: Source = {
      id: randomUUID(),
      projectId: project?.id ?? null,
      title: title.slice(0, 200),
      type: "web",
      origin: (a.url || (kciId ? kciDetailUrl(kciId) : "")).slice(0, 1000),
      content: lines.join("\n"),
      createdAt: now,
      updatedAt: now,
      classification: null,
      bib: {
        kind: "article",
        authors: a.authors.trim(),
        year: a.year.trim(),
        journal: a.journal.trim(),
        volume: a.volume.trim(),
        issue: a.issue.trim(),
        pages: a.pages.trim(),
        publisher: a.publisher.trim(),
        place: "",
        doi: a.doi.trim(),
        kciId,
        category: "선행연구",
      },
    };
    await saveSource(source);
    revalidatePath("/sources");
    revalidatePath("/dashboard");
    revalidatePath("/kci");
    return { ok: true, id: source.id };
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
