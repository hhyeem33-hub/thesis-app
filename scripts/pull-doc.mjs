// 온라인(슈파베이스)에 저장한 원고를 내 컴퓨터로 가져온다 → localhost 글쓰기·HWPX 출력에서 쓸 수 있게.
//   npm run db:pull-doc -- "AI 논문"            → 확인만 (아무것도 바꾸지 않음)
//   npm run db:pull-doc -- "AI 논문" --apply    → 실제로 가져옴
//
// - 주인 계정(.env.local 의 OWNER_EMAIL)의 프로젝트를 이름으로 찾는다.
// - 내 컴퓨터에 같은 이름 프로젝트가 있으면 거기에, 없으면 프로젝트 기록만 새로 만든다 (폴더는 만들지 않음 → 표의 '다시 시도'로 만들 수 있음).
// - 내 컴퓨터 원고가 이미 있으면 지우지 않고 히스토리에 버전으로 남긴 뒤 바꾼다.
// - 각주에 연결된 자료가 내 컴퓨터에 없으면 그 자료도 가져온다 (참고문헌이 똑같이 나오게).
// - data 폴더(앱 기록)만 쓴다. 옵시디언 보관함·구글 드라이브는 건드리지 않는다. 키는 화면에 출력하지 않는다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const DATA = path.join(ROOT, "data");
const APPLY = process.argv.includes("--apply");
const NAME = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "AI 논문";

try {
  process.loadEnvFile(path.join(ROOT, ".env.local"));
} catch {
  console.error(".env.local 파일이 없어요.");
  process.exit(1);
}
const url = (process.env.SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const owner = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
if (!url || !key || key.includes("[SENSITIVE]") || !owner) {
  console.error(".env.local 에 SUPABASE_URL · SUPABASE_SECRET_KEY · OWNER_EMAIL 이 있어야 해요.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback);
const writeJson = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
const countChars = (body) => Array.from(body.replace(/\[\^([a-z0-9]{4,12})\]/g, "").replace(/^#{1,3}\s+/gm, "")).length;

// 1) 주인 계정 · 온라인 프로젝트 · 원고
let uid = null;
for (let page = 1; !uid; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw new Error(error.message);
  uid = data.users.find((u) => u.email?.toLowerCase() === owner)?.id ?? null;
  if (data.users.length < 1000) break;
}
if (!uid) throw new Error(`${owner} 계정을 온라인에서 찾지 못했어요.`);

const { data: projects, error: pErr } = await db.from("projects").select("*").eq("user_id", uid).eq("name", NAME);
if (pErr) throw new Error(pErr.message);
if (!projects?.length) throw new Error(`온라인에 ‘${NAME}’ 프로젝트가 없어요.`);
const op = projects[0];

const { data: row, error: dErr } = await db.from("documents").select("doc, updated_at").eq("project_id", op.id).eq("user_id", uid).maybeSingle();
if (dErr) throw new Error(dErr.message);
if (!row?.doc) throw new Error(`온라인 ‘${NAME}’ 프로젝트에 저장된 원고가 없어요.`);
const { research: _research, ...onlineDoc } = row.doc;

// 2) 내 컴퓨터 프로젝트
const localProjects = readJson(path.join(DATA, "projects.json"), []);
let lp = localProjects.find((p) => p.name === NAME);
const newProject = !lp;
if (!lp) {
  const note = { ok: false, error: "온라인에서 가져온 프로젝트예요. ‘다시 시도’를 누르면 폴더를 만들어요." };
  lp = { id: op.id, name: op.name, description: op.description ?? "", createdAt: op.created_at, obsidian: note, drive: note };
}

// 3) 각주에 연결된 자료
const used = new Set([...onlineDoc.body.matchAll(/\[\^([a-z0-9]{4,12})\]/g)].map((m) => m[1]));
const sourceIds = [...new Set(onlineDoc.footnotes.filter((f) => f.sourceId && used.has(f.id)).map((f) => f.sourceId))];
const localSources = readJson(path.join(DATA, "sources.json"), []);
const missing = sourceIds.filter((id) => !localSources.some((s) => s.id === id));
let fetched = [];
if (missing.length) {
  const { data, error } = await db.from("sources").select("*").eq("user_id", uid).in("id", missing);
  if (error) throw new Error(error.message);
  fetched = (data ?? []).map((r) => ({
    id: r.id,
    projectId: r.project_id === op.id ? lp.id : null,
    title: r.title,
    type: r.type,
    origin: r.origin,
    content: r.content,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    classification: r.classification,
    bib: r.bib ?? null,
  }));
}

// 4) 원고
const docs = readJson(path.join(DATA, "documents.json"), {});
const versions = readJson(path.join(DATA, "document-versions.json"), []);
const before = docs[lp.id];
const now = new Date().toISOString();
const doc = { ...onlineDoc, projectId: lp.id, updatedAt: now };

console.log(`온라인 ‘${NAME}’ 원고: 제목 ‘${onlineDoc.title || "(없음)"}’ · ${countChars(onlineDoc.body).toLocaleString()}자 · 각주 ${used.size}개 · 연결 자료 ${sourceIds.length}개`);
console.log(`내 컴퓨터: 프로젝트 ${newProject ? "새로 만듦(기록만)" : "있음"} · 원고 ${before ? "있음 → 히스토리에 남기고 바꿈" : "없음 → 새로 넣음"} · 가져올 자료 ${fetched.length}개`);
if (!APPLY) {
  console.log("확인만 했어요. 실제로 가져오려면 --apply 를 붙여 다시 실행해요.");
  process.exit(0);
}

if (newProject) writeJson(path.join(DATA, "projects.json"), [...localProjects, lp]);
if (fetched.length) writeJson(path.join(DATA, "sources.json"), [...localSources, ...fetched]);
if (before)
  versions.push({ id: randomUUID(), projectId: lp.id, savedAt: now, chars: countChars(before.body), memo: "온라인 원고를 가져오기 전 내 컴퓨터 원고", doc: before });
versions.push({ id: randomUUID(), projectId: lp.id, savedAt: now, chars: countChars(doc.body), memo: "온라인 원고 가져옴", doc });
docs[lp.id] = doc;
writeJson(path.join(DATA, "documents.json"), docs);
writeJson(path.join(DATA, "document-versions.json"), versions);
console.log("가져왔어요. localhost 글쓰기에서 프로젝트를 ‘" + NAME + "’로 고르면 보여요.");
