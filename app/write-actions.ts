"use server";

import { guestBlock } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { aiErrorMessage, writeAbstract } from "@/lib/ai";
import { countChars } from "@/lib/bib";
import { draftChapter, type ChapterDraft } from "@/lib/chapter-draft";
import { emptyDoc, getDoc, getVersion, listVersions, saveDocOnly, saveDocWithVersion } from "@/lib/documents";
import { isMaterialType } from "@/lib/material-type";
import { getSource, saveSource } from "@/lib/sources";
import { getProjects } from "@/lib/store";
import { DOC_KINDS, type Bib, type DocKind, type DocPlan, type DocVersion, type Footnote, type ThesisDoc } from "@/lib/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const MAX_BODY = 500_000;

/** 화면에서 온 원고를 길이 제한에 맞춰 정리한다 (저장 · 임시저장 공용) */
async function cleanDoc(d: Omit<ThesisDoc, "updatedAt">): Promise<ThesisDoc | string> {
  if (!(await getProjects()).some((p) => p.id === d.projectId)) return "프로젝트를 찾을 수 없어요.";
  if (d.body.length > MAX_BODY) return "본문이 너무 길어요 (50만 자 이하).";
  const footnotes: Footnote[] = d.footnotes.slice(0, 2000).map((f) => ({
    id: String(f.id).slice(0, 12),
    text: String(f.text ?? "").slice(0, 2000),
    sourceId: f.sourceId ? String(f.sourceId) : null,
  }));
  const out: ThesisDoc = {
    projectId: d.projectId,
    title: d.title.slice(0, 200),
    author: d.author.slice(0, 50),
    affiliation: d.affiliation.slice(0, 100),
    body: d.body,
    footnotes,
    updatedAt: "",
  };
  if (d.abstract) out.abstract = String(d.abstract).slice(0, 5000);
  if (d.keywords) out.keywords = String(d.keywords).slice(0, 300);
  const plan = cleanPlan(d.plan);
  if (plan) out.plan = plan;
  const marks = cleanMarks(d.marks);
  if (marks) out.marks = marks;
  return out;
}

function cleanPlan(p: unknown): DocPlan | undefined {
  if (!p || typeof p !== "object") return undefined;
  const { kind, chapters, targets } = p as Partial<DocPlan>;
  if (!DOC_KINDS.includes(kind as DocKind)) return undefined;
  const n = Math.min(20, Math.max(1, Math.round(Number(chapters) || 1)));
  const t = Array.isArray(targets) ? targets : [];
  return { kind: kind as DocKind, chapters: n, targets: Array.from({ length: n }, (_, i) => Math.min(1_000_000, Math.max(0, Math.round(Number(t[i]) || 0)))) };
}

function cleanMarks(m: unknown): ThesisDoc["marks"] {
  if (!m || typeof m !== "object") return undefined;
  const iso = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : undefined);
  const { formatAt, finalAt } = m as NonNullable<ThesisDoc["marks"]>;
  const out = { formatAt: iso(formatAt), finalAt: iso(finalAt) };
  return out.formatAt || out.finalAt ? out : undefined;
}

/** 집필 단계 표시: ‘양식 적용’(출력함)·‘최종 확인’ 한 때를 원고에 남긴다 (나머지 원고 내용은 그대로, 히스토리 없음) */
export async function markDocStage(projectId: string, stage: "format" | "final", on = true): Promise<Result<{ marks: ThesisDoc["marks"] }>> {
  const blocked = await guestBlock();
  if (blocked) return blocked;
  try {
    if (!(await getProjects()).some((p) => p.id === projectId)) return { ok: false, error: "프로젝트를 찾을 수 없어요." };
    const doc = (await getDoc(projectId)) ?? emptyDoc(projectId);
    const key = stage === "format" ? "formatAt" : "finalAt";
    const marks = { ...(doc.marks ?? {}), [key]: on ? new Date().toISOString() : undefined };
    await saveDocOnly({ ...doc, marks: cleanMarks(marks) });
    return { ok: true, marks: cleanMarks(marks) };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** 원고 저장 = 버전 하나 기록 */
export async function saveDocument(input: {
  doc: Omit<ThesisDoc, "updatedAt">;
  memo: string;
}): Promise<Result<{ version: Omit<DocVersion, "doc"> }>> {
  // 둘러보기 모드에서는 바꾸거나 비용이 드는 일을 막는다
  const blocked = await guestBlock();
  if (blocked) return blocked;
  const doc = await cleanDoc(input.doc);
  if (typeof doc === "string") return { ok: false, error: doc };
  try {
    const { doc: saved, ...version } = await saveDocWithVersion(doc, input.memo || `${countChars(doc.body).toLocaleString()}자 저장`);
    void saved;
    revalidatePath("/write");
    return { ok: true, version };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** 임시저장: 원고만 저장하고 히스토리에는 남기지 않는다 (나중에 이어 쓰기) */
export async function tempSaveDocument(input: { doc: Omit<ThesisDoc, "updatedAt"> }): Promise<Result<{ savedAt: string }>> {
  const blocked = await guestBlock();
  if (blocked) return blocked;
  const doc = await cleanDoc(input.doc);
  if (typeof doc === "string") return { ok: false, error: doc };
  try {
    const saved = await saveDocOnly(doc);
    return { ok: true, savedAt: saved.updatedAt };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function fetchVersions(projectId: string): Promise<Result<{ versions: Omit<DocVersion, "doc">[] }>> {
  try {
    return { ok: true, versions: await listVersions(projectId) };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** 예전 버전 보기 */
export async function fetchVersion(id: string): Promise<Result<{ version: DocVersion }>> {
  try {
    const version = await getVersion(id);
    return version ? { ok: true, version } : { ok: false, error: "버전을 찾을 수 없어요." };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** 되돌리기: 예전 버전 내용을 새 버전으로 저장한다 (기록은 지워지지 않음) */
export async function restoreVersion(id: string): Promise<Result<{ doc: ThesisDoc; version: Omit<DocVersion, "doc"> }>> {
  // 둘러보기 모드에서는 바꾸거나 비용이 드는 일을 막는다
  const blocked = await guestBlock();
  if (blocked) return blocked;
  try {
    const old = await getVersion(id);
    if (!old) return { ok: false, error: "버전을 찾을 수 없어요." };
    const when = new Date(old.savedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const { doc, ...version } = await saveDocWithVersion(old.doc, `${when} 버전으로 되돌림`);
    revalidatePath("/write");
    return { ok: true, doc, version };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** 자료의 서지 정보 고치기 (참고문헌·각주에 쓰임) */
export async function updateSourceBib(id: string, bib: Bib): Promise<Result> {
  // 둘러보기 모드에서는 바꾸거나 비용이 드는 일을 막는다
  const blocked = await guestBlock();
  if (blocked) return blocked;
  try {
    const source = await getSource(id);
    if (!source) return { ok: false, error: "자료를 찾을 수 없어요." };
    const clean = Object.fromEntries(
      Object.entries(bib).map(([k, v]) => [k, String(v ?? "").trim().slice(0, 300)])
    ) as Bib;
    if (!["article", "book", "web"].includes(clean.kind)) clean.kind = "web";
    if (!isMaterialType(clean.materialType)) clean.materialType = "";
    // 원문 PDF 연결은 정리 스크립트만 바꾼다 (서지 칸 저장으로 지워지거나 바뀌지 않게)
    if (source.bib?.originalPdf) clean.originalPdf = source.bib.originalPdf;
    else delete clean.originalPdf;
    await saveSource({ ...source, bib: clean, updatedAt: new Date().toISOString() });
    revalidatePath(`/sources/${id}`);
    revalidatePath("/write");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** 장별 AI 초안 받기 (채택 자료만 근거, 미리보기용 — 본문에는 아직 넣지 않음) */
export async function draftChapterAction(projectId: string, chapter: string): Promise<ChapterDraft> {
  const blocked = await guestBlock();
  if (blocked) return { ok: false, chapter, error: blocked.error };
  if (!(await getProjects()).some((p) => p.id === projectId)) return { ok: false, chapter, error: "프로젝트를 찾을 수 없어요." };
  const name = chapter.trim().slice(0, 100);
  if (!name) return { ok: false, chapter, error: "장을 골라 주세요." };
  try {
    return await draftChapter(projectId, name);
  } catch (e) {
    return { ok: false, chapter, error: aiErrorMessage(e) };
  }
}

/** 국문 초록·주제어 AI 초안 (본문만 근거, 미리보기용 — 칸에 넣는 것·저장은 사람이) */
export async function draftAbstractAction(input: {
  projectId: string;
  title: string;
  kind: string;
  body: string;
}): Promise<Result<{ abstract: string; keywords: string }>> {
  const blocked = await guestBlock();
  if (blocked) return blocked;
  if (!(await getProjects()).some((p) => p.id === input.projectId)) return { ok: false, error: "프로젝트를 찾을 수 없어요." };
  const body = String(input.body ?? "").slice(0, MAX_BODY);
  if (countChars(body) < 300) return { ok: false, error: "본문이 너무 짧아요. 본문을 300자 넘게 쓴 뒤에 초록을 받아 주세요." };
  try {
    const r = await writeAbstract({ title: String(input.title ?? "").slice(0, 200), kind: String(input.kind ?? "").slice(0, 20), body });
    if (!r.enough || !r.abstract.trim()) return { ok: false, error: "본문만으로는 초록을 쓰기 어렵대요. 본문을 더 쓴 뒤 다시 받아 주세요." };
    return { ok: true, abstract: r.abstract.trim(), keywords: r.keywords.map((k) => k.trim()).filter(Boolean).slice(0, 8).join(", ") };
  } catch (e) {
    return { ok: false, error: aiErrorMessage(e) };
  }
}
