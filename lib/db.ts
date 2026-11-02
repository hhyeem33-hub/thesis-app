import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FolderStatus, Project } from "./types";

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
