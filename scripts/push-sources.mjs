// 내 컴퓨터 자료(data/sources.json)를 온라인 슈파베이스 sources 표에 넣는다: npm run db:push
//
// - 키는 .env.local 의 SUPABASE_URL, SUPABASE_SECRET_KEY(또는 SUPABASE_SERVICE_ROLE_KEY)에서 읽는다.
//   .env.local 은 .gitignore 에 있어서 깃허브에 올라가지 않는다. 키는 화면에 출력하지 않는다.
// - 이미 온라인에 있는 자료는 건너뛴다 (중복 없음). 분류 결과 등 온라인 값은 덮어쓰지 않는다.
// - SQL 파일을 일부만 실행해서 글이 중간까지만 들어간 자료는 나머지를 채운다.
// - 프로젝트는 이름으로 찾아 연결한다 (온라인에 같은 이름의 프로젝트가 없으면 연결 없이 넣음).
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
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

// 온라인 프로젝트 이름 → id
const { data: onlineProjects, error: pErr } = await db.from("projects").select("id, name");
if (pErr) fail("온라인 프로젝트 읽기", pErr);
const onlineProjectId = new Map(onlineProjects.map((p) => [p.name, p.id]));
const projectFor = (localId) => {
  const name = localProjects.find((p) => p.id === localId)?.name;
  return (name && onlineProjectId.get(name)) || null;
};

// 온라인에 이미 있는 자료 (내용 길이 비교용)
const online = new Map();
for (let from = 0; ; from += 100) {
  const { data, error } = await db.from("sources").select("id, content").range(from, from + 99);
  if (error) fail("온라인 자료 읽기", error);
  for (const r of data) online.set(r.id, r.content);
  if (data.length < 100) break;
}
console.log(`온라인에 이미 있는 자료: ${online.size}개 · 내 컴퓨터 자료: ${local.length}개`);

const toInsert = local.filter((s) => !online.has(s.id));
// SQL 파일을 중간까지만 실행해 글이 앞부분만 들어간 자료
const toFill = local.filter((s) => {
  const c = online.get(s.id);
  return c !== undefined && c !== s.content && c.length < s.content.length && s.content.startsWith(c);
});
const different = local.filter((s) => {
  const c = online.get(s.id);
  return c !== undefined && c !== s.content && !s.content.startsWith(c);
});

let inserted = 0;
for (let i = 0; i < toInsert.length; i += 10) {
  const batch = toInsert.slice(i, i + 10).map((s) => ({
    id: s.id,
    project_id: projectFor(s.projectId),
    title: s.title,
    type: s.type,
    origin: s.origin,
    content: s.content,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
    classification: s.classification,
  }));
  // 그 사이 누가 넣었어도 중복되지 않게 (같은 id는 건너뜀)
  const { error } = await db.from("sources").upsert(batch, { onConflict: "id", ignoreDuplicates: true });
  if (error) fail(`${i + 1}~${i + batch.length}번째 넣기`, error);
  inserted += batch.length;
  process.stdout.write(`\r넣는 중… ${inserted}/${toInsert.length}`);
}
if (toInsert.length) process.stdout.write("\n");

let filled = 0;
for (const s of toFill) {
  const { error } = await db.from("sources").update({ content: s.content }).eq("id", s.id);
  if (error) fail(`'${s.title}' 나머지 글 채우기`, error);
  filled++;
}

// 확인: 다시 읽어서 내 컴퓨터 자료와 비교
const after = new Map();
for (let from = 0; ; from += 100) {
  const { data, error } = await db.from("sources").select("id, content").range(from, from + 99);
  if (error) fail("확인용 다시 읽기", error);
  for (const r of data) after.set(r.id, r.content);
  if (data.length < 100) break;
}
const same = local.filter((s) => after.get(s.id) === s.content).length;

console.log(
  JSON.stringify(
    {
      새로_넣음: inserted,
      중간까지만_있던_글_채움: filled,
      이미_있어서_건너뜀: local.length - toInsert.length - toFill.length,
      내용이_달라서_그대로_둠: different.map((s) => s.title),
      확인_원본과_같은_자료: `${same}/${local.length}`,
      온라인_전체_자료: after.size,
    },
    null,
    2
  )
);
