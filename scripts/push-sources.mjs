// 내 컴퓨터 자료(data/sources.json)를 온라인 슈파베이스 sources 표와 맞춘다.
//   npm run db:push            → 확인만 (읽기만 하고 아무것도 바꾸지 않음)
//   npm run db:push -- --apply → 실제로 넣고 고침
//
// - 키는 .env.local 의 SUPABASE_URL, SUPABASE_SECRET_KEY(또는 SUPABASE_SERVICE_ROLE_KEY)에서 읽는다.
//   .env.local 은 .gitignore 에 있어서 깃허브에 올라가지 않는다. 키는 화면에 출력하지 않는다.
// - 온라인에 없는 자료는 새로 넣는다 (같은 id는 절대 두 번 들어가지 않음).
// - 온라인 글이 원본과 다르면(붙여 넣기로 줄바꿈이 CR+LF로 바뀐 것, 중간까지만 들어간 것, 잘린 것)
//   그 자료의 '본문(content)'만 원본으로 바꾼다. 분류 결과 등 다른 칸은 건드리지 않는다.
// - 이 앱이 가져온 자료(id가 data/sources.json 에 있는 것)만 다룬다. 옵시디언 원본 노트는 읽지도 않는다.
// - 프로젝트는 이름으로 찾아 연결한다 (온라인에 같은 이름의 프로젝트가 없으면 연결 없이 넣음).
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const APPLY = process.argv.includes("--apply");
try {
  process.loadEnvFile(path.join(ROOT, ".env.local"));
} catch {
  console.error(".env.local 파일이 없어요. 안내대로 키를 넣어 주세요.");
  process.exit(1);
}

const url = (process.env.SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const looksReal = (v) => v && !v.includes("[SENSITIVE]") && !v.includes("여기에");
if (!looksReal(url) || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
  console.error("SUPABASE_URL 이 비어 있거나 모양이 달라요. 예: https://abcdefgh.supabase.co");
  process.exit(1);
}
if (!looksReal(key) || !(key.startsWith("sb_secret_") || key.startsWith("eyJ"))) {
  console.error("비밀 키가 비어 있거나 모양이 달라요. sb_secret_ 로 시작하는 Secret key 를 넣어 주세요.");
  console.error("(sb_publishable_ 로 시작하는 공개 키로는 넣을 수 없어요.)");
  process.exit(1);
}
console.log(`연결할 곳: ${url} (키 끝 4자리 …${key.slice(-4)})`);

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const local = JSON.parse(readFileSync(path.join(ROOT, "data", "sources.json"), "utf8"));
const localProjects = JSON.parse(readFileSync(path.join(ROOT, "data", "projects.json"), "utf8"));
const fail = (what, error) => {
  console.error(`${what} 실패: ${error.message}`);
  if (/Invalid API key|JWT|401/i.test(error.message)) console.error("→ 키가 틀렸거나 다른 프로젝트의 키예요. 다시 복사해 주세요.");
  if (/relation .* does not exist|schema cache/i.test(error.message))
    console.error("→ 온라인에 sources 표가 없어요. schema.sql 을 SQL Editor에서 먼저 Run해 주세요.");
  process.exit(1);
};

const onlineBib = new Map();
async function readOnline() {
  const map = new Map();
  for (let from = 0; ; from += 100) {
    const { data, error } = await db.from("sources").select("id, content, bib").order("id").range(from, from + 99);
    if (error) fail("온라인 자료 읽기", error);
    for (const r of data) {
      map.set(r.id, r.content);
      onlineBib.set(r.id, r.bib);
    }
    if (data.length < 100) break;
  }
  return map;
}

// 온라인 프로젝트 이름 → id
const { data: onlineProjects, error: pErr } = await db.from("projects").select("id, name");
if (pErr) fail("온라인 프로젝트 읽기", pErr);
const onlineProjectId = new Map(onlineProjects.map((p) => [p.name, p.id]));
const projectFor = (localId) => {
  const name = localProjects.find((p) => p.id === localId)?.name;
  return (name && onlineProjectId.get(name)) || null;
};

const online = await readOnline();
console.log(`온라인 sources 표 전체: ${online.size}개 · 내 컴퓨터 자료: ${local.length}개`);

// 상태 나누기 (CR = 붙여 넣을 때 생긴 윈도우 줄바꿈 문자)
const noCR = (s) => s.replace(/\r/g, "");
const kinds = { 정확히_같음: [], 새로_넣을_것: [], 줄바꿈만_다름: [], 중간까지만_들어감: [], 원본과_다름: [] };
for (const s of local) {
  const c = online.get(s.id);
  if (c === undefined) kinds.새로_넣을_것.push(s);
  else if (c === s.content) kinds.정확히_같음.push(s);
  else if (noCR(c) === s.content) kinds.줄바꿈만_다름.push(s);
  else if (s.content.startsWith(noCR(c))) kinds.중간까지만_들어감.push(s);
  else kinds.원본과_다름.push(s);
}
// 서지 정보: 온라인에서 비어 있는 저자·연도만 내 컴퓨터 값으로 채운다 (온라인에서 고친 값은 그대로)
const bibFill = [];
for (const s of local) {
  if (!online.has(s.id) || !s.bib) continue;
  const cur = onlineBib.get(s.id);
  const next = cur ? { ...cur, authors: cur.authors || s.bib.authors, year: cur.year || s.bib.year } : s.bib;
  if (JSON.stringify(next) !== JSON.stringify(cur)) bibFill.push({ id: s.id, bib: next });
}
kinds.서지_빈칸_채울_것 = bibFill;
const counts = Object.fromEntries(Object.entries(kinds).map(([name, list]) => [name, list.length]));
console.log("[지금 온라인 상태]", JSON.stringify(counts, null, 2));
for (const s of kinds.원본과_다름) {
  const c = noCR(online.get(s.id));
  let i = 0;
  while (i < c.length && c[i] === s.content[i]) i++;
  console.log(`  ⚠️ '${s.title.slice(0, 40)}' 원본 ${s.content.length}자 · 온라인(CR 뺀) ${c.length}자 · ${i + 1}번째 글자부터 다름`);
}

if (!APPLY) {
  console.log("확인만 했어요 (아무것도 바꾸지 않음). 고치려면: npm run db:push -- --apply");
  process.exit(0);
}

let inserted = 0;
for (let i = 0; i < kinds.새로_넣을_것.length; i += 10) {
  const batch = kinds.새로_넣을_것.slice(i, i + 10).map((s) => ({
    id: s.id,
    project_id: projectFor(s.projectId),
    title: s.title,
    type: s.type,
    origin: s.origin,
    content: s.content,
    bib: s.bib ?? null,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
    classification: s.classification,
  }));
  // 그 사이 누가 넣었어도 중복되지 않게 (같은 id는 건너뜀)
  const { error } = await db.from("sources").upsert(batch, { onConflict: "id", ignoreDuplicates: true });
  if (error) fail(`${i + 1}~${i + batch.length}번째 넣기`, error);
  inserted += batch.length;
}
console.log(`새로 넣음: ${inserted}개`);

let bibDone = 0;
for (const { id, bib } of bibFill) {
  const { error } = await db.from("sources").update({ bib }).eq("id", id);
  if (error) fail("서지 정보 채우기", error);
  bibDone++;
}
console.log(`서지 빈칸 채움: ${bibDone}개`);

const toFix = [...kinds.줄바꿈만_다름, ...kinds.중간까지만_들어감, ...kinds.원본과_다름];
let fixed = 0;
for (const s of toFix) {
  // 이 자료 하나(eq id)의 본문만 바꾼다
  const { error } = await db.from("sources").update({ content: s.content }).eq("id", s.id);
  if (error) fail(`'${s.title}' 본문 고치기`, error);
  fixed++;
}
console.log(`본문 고침: ${fixed}개`);

// 확인: 다시 읽어서 원본과 비교
const after = await readOnline();
const same = local.filter((s) => after.get(s.id) === s.content).length;
console.log(`[확인] 원본과 정확히 같은 자료 ${same}/${local.length} · 온라인 sources 표 전체 ${after.size}개`);
