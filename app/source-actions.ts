"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { aiErrorMessage, classifySource, getAiKeyStatus } from "@/lib/ai";
import { ONLINE } from "@/lib/online";
import { ruleClassify } from "@/lib/rule-classify";
import { getSource, getSources, saveResearch, saveSource } from "@/lib/sources";
import { getProjects } from "@/lib/store";
import { researchBasis, saveProjectResearch } from "@/lib/research";
import {
  DECISIONS,
  SOURCE_TYPES,
  type ActionResult,
  type Classification,
  type Decision,
  type Source,
  type SourceType,
} from "@/lib/types";

const MAX_TITLE = 200;
const MAX_ORIGIN = 1000;
/** 붙여넣기 내용 한도 (약 20만 자) */
const MAX_CONTENT = 200_000;

function refresh(id?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/sources");
  revalidatePath("/classify");
  if (id) revalidatePath(`/sources/${id}`);
}

export async function addSource(input: {
  title: string;
  type: string;
  origin: string;
  content: string;
  projectId: string;
}): Promise<ActionResult & { id?: string }> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "제목을 적어 주세요." };
  if (title.length > MAX_TITLE) return { ok: false, error: `제목은 ${MAX_TITLE}자까지 쓸 수 있어요.` };
  if (!SOURCE_TYPES.includes(input.type as SourceType))
    return { ok: false, error: "자료 유형을 골라 주세요." };
  if (input.content.length > MAX_CONTENT)
    return { ok: false, error: "내용이 너무 길어요. 20만 자 이하로 나눠서 저장해 주세요." };

  try {
    const projectId = input.projectId || null;
    if (projectId && !(await getProjects()).some((p) => p.id === projectId))
      return { ok: false, error: "연결할 프로젝트를 찾을 수 없어요." };

    const now = new Date().toISOString();
    const source: Source = {
      id: randomUUID(),
      projectId,
      title,
      type: input.type as SourceType,
      origin: input.origin.trim().slice(0, MAX_ORIGIN),
      content: input.content.trim(),
      createdAt: now,
      updatedAt: now,
      classification: null,
    };
    await saveSource(source);
    refresh();
    return { ok: true, id: source.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 판단 기록 한 줄 추가 (최근 30개) */
function withLog(c: Classification, who: "AI" | "연구자", what: string): Classification {
  return { ...c, log: [{ at: new Date().toISOString(), who, what }, ...(c.log ?? [])].slice(0, 30) };
}

/** AI 판단이 아직 없는 자료에 연구자가 먼저 결정할 때 쓰는 빈 판단 (관련도 0 = AI 미판단) */
function blankClassification(): Classification {
  return { para: "resources", relevance: 0, summary: "", classifiedAt: "" };
}

/**
 * 자료 하나를 AI가 판단한다: 관련도·제안 토픽·키워드·근거·신뢰도 (프로젝트 연구 설정 기준).
 * 연구자의 확정 분류(decision)와 기록(log)은 그대로 둔다.
 */
export async function classifySourceAction(
  id: string,
  /** 이 프로젝트의 연구 설정을 기준으로 (AI 분류 화면에서 고른 프로젝트). 없으면 자료의 프로젝트 */
  basisProjectId?: string | null
): Promise<ActionResult & { relevance?: number }> {
  try {
    const source = await getSource(id);
    if (!source) return { ok: false, error: "자료를 찾을 수 없어요." };
    const projectId = basisProjectId || source.projectId;
    const basis = await researchBasis(projectId);
    // 온라인에서 쓸 수 있는 AI 키가 없으면(주인이 아닌 사람이 키를 안 넣음) 비용 없는 규칙 기반으로
    const useRules = ONLINE && (await getAiKeyStatus()).source === "none";
    const result = useRules ? ruleClassify({ ...source, research: basis }) : await classifySource({ ...source, research: basis });
    const now = new Date().toISOString();
    const prev = source.classification ?? blankClassification();
    const next = withLog(
      { ...prev, ...result, classifiedAt: now, basisProjectId: basis.projectId },
      "AI",
      `${useRules ? "규칙 기반 " : ""}${result.relevance}등급 · 토픽 ‘${result.topic}’ · 신뢰도 ${result.confidence}`
    );
    await saveSource({ ...source, updatedAt: now, classification: next });
    refresh(id);
    return { ok: true, relevance: result.relevance };
  } catch (e) {
    return { ok: false, error: aiErrorMessage(e) };
  }
}

/** 한꺼번에 분류할 자료 번호 (all=false 면 아직 AI 판단이 없는 것만) */
export async function classifyTargets(all: boolean, category?: string): Promise<string[]> {
  const sources = await getSources();
  return sources
    .filter((s) => !category || s.bib?.category === category)
    .filter((s) => all || !s.classification || !s.classification.relevance)
    .map((s) => s.id);
}

/** 예전 버튼용: 미분류를 10개씩 */
export async function classifyPending(): Promise<ActionResult & { done?: number; left?: number }> {
  const pending = await classifyTargets(false);
  let done = 0;
  for (const id of pending.slice(0, 10)) {
    const r = await classifySourceAction(id);
    if (!r.ok) return { ok: false, error: `${done}개 분류 후 멈췄어요: ${r.error}` };
    done++;
  }
  return { ok: true, done, left: pending.length - done };
}

/** 연구자 확정 분류 바꾸기 */
export async function decideSource(
  id: string,
  patch: Partial<Pick<Decision, "status" | "finalTopic" | "finalKeywords" | "note">>,
  what: string
): Promise<ActionResult & { classification?: Classification }> {
  try {
    const source = await getSource(id);
    if (!source) return { ok: false, error: "자료를 찾을 수 없어요." };
    const c = source.classification ?? blankClassification();
    const prev: Decision = c.decision ?? { status: null, finalTopic: "", finalKeywords: [], note: "", decidedAt: "" };
    if (patch.status !== undefined && patch.status !== null && !DECISIONS.includes(patch.status))
      return { ok: false, error: "잘못된 상태예요." };
    const decision: Decision = {
      ...prev,
      ...patch,
      finalTopic: (patch.finalTopic ?? prev.finalTopic).trim().slice(0, 40),
      finalKeywords: (patch.finalKeywords ?? prev.finalKeywords).map((k) => k.trim()).filter(Boolean).slice(0, 12),
      note: (patch.note ?? prev.note).slice(0, 3000),
      decidedAt: new Date().toISOString(),
    };
    const next = withLog({ ...c, decision }, "연구자", what);
    await saveSource({ ...source, updatedAt: decision.decidedAt, classification: next });
    refresh(id);
    return { ok: true, classification: next };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 자세히 창에 필요한 것: 자료 + 그 프로젝트의 목차(토픽 고르기용) */
export async function sourceForReview(id: string) {
  const source = await getSource(id);
  if (!source) return null;
  const basis = await researchBasis(source.projectId);
  return {
    source: { ...source, content: source.content.slice(0, 3000) },
    outline: basis.outline,
    keywords: basis.keywords,
  };
}

/** 프로젝트별 연구 설정 저장 (+ 수정 이력) */
export async function updateProjectResearch(
  projectId: string,
  input: { purpose: string; keywords: string; perspective: string; questions: string; outline: string }
): Promise<ActionResult & { changed?: string[] }> {
  if (!(await getProjects()).some((p) => p.id === projectId)) return { ok: false, error: "프로젝트를 찾을 수 없어요." };
  const uniq = (list: string[]) => [...new Set(list.map((x) => x.trim()).filter(Boolean))];
  try {
    const { changed } = await saveProjectResearch(projectId, {
      purpose: input.purpose.trim().slice(0, 1000),
      keywords: uniq(input.keywords.split(/[,，\n]/).map((k) => k.replace(/^#/, "").slice(0, 40))).slice(0, 30),
      perspective: input.perspective.trim().slice(0, 2000),
      questions: uniq(input.questions.split("\n").map((q) => q.slice(0, 300))).slice(0, 20),
      outline: uniq(input.outline.split(/[/\n]/).map((o) => o.slice(0, 60))).slice(0, 40),
    });
    revalidatePath("/research");
    revalidatePath("/sources");
    return { ok: true, changed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateResearch(input: {
  topic: string;
  keywords: string;
}): Promise<ActionResult> {
  const topic = input.topic.trim().slice(0, 300);
  // 쉼표·줄바꿈으로 나누고, # 은 떼고, 같은 키워드는 하나만
  const keywords = [
    ...new Set(
      input.keywords
        .split(/[,，\n]/)
        .map((k) => k.trim().replace(/^#/, ""))
        .filter(Boolean)
        .map((k) => k.slice(0, 40))
    ),
  ].slice(0, 20);
  try {
    await saveResearch({ topic, keywords });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/research");
  revalidatePath("/dashboard");
  return { ok: true };
}
