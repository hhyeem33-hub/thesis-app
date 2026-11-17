// 앱 자료를 구글 드라이브(데스크톱 앱 폴더) 구조로 내보낸다. 내 컴퓨터 전용.
//   npm run drive:export                 → 확인만 (아무것도 쓰지 않음)
//   npm run drive:export -- --apply      → 실제로 씀
//   옵션: --project "한중 수면 건강식품 웰니스 연구"  (드라이브 쪽 폴더 이름, 기본값 이것)
//         --doc "AI 논문"                           (05_원고로 내보낼 원고의 프로젝트, 기본값 이것)
//
// 규칙: 새 폴더·새 파일만 만든다. 같은 이름 파일이 있으면 건너뛴다(덮어쓰기·삭제 없음).
//       옵시디언 보관함은 읽지도 쓰지도 않는다. 자료는 data/*.json(앱 기록)에서 읽는다.
import { copyFileSync, constants, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APPLY = process.argv.includes("--apply");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PROJECT = arg("--project", "한중 수면 건강식품 웰니스 연구");
const DOC_PROJECT = arg("--doc", "AI 논문");

const readJson = (f, fb) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : fb);
const settings = readJson(path.join(ROOT, "data", "settings.json"), {});
const driveRoot = settings.driveRootPath;
if (!driveRoot || !existsSync(driveRoot)) {
  console.error("구글 드라이브 폴더를 찾지 못했어요. 앱 설정의 ‘내 드라이브 경로’와 구글 드라이브 앱을 확인해 주세요.");
  process.exit(1);
}
const base = path.join(driveRoot, "논문작업실", PROJECT);
// 안전장치: 반드시 <내 드라이브>\논문작업실\ 아래에만 쓴다
if (!path.resolve(base).startsWith(path.resolve(driveRoot, "논문작업실") + path.sep)) throw new Error("드라이브 논문작업실 폴더 밖에는 쓸 수 없어요.");

const FOLDERS = {
  kci: "01_선행연구_한국(KCI)",
  zh: "02_선행연구_중국(CNKI)",
  etc: "03_시장보고서·기사",
  yt: "04_유튜브·영상자료",
  doc: "05_원고",
  out: "06_출력물(HWPX·PDF)",
};

const projects = readJson(path.join(ROOT, "data", "projects.json"), []);
const sources = readJson(path.join(ROOT, "data", "sources.json"), []);
const docs = readJson(path.join(ROOT, "data", "documents.json"), {});
const nameOf = (id) => projects.find((p) => p.id === id)?.name ?? "연결 안 함";

const isZh = (s) => /[一-鿿]/.test(s.title) && !/[가-힣]/.test(s.title);
function folderFor(s) {
  if (s.type === "youtube" || /youtu\.?be/.test(s.origin)) return "yt";
  if (s.bib?.kciId || /kci\.go\.kr/.test(s.origin)) return "kci";
  if (isZh(s) || /cnki/i.test(s.origin)) return "zh";
  return "etc";
}
const safe = (t) => (t.replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80).replace(/[. ]+$/, "") || "제목 없음");
const DECISION = { adopted: "채택", held: "보류", excluded: "제외" };

function sourceMd(s) {
  const b = s.bib ?? {};
  const c = s.classification ?? {};
  const d = c.decision ?? {};
  const row = (k, v) => (v ? `- **${k}**: ${v}` : null);
  return [
    `# ${s.title}`,
    "",
    "## 출처·서지 정보",
    row("출처", s.origin || "미확인"),
    row("저자", b.authors),
    row("연도", b.year),
    row("학술지", b.journal),
    row("권·호", [b.volume, b.issue && `(${b.issue})`].filter(Boolean).join("")),
    row("쪽", b.pages),
    row("출판사·발행기관", b.publisher),
    row("DOI", b.doi),
    row("KCI 논문 ID", b.kciId),
    row("분류", b.category),
    row("연결 프로젝트", nameOf(s.projectId)),
    "",
    "## AI 판단 · 연구자 확정",
    row("연구자 결정", DECISION[d.status] ?? "미정"),
    row("관련도", c.relevance ? `${c.relevance} / 5` : "아직 판단 안 함"),
    row("토픽", d.finalTopic || c.topic),
    row("키워드", (d.finalKeywords?.length ? d.finalKeywords : c.keywords ?? []).join(", ")),
    row("근거", c.reason),
    row("요약", c.summary),
    row("내 관점 메모", d.note),
    "",
    "## 내용",
    "",
    s.content || "(내용 없음)",
    "",
    `---\n논문작업실에서 내보냄 · ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

// 원고(본문 # / ## + [^id] 각주) → 읽기용 Markdown
function docMd(doc) {
  const order = [];
  const body = doc.body.replace(/\[\^([a-z0-9]{4,12})\]/g, (_, id) => {
    if (!order.includes(id)) order.push(id);
    return `[^${order.indexOf(id) + 1}]`;
  });
  const notes = order.map((id, i) => `[^${i + 1}]: ${doc.footnotes.find((f) => f.id === id)?.text || "[보완 필요]"}`);
  return [`# ${doc.title || "(제목 없음)"}`, "", body.replace(/^# /gm, "## ").replace(/^## ## /gm, "### "), "", ...notes, ""].join("\n");
}

// 1) 내보낼 것 정하기: 기본은 채택한 자료, --all 이면 '제외'한 것만 빼고 전부 (AI 논문 프로젝트 것을 먼저)
const ALL = process.argv.includes("--all");
const docProject = projects.find((p) => p.name === DOC_PROJECT);
const adopted = sources
  .filter((s) => (ALL ? s.classification?.decision?.status !== "excluded" : s.classification?.decision?.status === "adopted"))
  .sort((a, b) => Number(b.projectId === docProject?.id) - Number(a.projectId === docProject?.id));
const plan = Object.fromEntries(Object.keys(FOLDERS).map((k) => [k, []]));
for (const s of adopted) plan[folderFor(s)].push({ name: `${safe(s.title)}.md`, text: sourceMd(s), title: s.title });

const doc = docProject && docs[docProject.id];
if (doc) plan.doc.push({ name: `${safe(doc.title || DOC_PROJECT)}.md`, text: docMd(doc), title: doc.title });

// 06: 이미 드라이브 'AI 작성글' 폴더에 있는 HWPX·PDF 를 복사 (원본은 그대로)
const outs = [];
for (const p of [DOC_PROJECT, PROJECT]) {
  const dir = path.join(driveRoot, "논문작업실", p, "AI 작성글");
  if (existsSync(dir)) for (const f of readdirSync(dir)) if (/\.(hwpx|pdf)$/i.test(f)) outs.push({ from: path.join(dir, f), name: f });
}

console.log(`내보낼 곳: ${base}`);
for (const [k, list] of Object.entries(plan)) if (k !== "out") console.log(`  ${FOLDERS[k]}: ${list.length}개`);
console.log(`  ${FOLDERS.out}: ${outs.length}개 (AI 작성글 폴더의 HWPX·PDF 복사)`);
if (!APPLY) {
  console.log("확인만 했어요. 실제로 쓰려면 --apply 를 붙여 다시 실행해요.");
  process.exit(0);
}

// 2) 쓰기 (새 파일만, 같은 이름은 건너뜀)
let written = 0;
let skipped = 0;
let refreshed = 0;
const writeNew = (file, text) => {
  try {
    writeFileSync(file, text, { encoding: "utf8", flag: "wx" });
    written++;
  } catch (e) {
    if (e.code === "EEXIST") skipped++;
    else throw e;
  }
};
for (const [k, label] of Object.entries(FOLDERS)) {
  const dir = path.join(base, label);
  mkdirSync(dir, { recursive: true });
  if (k === "out")
    for (const o of outs) {
      try {
        copyFileSync(o.from, path.join(dir, o.name), constants.COPYFILE_EXCL);
        written++;
      } catch (e) {
        if (e.code === "EEXIST") skipped++;
        else throw e;
      }
    }
  else for (const it of plan[k]) writeNew(path.join(dir, it.name), it.text);
  // 00_목록.md : 지금 폴더에 있는 파일 목록. 이 도구가 만든 목록(첫 줄 "# <폴더> 목록")만 새로 맞추고, 다른 파일은 건드리지 않는다
  const files = readdirSync(dir).filter((f) => f !== "00_목록.md").sort((a, b) => a.localeCompare(b, "ko"));
  const listFile = path.join(dir, "00_목록.md");
  const header = `# ${label} 목록`;
  const listText = [header, "", `파일 ${files.length}개 · ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} 기준`, "", ...files.map((f, i) => `${i + 1}. ${f}`), ""].join("\n");
  if (existsSync(listFile) && readFileSync(listFile, "utf8").split("\n")[0].trim() === header) {
    writeFileSync(listFile, listText, "utf8");
    refreshed++;
  } else writeNew(listFile, listText);
}
console.log(`완료: 새로 쓴 파일 ${written}개 · 같은 이름이 있어 건너뜀 ${skipped}개 · 목록 새로 맞춤 ${refreshed}개 (자료 파일은 덮어쓰거나 지운 것 없음)`);
