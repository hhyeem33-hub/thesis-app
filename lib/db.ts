import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AiDraftRecord,
  Bib,
  Classification,
  DocVersion,
  FolderStatus,
  Project,
  Research,
  Source,
  ThesisDoc,
} from "./types";

// ⚠️ 슈파베이스 비밀 키(service role)는 서버에서만 쓴다. 브라우저로 보내지 않는다.
// 키는 버셀 환경 변수(내 컴퓨터에서는 .env.local, 깃허브 제외)에만 있다.

/**
 * 온라인(버셀)이면 슈파베이스에 저장하고, 내 컴퓨터면 data/*.json 에 저장한다.
 * vercel env pull 이 .env.local 에 VERCEL=1 을 넣을 수 있어서, 윈도우(내 컴퓨터)는 항상 로컬로 본다.
 */
export const ONLINE = !!process.env.VERCEL && process.platform !== "win32";

let client: SupabaseClient | null = null;

function db() {
  if (client) return client;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new Error("슈파베이스 환경 변수가 없어요. 버셀에서 슈파베이스 연결을 확인해 주세요.");
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

type ProjectRecord = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  obsidian: FolderStatus;
  drive: FolderStatus;
};

const toProject = (r: ProjectRecord): Project => ({
  id: r.id,
  name: r.name,
  description: r.description,
  createdAt: r.created_at,
  obsidian: r.obsidian,
  drive: r.drive,
});

function check(error: { message: string } | null) {
  if (error) throw new Error(`슈파베이스 오류: ${error.message}`);
}

export async function dbGetProjects(): Promise<Project[]> {
  const { data, error } = await db()
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });
  check(error);
  return (data as ProjectRecord[]).map(toProject);
}

export async function dbAddProject(p: Project) {
  const { error } = await db().from("projects").insert({
    id: p.id,
    name: p.name,
    description: p.description,
    created_at: p.createdAt,
    obsidian: p.obsidian,
    drive: p.drive,
  });
  // 같은 이름이 동시에 만들어지면 unique 제약에 걸린다
  if (error?.code === "23505") throw new Error("같은 이름의 프로젝트가 이미 있어요.");
  check(error);
}

export async function dbAddDraft(d: {
  projectId: string | null;
  topic: string;
  purpose: string;
  method: string;
  title: string;
  manuscript: unknown;
  savedPath: string | null;
}) {
  const { error } = await db().from("ai_drafts").insert({
    project_id: d.projectId,
    topic: d.topic,
    purpose: d.purpose,
    method: d.method,
    title: d.title,
    manuscript: d.manuscript,
    saved_path: d.savedPath,
  });
  check(error);
}

// ── 자료 · 연구 설정 · 통계 ─────────────────────────────────────────────────

type SourceRecord = {
  id: string;
  project_id: string | null;
  title: string;
  type: Source["type"];
  origin: string;
  content: string;
  created_at: string;
  updated_at: string;
  classification: Classification | null;
  bib: Bib | null;
};

const toSource = (r: SourceRecord): Source => ({
  id: r.id,
  projectId: r.project_id,
  title: r.title,
  type: r.type,
  origin: r.origin,
  content: r.content,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  classification: r.classification,
  bib: r.bib ?? null,
});

const fromSource = (s: Source) => ({
  id: s.id,
  project_id: s.projectId,
  title: s.title,
  type: s.type,
  origin: s.origin,
  content: s.content,
  created_at: s.createdAt,
  updated_at: s.updatedAt,
  classification: s.classification,
  bib: s.bib ?? null,
});

export async function dbGetSources(): Promise<Source[]> {
  const { data, error } = await db()
    .from("sources")
    .select("*")
    .order("updated_at", { ascending: false });
  check(error);
  return (data as SourceRecord[]).map(toSource);
}

export async function dbGetSource(id: string): Promise<Source | null> {
  const { data, error } = await db().from("sources").select("*").eq("id", id).maybeSingle();
  check(error);
  return data ? toSource(data as SourceRecord) : null;
}

export async function dbSaveSource(s: Source) {
  const { error } = await db().from("sources").upsert(fromSource(s));
  check(error);
}

export async function dbGetResearch(): Promise<Research | null> {
  const { data, error } = await db()
    .from("research_settings")
    .select("topic, keywords")
    .eq("id", 1)
    .maybeSingle();
  check(error);
  return data as Research | null;
}

export async function dbSaveResearch(r: Research) {
  const { error } = await db()
    .from("research_settings")
    .upsert({ id: 1, topic: r.topic, keywords: r.keywords, updated_at: new Date().toISOString() });
  check(error);
}

export async function dbCountDrafts(): Promise<number> {
  const { count, error } = await db().from("ai_drafts").select("id", { count: "exact", head: true });
  check(error);
  return count ?? 0;
}

// ── 논문 원고 · 버전 기록 · AI 초안 목록 ───────────────────────────────────────

export async function dbGetDoc(projectId: string): Promise<ThesisDoc | null> {
  const { data, error } = await db().from("documents").select("doc").eq("project_id", projectId).maybeSingle();
  check(error);
  return (data?.doc as ThesisDoc) ?? null;
}

export async function dbSaveDoc(doc: ThesisDoc, version: DocVersion) {
  const { error } = await db()
    .from("documents")
    .upsert({ project_id: doc.projectId, doc, updated_at: doc.updatedAt });
  check(error);
  const { error: vErr } = await db().from("document_versions").insert({
    id: version.id,
    project_id: version.projectId,
    saved_at: version.savedAt,
    chars: version.chars,
    memo: version.memo,
    doc: version.doc,
  });
  check(vErr);
}

/** 버전 목록 (원고 내용은 빼고 가볍게) */
export async function dbListVersions(projectId: string): Promise<Omit<DocVersion, "doc">[]> {
  const { data, error } = await db()
    .from("document_versions")
    .select("id, project_id, saved_at, chars, memo")
    .eq("project_id", projectId)
    .order("saved_at", { ascending: false });
  check(error);
  return (data as { id: string; project_id: string; saved_at: string; chars: number; memo: string }[]).map((r) => ({
    id: r.id,
    projectId: r.project_id,
    savedAt: r.saved_at,
    chars: r.chars,
    memo: r.memo,
  }));
}

export async function dbGetVersion(id: string): Promise<DocVersion | null> {
  const { data, error } = await db().from("document_versions").select("*").eq("id", id).maybeSingle();
  check(error);
  if (!data) return null;
  return { id: data.id, projectId: data.project_id, savedAt: data.saved_at, chars: data.chars, memo: data.memo, doc: data.doc };
}

export async function dbListDrafts(): Promise<AiDraftRecord[]> {
  const { data, error } = await db()
    .from("ai_drafts")
    .select("id, project_id, topic, title, manuscript, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  check(error);
  return (data as { id: string; project_id: string | null; topic: string; title: string; manuscript: AiDraftRecord["manuscript"]; created_at: string }[]).map((r) => ({
    id: r.id,
    projectId: r.project_id,
    topic: r.topic,
    title: r.title,
    manuscript: r.manuscript,
    createdAt: r.created_at,
  }));
}
