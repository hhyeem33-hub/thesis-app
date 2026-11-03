"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { aiErrorMessage, classifySource } from "@/lib/ai";
import { getResearch, getSource, getSources, saveResearch, saveSource } from "@/lib/sources";
import { getProjects } from "@/lib/store";
import { SOURCE_TYPES, type ActionResult, type Source, type SourceType } from "@/lib/types";

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

/** 자료 하나를 AI로 분류해 PARA·관련도·요약을 저장한다 */
export async function classifySourceAction(id: string): Promise<ActionResult> {
  try {
    const source = await getSource(id);
    if (!source) return { ok: false, error: "자료를 찾을 수 없어요." };
    const result = await classifySource({ ...source, research: await getResearch() });
    const now = new Date().toISOString();
    await saveSource({ ...source, updatedAt: now, classification: { ...result, classifiedAt: now } });
    refresh(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: aiErrorMessage(e) };
  }
}

/** 아직 분류하지 않은 자료를 차례로 분류한다 (한 번에 최대 10개) */
export async function classifyPending(): Promise<ActionResult & { done?: number; left?: number }> {
  const pending = (await getSources()).filter((s) => !s.classification);
  const batch = pending.slice(0, 10);
  let done = 0;
  for (const s of batch) {
    const r = await classifySourceAction(s.id);
    if (!r.ok) return { ok: false, error: `${done}개 분류 후 멈췄어요: ${r.error}` };
    done++;
  }
  return { ok: true, done, left: pending.length - done };
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
