import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireUserId, requireWriter } from "./auth";
import { ONLINE } from "./online";
import type {
  AiDraftRecord,
  ProjectResearchRecord,
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
//
// 여러 사람이 각자 계정으로 쓴다: 모든 읽기·쓰기에 "지금 로그인한 사람(user_id)"을 붙인다.
// 비밀 키는 RLS를 건너뛰므로, 여기서 user_id 로 꼭 거른다. (RLS 정책은 supabase/auth.sql)

export { ONLINE };

let client: SupabaseClient | null = null;

/** 비밀 키로 여는 서버 전용 연결 (계정 넘겨받기 같은 관리 작업에도 씀) */
export function db() {
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
  if (!error) return;
  if (/user_id/.test(error.message) && /does not exist|schema cache/.test(error.message))
    throw new Error("슈파베이스에 계정 칸(user_id)이 아직 없어요. SQL Editor에서 supabase/auth.sql 을 Run해 주세요.");
  throw new Error(`슈파베이스 오류: ${error.message}`);
}

/** 이 프로젝트가 지금 로그인한 사람 것인지 확인 (남의 원고·연구 설정을 건드리지 않게) */
async function assertMyProject(uid: string, projectId: string) {
  const { data, error } = await db().from("projects").select("id").eq("id", projectId).eq("user_id", uid).maybeSingle();
  check(error);
  if (!data) throw new Error("이 프로젝트를 찾을 수 없어요.");
}

export async function dbGetProjects(): Promise<Project[]> {
  const uid = await requireUserId();
  const { data, error } = await db()
    .from("projects")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false });
  check(error);
  return (data as ProjectRecord[]).map(toProject);
}

export async function dbAddProject(p: Project) {
  const uid = await requireWriter();
  const { error } = await db().from("projects").insert({
    id: p.id,
    user_id: uid,
    name: p.name,
    description: p.description,
    created_at: p.createdAt,
    obsidian: p.obsidian,
    drive: p.drive,
  });
  // 같은 사람이 같은 이름을 동시에 만들면 unique 제약에 걸린다
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
  const uid = await requireWriter();
  if (d.projectId) await assertMyProject(uid, d.projectId);
  const { error } = await db().from("ai_drafts").insert({
    user_id: uid,
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
  const uid = await requireUserId();
  const rows: SourceRecord[] = [];
  // 슈파베이스는 한 번에 1,000줄까지만 주므로 나눠 읽는다
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db()
      .from("sources")
      .select("*")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false })
      .range(from, from + 999);
    check(error);
    rows.push(...(data as SourceRecord[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return rows.map(toSource);
}

export async function dbGetSource(id: string): Promise<Source | null> {
  const uid = await requireUserId();
  const { data, error } = await db().from("sources").select("*").eq("id", id).eq("user_id", uid).maybeSingle();
  check(error);
  return data ? toSource(data as SourceRecord) : null;
}

export async function dbSaveSource(s: Source) {
  const uid = await requireWriter();
  if (s.projectId) await assertMyProject(uid, s.projectId);
  // 이미 있는 자료면 "내 것일 때만" 고친다 (남의 자료를 같은 id로 덮어쓰지 않게)
  const { data: existing, error: rErr } = await db().from("sources").select("user_id").eq("id", s.id).maybeSingle();
  check(rErr);
  if (existing) {
    if (existing.user_id !== uid) throw new Error("이 자료를 고칠 수 없어요.");
    const { error } = await db().from("sources").update(fromSource(s)).eq("id", s.id).eq("user_id", uid);
    check(error);
  } else {
    const { error } = await db().from("sources").insert({ ...fromSource(s), user_id: uid });
    check(error);
  }
}

/** 공통 연구 설정 — 사람마다 user_settings.research 에 */
export async function dbGetResearch(): Promise<Research | null> {
  const uid = await requireUserId();
  const { data, error } = await db().from("user_settings").select("research").eq("user_id", uid).maybeSingle();
  check(error);
  return (data?.research as Research | null) ?? null;
}

export async function dbSaveResearch(r: Research) {
  const uid = await requireWriter();
  const { error } = await db()
    .from("user_settings")
    .upsert({ user_id: uid, research: { topic: r.topic, keywords: r.keywords }, updated_at: new Date().toISOString() });
  check(error);
}

/** 사람마다 저장한 Claude API 키 (서버에서만 읽음, 화면에는 끝 4자리만) */
export async function dbGetUserAiKey(): Promise<string> {
  const uid = await requireWriter();
  const { data, error } = await db().from("user_settings").select("ai_key").eq("user_id", uid).maybeSingle();
  check(error);
  return (data?.ai_key as string | null)?.trim() ?? "";
}

export async function dbSaveUserAiKey(key: string | null) {
  const uid = await requireWriter();
  const { error } = await db()
    .from("user_settings")
    .upsert({ user_id: uid, ai_key: key, updated_at: new Date().toISOString() });
  check(error);
}

export async function dbCountDrafts(): Promise<number> {
  const uid = await requireUserId();
  const { count, error } = await db()
    .from("ai_drafts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid);
  check(error);
  return count ?? 0;
}

// ── 논문 원고 · 버전 기록 · AI 초안 목록 ───────────────────────────────────────

async function readDocRow(uid: string, projectId: string) {
  const { data, error } = await db()
    .from("documents")
    .select("doc")
    .eq("project_id", projectId)
    .eq("user_id", uid)
    .maybeSingle();
  check(error);
  return data?.doc as (ThesisDoc & { research?: ProjectResearchRecord }) | undefined;
}

export async function dbGetDoc(projectId: string): Promise<ThesisDoc | null> {
  const uid = await requireUserId();
  return (await readDocRow(uid, projectId)) ?? null;
}

export async function dbSaveDoc(doc: ThesisDoc, version: DocVersion) {
  const uid = await requireWriter();
  await assertMyProject(uid, doc.projectId);
  // 같은 줄에 함께 저장된 프로젝트 연구 설정(research)은 그대로 둔다
  const research = (await readDocRow(uid, doc.projectId))?.research;
  const { error } = await db()
    .from("documents")
    .upsert({ project_id: doc.projectId, user_id: uid, doc: research ? { ...doc, research } : doc, updated_at: doc.updatedAt });
  check(error);
  const { error: vErr } = await db().from("document_versions").insert({
    id: version.id,
    user_id: uid,
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
  const uid = await requireUserId();
  const { data, error } = await db()
    .from("document_versions")
    .select("id, project_id, saved_at, chars, memo")
    .eq("project_id", projectId)
    .eq("user_id", uid)
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
  const uid = await requireUserId();
  const { data, error } = await db().from("document_versions").select("*").eq("id", id).eq("user_id", uid).maybeSingle();
  check(error);
  if (!data) return null;
  return { id: data.id, projectId: data.project_id, savedAt: data.saved_at, chars: data.chars, memo: data.memo, doc: data.doc };
}

export async function dbListDrafts(): Promise<AiDraftRecord[]> {
  const uid = await requireUserId();
  const { data, error } = await db()
    .from("ai_drafts")
    .select("id, project_id, topic, title, manuscript, created_at")
    .eq("user_id", uid)
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

// ── 프로젝트별 연구 설정 (documents.doc.research 에 함께 저장 — 새 표 없이) ──────

export async function dbGetProjectResearch(projectId: string): Promise<ProjectResearchRecord | null> {
  const uid = await requireUserId();
  return (await readDocRow(uid, projectId))?.research ?? null;
}

export async function dbSaveProjectResearch(projectId: string, research: ProjectResearchRecord, emptyDoc: ThesisDoc) {
  const uid = await requireWriter();
  await assertMyProject(uid, projectId);
  const doc = { ...((await readDocRow(uid, projectId)) ?? emptyDoc), research };
  const { error } = await db()
    .from("documents")
    .upsert({ project_id: projectId, user_id: uid, doc, updated_at: new Date().toISOString() });
  check(error);
}

// ── 계정 준비: 처음 로그인할 때 ───────────────────────────────────────────────

const OWNED_TABLES = ["projects", "sources", "ai_drafts", "documents", "document_versions"] as const;

/**
 * 로그인 직후 한 번 부른다.
 * - 주인 계정: 아직 주인이 없는 자료(로그인 기능 전에 만든 것, db:push 로 올린 것)를 내 계정으로 넘겨받고,
 *   예전 공통 연구 설정(research_settings)도 내 설정으로 옮긴다.
 * - 프로젝트가 하나도 없으면 '새 프로젝트 1'을 만든다.
 */
export async function dbPrepareAccount(user: { id: string; isOwner: boolean }) {
  const uid = user.id;
  const claimed: Record<string, number> = {};
  if (user.isOwner) {
    for (const t of OWNED_TABLES) {
      const { data, error } = await db().from(t).update({ user_id: uid }).is("user_id", null).select("user_id");
      check(error);
      claimed[t] = data?.length ?? 0;
    }
    const { data: mine } = await db().from("user_settings").select("research").eq("user_id", uid).maybeSingle();
    if (!mine?.research) {
      const { data: old } = await db().from("research_settings").select("topic, keywords").eq("id", 1).maybeSingle();
      if (old) {
        const { error } = await db()
          .from("user_settings")
          .upsert({ user_id: uid, research: { topic: old.topic, keywords: old.keywords }, updated_at: new Date().toISOString() });
        check(error);
      }
    }
  }
  const { count, error } = await db().from("projects").select("id", { count: "exact", head: true }).eq("user_id", uid);
  check(error);
  let created = false;
  if (!count) {
    const { error: pErr } = await db().from("projects").insert({
      user_id: uid,
      name: "새 프로젝트 1",
      description: "처음 로그인해서 자동으로 만든 프로젝트예요. 이름은 프로젝트 화면에서 새로 만들 수 있어요.",
      obsidian: { ok: false, localOnly: true },
      drive: { ok: false, localOnly: true },
    });
    if (pErr?.code !== "23505") check(pErr);
    created = !pErr;
  }
  return { claimed, created };
}
