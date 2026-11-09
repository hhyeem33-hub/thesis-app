import { promises as fs } from "fs";
import path from "path";
import { dbGetProjectResearch, dbSaveProjectResearch, ONLINE } from "./db";
import { emptyDoc } from "./documents";
import { getResearch } from "./sources";
import { getProjects } from "./store";
import type { ProjectResearch, ProjectResearchRecord } from "./types";

// 프로젝트별 연구 설정 (AI 분류 · AI 초안의 기준)
// 내 컴퓨터: data/project-research.json, 온라인: documents 표의 doc.research (새 표 없이)

const FILE = path.join(process.cwd(), "data", "project-research.json");
const FIELDS: { key: keyof ProjectResearch; label: string }[] = [
  { key: "purpose", label: "연구 목적" },
  { key: "keywords", label: "핵심 키워드" },
  { key: "perspective", label: "나의 관점" },
  { key: "questions", label: "연구 질문" },
  { key: "outline", label: "목차" },
];

export function emptyResearch(): ProjectResearchRecord {
  return { purpose: "", keywords: [], perspective: "", questions: [], outline: [], updatedAt: "", history: [] };
}

async function readAll(): Promise<Record<string, ProjectResearchRecord>> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    return {};
  }
}

export async function getProjectResearch(projectId: string): Promise<ProjectResearchRecord> {
  const r = ONLINE ? await dbGetProjectResearch(projectId) : (await readAll())[projectId];
  return { ...emptyResearch(), ...(r ?? {}) };
}

/** 저장 + 수정 이력 (바뀐 칸이 없으면 이력을 남기지 않음) */
export async function saveProjectResearch(projectId: string, next: Omit<ProjectResearch, "updatedAt">) {
  const prev = await getProjectResearch(projectId);
  const same = (k: keyof ProjectResearch) => JSON.stringify(prev[k]) === JSON.stringify(next[k as keyof typeof next]);
  const changed = FIELDS.filter((f) => !same(f.key)).map((f) => f.label);
  if (!changed.length) return { record: prev, changed };
  const now = new Date().toISOString();
  const snapshot: ProjectResearch = { ...next, updatedAt: now };
  const record: ProjectResearchRecord = {
    ...snapshot,
    history: [{ at: now, changed, snapshot }, ...prev.history].slice(0, 50),
  };
  if (ONLINE) await dbSaveProjectResearch(projectId, record, emptyDoc(projectId));
  else {
    const all = await readAll();
    all[projectId] = record;
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(all, null, 2) + "\n", "utf8");
  }
  return { record, changed };
}

/**
 * AI가 판단할 때 쓸 기준. 프로젝트 연구 설정이 비어 있으면 예전 '연구 설정'(주제·키워드)을 쓴다.
 */
export async function researchBasis(projectId: string | null) {
  const has = (r: ProjectResearchRecord) => !!(r.purpose || r.keywords.length || r.questions.length || r.outline.length);
  if (projectId) {
    const r = await getProjectResearch(projectId);
    if (has(r)) return { ...r, projectId };
  }
  const g = await getResearch();
  if (g.topic || g.keywords.length) return { ...emptyResearch(), purpose: g.topic, keywords: g.keywords, projectId: null };
  // 프로젝트도 공통 설정도 비어 있으면, 가장 최근에 저장한 프로젝트 연구 설정을 쓴다
  let latest: (ProjectResearchRecord & { projectId: string }) | null = null;
  for (const p of await getProjects()) {
    const r = await getProjectResearch(p.id);
    if (has(r) && (!latest || r.updatedAt > latest.updatedAt)) latest = { ...r, projectId: p.id };
  }
  return latest ?? { ...emptyResearch(), projectId: null };
}
