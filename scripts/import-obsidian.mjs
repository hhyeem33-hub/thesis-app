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

// ── 온라인: 슈파베이스 SQL Editor 에서 실행할 파일 ──
// SQL Editor는 너무 큰 쿼리를 거부한다 ("Query is too large"). 그래서
// - 파일 하나에 자료 최대 20개, 크기 최대 약 150KB
// - 아주 긴 글은 3만 자씩 잘라서, 첫 조각은 insert, 나머지는 update로 이어 붙인다.
//   이어 붙이기는 "지금까지 들어간 글자 수가 딱 맞을 때만" 해서 두 번 실행해도 중복되지 않는다.
//   (그래서 파일은 번호 순서대로 실행해야 한다. 순서가 꼬였으면 처음부터 다시 실행하면 채워진다)
const outDir = path.join(ROOT, "supabase", "import");
// 폴더는 지우지 않고(메모장 등이 열고 있으면 실패하므로) 예전 .sql 파일만 지운다
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (f.endsWith(".sql")) rmSync(path.join(outDir, f), { force: true });

function dollar(s) {
  let tag = "$t$";
  for (let i = 0; s.includes(tag); i++) tag = `$t${i}$`;
  return `${tag}${s}${tag}`;
}
const projectSql = `(select id from public.projects where name = ${dollar(PROJECT_NAME)})`;

const MAX_PER_FILE = 20;
const MAX_FILE_BYTES = 150_000;
const PIECE_CHARS = 30_000; // 한글 3만 자 ≈ 90KB

/**
 * 자료 하나 → SQL 문장 여러 개. after = 그 문장까지 실행했을 때 글자 수
 * (글자 수는 PostgreSQL length()와 같게 코드포인트로 센다)
 */
function statements(s) {
  const chars = Array.from(s.content);
  const pieces = [];
  for (let i = 0; i < chars.length; i += PIECE_CHARS) pieces.push(chars.slice(i, i + PIECE_CHARS).join(""));
  if (!pieces.length) pieces.push("");
  const out = [
    {
      after: Array.from(pieces[0]).length,
      sql: `insert into public.sources (id, project_id, title, type, origin, content, created_at, updated_at, classification)
values ('${s.id}', ${projectSql}, ${dollar(s.title)}, '${s.type}', ${dollar(s.origin)}, ${dollar(pieces[0])}, '${s.createdAt}', '${s.updatedAt}', null)
on conflict (id) do nothing;`,
    },
  ];
  let done = Array.from(pieces[0]).length;
  for (const piece of pieces.slice(1)) {
    done += Array.from(piece).length;
    out.push({
      after: done,
      sql: `update public.sources set content = content || ${dollar(piece)}
where id = '${s.id}' and length(content) = ${done - Array.from(piece).length};`,
    });
  }
  return out;
}

const files = [{ stmts: [], items: 0, bytes: 0, done: new Map() }];
for (const s of sources) {
  const stmts = statements(s);
  // 새 자료는 파일에 20개가 찼거나 크기가 넘치면 다음 파일에서 시작
  const first = Buffer.byteLength(stmts[0].sql, "utf8");
  let cur = files.at(-1);
  if (cur.items >= MAX_PER_FILE || (cur.stmts.length && cur.bytes + first > MAX_FILE_BYTES)) {
    cur = { stmts: [], items: 0, bytes: 0, done: new Map() };
    files.push(cur);
  }
  cur.items++;
  for (const { sql: st, after } of stmts) {
    const b = Buffer.byteLength(st, "utf8");
    if (cur.stmts.length && cur.bytes + b > MAX_FILE_BYTES) {
      cur = { stmts: [], items: 0, bytes: 0, done: new Map() }; // 긴 글의 남은 조각은 다음 파일로
      files.push(cur);
    }
    cur.stmts.push(st);
    cur.bytes += b;
    // 이 파일을 다 실행하면 이 자료는 최소 after 글자가 들어가 있어야 한다
    cur.done.set(s.id, after);
  }
}
const pad = (i) => String(i + 1).padStart(2, "0");
files.forEach((f, i) => {
  const body = f.stmts.join("\n\n");
  // 머리말 3줄 + 본문 + 빈 줄 + 끝 표시 1줄 → 붙여 넣은 뒤 에디터의 마지막 줄 번호와 같아야 한다
  const lines = 3 + body.split("\n").length + 2;
  writeFileSync(
    path.join(outDir, `${pad(i)}-sources.sql`),
    `-- ▶ ${pad(i)}번 파일 시작 (${i + 1}/${files.length}) · 새 자료 ${f.items}개${f.stmts.length > f.items ? " + 긴 글 이어 붙이기" : ""} · 전체 ${lines}줄\n` +
      "-- 번호 순서대로 실행하세요. 여러 번 실행해도 중복으로 들어가지 않습니다.\n" +
      "-- 에디터를 비운 뒤 이 파일만 붙여 넣으세요. 맨 아래에 '■ 파일 끝' 줄이 보여야 합니다.\n" +
      body +
      `\n\n-- ■ ${pad(i)}번 파일 끝\n`,
    "utf8"
  );
});
const biggest = Math.max(...files.map((f) => f.bytes));

// 확인용: 슈파베이스에 어느 파일까지 다 들어갔는지 보여 주는 작은 쿼리 (글 내용 없이 id와 글자 수만)
const expectedRows = files.flatMap((f, i) => [...f.done].map(([id, len]) => `('${pad(i)}', '${id}'::uuid, ${len})`));
writeFileSync(
  path.join(outDir, "00-check.sql"),
  `-- ✔ 진행 상황 확인 (아무것도 바꾸지 않고 읽기만 합니다)
-- 결과 표에서 '상태'가 '완료'가 아닌 첫 번째 파일부터 다시 실행하면 됩니다.
with expected (file, id, len) as (
  values
  ${expectedRows.join(",\n  ")}
)
select e.file as 파일,
       count(*) as 자료,
       count(*) filter (where length(s.content) >= e.len) as 완료,
       count(*) filter (where s.id is not null and length(s.content) < e.len) as 일부만,
       count(*) filter (where s.id is null) as 없음,
       case when count(*) filter (where length(s.content) >= e.len) = count(*) then '완료'
            when count(s.id) = 0 then '아직 안 들어감'
            else '일부만 들어감' end as 상태
from expected e
left join public.sources s on s.id = e.id
group by e.file
order by e.file;
`,
  "utf8"
);

console.log(
  JSON.stringify(
    {
      보관함: VAULT,
      프로젝트: projectId ? PROJECT_NAME : "(찾지 못해 연결 안 함)",
      가져올_자료: sources.length,
      중복이라_뺀_노트: skipped.length,
      내컴퓨터_새로_추가: added.length,
      내컴퓨터_이미_있어서_건너뜀: sources.length - added.length,
      온라인_SQL_파일_수: files.length,
      가장_큰_파일_KB: Math.round(biggest / 1000),
      온라인_SQL_파일: files.map((f, i) => `${pad(i)}-sources.sql (새 자료 ${f.items}개, ${Math.round(f.bytes / 1000)}KB)`),
    },
    null,
    2
  )
);
console.log("뺀 중복:", skipped.join(", "));
