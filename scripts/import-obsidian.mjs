// 옵시디언 보관함의 스크랩 노트를 '자료'로 가져온다: node scripts/import-obsidian.mjs
//
// ⚠️ 보관함은 읽기만 한다 (절대 쓰지 않음).
// - 가져오는 것: Clippings/*.md (웹 스크랩) + 맨 위 "무제 1.md"(연구 개요 메모)
// - 중복 제거: 본문이 같거나 웹 주소가 같으면 하나만 (이름에 " 1", " 2"가 없는 원본을 남김)
// - 옛 AI 위키의 [예시 결과] 분류는 가져오지 않는다 (미분류로 넣고 AI 분류로 다시 매김)
// - 자료 id는 노트 경로로 정해져서, 여러 번 실행해도 같은 자료가 두 번 들어가지 않는다
//
// 결과: data/sources.json (내 컴퓨터) + supabase/import/*.sql (온라인용, 깃허브 제외)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const settings = JSON.parse(readFileSync(path.join(ROOT, "data", "settings.json"), "utf8"));
const VAULT = settings.obsidianVaultPath;
const PROJECT_NAME = "한중 수면 건강식품 웰니스 연구";
const MEMO = "무제 1.md";

const projects = JSON.parse(readFileSync(path.join(ROOT, "data", "projects.json"), "utf8"));
const projectId = projects.find((p) => p.name === PROJECT_NAME)?.id ?? null;

const norm = (s) => s.replace(/\s+/g, " ").trim();
const sha1 = (s) => createHash("sha1").update(s).digest("hex");
/** 노트 경로로 정해지는 UUID 모양 id */
function stableId(rel) {
  const h = sha1(`obsidian:${rel}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function readNote(rel) {
  const full = path.join(VAULT, rel);
  const raw = readFileSync(full, "utf8");
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const fm = {};
  if (m)
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([\w_]+):\s*(.*)$/);
      if (kv) fm[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1").trim();
    }
  const body = (m ? raw.slice(m[0].length) : raw).trim();
  return { rel, fm, body, mtime: statSync(full).mtime };
}

function toDate(s, fallback) {
  const d = s ? new Date(s) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : fallback.toISOString();
}

// " 1", " 2" 사본보다 원본 이름이 먼저 오게 정렬
const clipFiles = readdirSync(path.join(VAULT, "Clippings"))
  .filter((f) => f.endsWith(".md"))
  .sort((a, b) => {
    const base = (f) => f.replace(/ \d+\.md$/, ".md");
    const num = (f) => Number(f.match(/ (\d+)\.md$/)?.[1] ?? 0);
    return base(a).localeCompare(base(b), "ko") || num(a) - num(b);
  });

const seenBody = new Set();
const seenUrl = new Set();
const skipped = [];
const sources = [];
for (const f of clipFiles) {
  const n = readNote(`Clippings/${f}`);
  const url = n.fm.source || "";
  const h = sha1(norm(n.body));
  if (seenBody.has(h) || (url && seenUrl.has(url))) {
    skipped.push(n.rel);
    continue;
  }
  seenBody.add(h);
  if (url) seenUrl.add(url);
  const created = toDate(n.fm.created, n.mtime);
  sources.push({
    id: stableId(n.rel),
    projectId,
    title: n.fm.title || f.replace(/\.md$/, ""),
    type: "web",
    origin: url,
    content: n.body,
    createdAt: created,
    updatedAt: created,
    classification: null,
  });
}

if (existsSync(path.join(VAULT, MEMO))) {
  const n = readNote(MEMO);
  const title = n.body.match(/^#\s+(.+)$/m)?.[1]?.trim() || "연구 개요 메모";
  sources.push({
    id: stableId(n.rel),
    projectId,
    title,
    type: "markdown",
    origin: `내 메모 (옵시디언 ${MEMO})`,
    content: n.body,
    createdAt: n.mtime.toISOString(),
    updatedAt: n.mtime.toISOString(),
    classification: null,
  });
}

// ── 내 컴퓨터: data/sources.json 에 합치기 (이미 있는 id는 건너뜀 → 분류 결과 보존) ──
const localFile = path.join(ROOT, "data", "sources.json");
const local = existsSync(localFile) ? JSON.parse(readFileSync(localFile, "utf8")) : [];
const have = new Set(local.map((s) => s.id));
const added = sources.filter((s) => !have.has(s.id));
writeFileSync(localFile, JSON.stringify([...local, ...added], null, 2) + "\n", "utf8");

// ── 온라인: 슈파베이스 SQL Editor 에서 실행할 파일 (약 700KB씩 나눔) ──
const outDir = path.join(ROOT, "supabase", "import");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

function dollar(s) {
  let tag = "$t$";
  for (let i = 0; s.includes(tag); i++) tag = `$t${i}$`;
  return `${tag}${s}${tag}`;
}
const projectSql = `(select id from public.projects where name = ${dollar(PROJECT_NAME)})`;
const row = (s) =>
  `insert into public.sources (id, project_id, title, type, origin, content, created_at, updated_at, classification)
values ('${s.id}', ${projectSql}, ${dollar(s.title)}, '${s.type}', ${dollar(s.origin)}, ${dollar(s.content)}, '${s.createdAt}', '${s.updatedAt}', null)
on conflict (id) do nothing;`;

const LIMIT = 700_000; // 바이트 (SQL Editor가 버거워하지 않게)
const chunks = [[]];
let size = 0;
for (const s of sources) {
  const sql = row(s);
  const bytes = Buffer.byteLength(sql, "utf8");
  if (size + bytes > LIMIT && chunks.at(-1).length) {
    chunks.push([]);
    size = 0;
  }
  chunks.at(-1).push(sql);
  size += bytes;
}
chunks.forEach((c, i) => {
  const name = `${String(i + 1).padStart(2, "0")}-sources.sql`;
  writeFileSync(
    path.join(outDir, name),
    `-- 옵시디언 자료 가져오기 ${i + 1}/${chunks.length} (${c.length}개). 여러 번 실행해도 중복으로 들어가지 않는다.\n` +
      c.join("\n\n") +
      "\n",
    "utf8"
  );
});

console.log(
  JSON.stringify(
    {
      보관함: VAULT,
      프로젝트: projectId ? PROJECT_NAME : "(찾지 못해 연결 안 함)",
      가져올_자료: sources.length,
      중복이라_뺀_노트: skipped.length,
      내컴퓨터_새로_추가: added.length,
      내컴퓨터_이미_있어서_건너뜀: sources.length - added.length,
      온라인_SQL_파일: chunks.map((c, i) => `${String(i + 1).padStart(2, "0")}-sources.sql (${c.length}개)`),
    },
    null,
    2
  )
);
console.log("뺀 중복:", skipped.join(", "));
