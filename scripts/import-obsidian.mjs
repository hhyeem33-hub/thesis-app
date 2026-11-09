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
  const lists = {};
  if (m) {
    let key = null;
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([\w_]+):\s*(.*)$/);
      if (kv) {
        key = kv[1];
        fm[key] = kv[2].replace(/^"(.*)"$/, "$1").trim();
        continue;
      }
      // 목록 값 (예: author: 아래 줄의  - "[[감성균 기자]]")
      const item = line.match(/^\s+-\s+(.*)$/);
      if (item && key)
        (lists[key] ??= []).push(item[1].replace(/^"(.*)"$/, "$1").replace(/^\[\[(.*)\]\]$/, "$1").trim());
    }
  }
  const body = (m ? raw.slice(m[0].length) : raw).replace(/\r\n?/g, "\n").trim();
  return { rel, fm, lists, body, mtime: statSync(full).mtime };
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

/** 스크랩 노트 머리말의 author 목록·published 날짜 → 서지 정보 (모르면 빈 칸) */
function bibFromNote(n) {
  const authors = n.lists.author ?? (n.fm.author ? [n.fm.author.replace(/^\[\[(.*)\]\]$/, "$1")] : []);
  return {
    kind: "web",
    authors: authors.map((a) => a.trim()).filter(Boolean).join(", "),
    year: (n.fm.published || "").match(/(19|20)\d{2}/)?.[0] ?? "",
    journal: "",
    volume: "",
    issue: "",
    pages: "",
    publisher: "",
    place: "",
    doi: "",
    kciId: "",
    category: "",
  };
}

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
    bib: bibFromNote(n),
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
// 이미 있는 자료는 비어 있는 저자·연도 칸만 채운다 (연구자가 고친 값은 그대로)
const fresh = new Map(sources.map((s) => [s.id, s]));
let bibFilled = 0;
for (const s of local) {
  const from = fresh.get(s.id)?.bib;
  if (!from || (!from.authors && !from.year)) continue;
  const cur = s.bib ?? { ...from, authors: "", year: "" };
  const next = { ...cur, authors: cur.authors || from.authors, year: cur.year || from.year };
  if (next.authors !== (s.bib?.authors ?? "") || next.year !== (s.bib?.year ?? "")) {
    s.bib = next;
    bibFilled++;
  }
}
writeFileSync(localFile, JSON.stringify([...local, ...added], null, 2) + "\n", "utf8");

// ── 온라인: 슈파베이스 SQL Editor 에서 실행할 파일 ──
// SQL Editor는 너무 큰 쿼리를 거부한다 ("Query is too large"). 그래서
// - 파일 하나(part-NN.sql)에 노트 최대 10개, 크기 최대 약 100KB (150KB도 거부된 적이 있어 여유 있게)
// - 아주 긴 글은 2만 자씩 잘라서, 첫 조각은 insert, 나머지는 update로 이어 붙인다.
//   이어 붙이기는 "글자 수가 이 조각의 시작~끝 사이일 때만" 해서 두 번 실행해도 중복되지 않는다.
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
/**
 * 글 값. 메모장 → SQL Editor 로 붙여 넣으면 줄바꿈이 CR+LF로 바뀌어 글자 수가 늘어난다
 * (원본 노트에는 CR이 없음). 그래서 넣을 때 CR(chr(13))을 빼서 원본과 똑같이 저장한다.
 */
const text = (s) => `replace(${dollar(s)}, chr(13), '')`;
const projectSql = `(select id from public.projects where name = ${dollar(PROJECT_NAME)})`;

const MAX_PER_FILE = 10;
const MAX_FILE_BYTES = 100_000;
const PIECE_CHARS = 20_000; // 한글 2만 자 ≈ 60KB

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
values ('${s.id}', ${projectSql}, ${text(s.title)}, '${s.type}', ${text(s.origin)}, ${text(pieces[0])}, '${s.createdAt}', '${s.updatedAt}', null)
on conflict (id) do nothing;`,
    },
  ];
  let done = Array.from(pieces[0]).length;
  for (const piece of pieces.slice(1)) {
    const start = done;
    done += Array.from(piece).length;
    // 글이 이 조각의 시작~끝 사이까지만 들어가 있으면: 시작까지 남기고 이 조각을 붙인다.
    // (예전에 3만 자 조각으로 일부만 넣은 경우도 이어서 채워지고, 두 번 실행해도 그대로)
    out.push({
      after: done,
      sql: `update public.sources set content = left(content, ${start}) || ${text(piece)}
where id = '${s.id}' and length(content) >= ${start} and length(content) < ${done};`,
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
    path.join(outDir, `part-${pad(i)}.sql`),
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
  path.join(outDir, "check-progress.sql"),
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

// 검증용: 온라인 노트가 원래 글과 정확히 같은지 (읽기만 함). 글자 수 + 지문(md5)으로 비교한다.
// 일부만 들어간 노트는 "조각 경계(2만 자 단위, 예전 파일은 3만 자 단위)까지 원래와 같으면" 정상으로 본다.
const md5 = (s) => createHash("md5").update(s, "utf8").digest("hex");
const expectRows = [];
const titleRows = [];
for (const s of sources) {
  const chars = Array.from(s.content);
  const full = chars.length;
  const cuts = new Set([full]);
  for (const step of [PIECE_CHARS, 30_000]) for (let b = step; b < full; b += step) cuts.add(b);
  titleRows.push(`('${s.id}'::uuid, ${dollar(s.title)}, ${full})`);
  for (const b of [...cuts].sort((a, z) => a - z))
    expectRows.push(`('${s.id}'::uuid, ${b}, '${md5(chars.slice(0, b).join(""))}')`);
}
writeFileSync(
  path.join(outDir, "verify-notes.sql"),
  `-- ✔ 노트 검증 (아무것도 바꾸지 않고 읽기만 합니다)
-- 옵시디언에서 가져온 노트 ${sources.length}개를 원래 글과 글자 수·지문(md5)으로 비교합니다.
-- '⚠️ 원래와 다름' 줄이 없으면, 잘못 바뀐 노트는 하나도 없는 것입니다.
with notes (id, title, full_len) as (
  values
  ${titleRows.join(",\n  ")}
),
expected (id, len, hash) as (
  values
  ${expectRows.join(",\n  ")}
),
judged as (
  select n.title,
         case
           when s.id is null then '아직 안 들어감'
           when length(s.content) = n.full_len
                and md5(s.content) = (select x.hash from expected x where x.id = n.id and x.len = n.full_len)
             then '정확히 같음'
           when exists (select 1 from expected x where x.id = n.id and x.len = length(s.content) and x.hash = md5(s.content))
             then '중간까지 정상 (남은 part를 넣으면 채워짐)'
           when exists (select 1 from expected x where x.id = n.id
                          and x.len = length(replace(s.content, chr(13), ''))
                          and x.hash = md5(replace(s.content, chr(13), '')))
             then '줄바꿈(CR)만 다름 (글은 같음)'
           else '⚠️ 원래와 다름'
         end as 상태
  from notes n
  left join public.sources s on s.id = n.id
)
select 상태, count(*) as 노트_수, left(string_agg(title, ' / ' order by title), 300) as 노트_제목_예시
from judged
group by 상태
order by case 상태 when '⚠️ 원래와 다름' then 0 when '정확히 같음' then 3 when '줄바꿈(CR)만 다름 (글은 같음)' then 1 else 2 end;
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
      서지_빈칸_채움: bibFilled,
      내컴퓨터_이미_있어서_건너뜀: sources.length - added.length,
      온라인_SQL_파일_수: files.length,
      가장_큰_파일_KB: Math.round(biggest / 1000),
      온라인_SQL_파일: files.map((f, i) => `part-${pad(i)}.sql (새 자료 ${f.items}개, ${Math.round(f.bytes / 1000)}KB)`),
    },
    null,
    2
  )
);
console.log("뺀 중복:", skipped.join(", "));
