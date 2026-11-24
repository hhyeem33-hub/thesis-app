// 구글 드라이브 '논문작업실/<프로젝트>' 를 자료 유형별 폴더로 다시 정리한다. 내 컴퓨터 전용 (데스크톱 앱 폴더).
//   npm run drive:reorganize                → 확인만 (아무것도 쓰지·옮기지 않음, 계획을 보여 줌)
//   npm run drive:reorganize -- --apply     → 실제로 만들고 옮김
//   옵션: --project "한중 수면 건강식품 웰니스 연구"
//
// 만드는 것: 01_학위논문(국내·중국) 02_학술지논문(국내·중국) 03_단행본 04_보고서·통계 05_신문기사·웹자료
//            06_영상자료 07_원고 08_출력물 99_분류확인필요 + 자료마다 .docx + 폴더마다 00_목록.xlsx
// 규칙: 아무것도 지우거나 덮어쓰지 않는다. 같은 이름이 이미 있으면 새 파일은 건너뛰고, 옮길 때는 _2 를 붙인다.
//       예전 폴더·연습용 프로젝트 폴더는 '_정리 전 보관' 으로 옮기기만 한다. 옵시디언은 읽지도 쓰지도 않는다.
import { copyFileSync, constants, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import JSZip from "jszip";

const ROOT = process.cwd();
const { MATERIAL_FOLDER, UNSURE_FOLDER, guessMaterial, guessRegion, isMaterialType } = await import(
  pathToFileURL(path.join(ROOT, "lib", "material-type.ts")).href
);

const LISTS = process.argv.includes("--lists"); // 00_목록.xlsx 만 다시 (--apply 와 같이)
const APPLY = process.argv.includes("--apply");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PROJECT = arg("--project", "한중 수면 건강식품 웰니스 연구");

const readJson = (f, fb) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : fb);
const settings = readJson(path.join(ROOT, "data", "settings.json"), {});
const driveRoot = settings.driveRootPath;
if (!driveRoot || !existsSync(driveRoot)) {
  console.error("구글 드라이브 폴더를 찾지 못했어요. 앱 설정의 ‘내 드라이브 경로’와 구글 드라이브 앱을 확인해 주세요.");
  process.exit(1);
}
const WORKROOM = path.join(driveRoot, "논문작업실");
const base = path.join(WORKROOM, PROJECT);
const inside = (p) => path.resolve(p).startsWith(path.resolve(WORKROOM) + path.sep);
if (!inside(base) || !existsSync(base)) throw new Error(`프로젝트 폴더가 없어요: ${base}`);

const ARCHIVE = path.join(WORKROOM, "_정리 전 보관");
const OLD_FOLDERS = ["01_선행연구_한국(KCI)", "02_선행연구_중국(CNKI)", "03_시장보고서·기사", "04_유튜브·영상자료", "05_원고", "06_출력물(HWPX·PDF)"];
const OLD_PROJECTS = ["시연 프로젝트", "연습 프로젝트 쓰기", "테스트 프로젝트"];
const DOC_FOLDER = "07_원고";
const OUT_FOLDER = "08_출력물";

// 사람이 보고 정한 것 (자동 짐작을 덮어씀): null = 99_분류확인필요
const OVERRIDE = {
  "45b5fbba": [null, "제목이 ‘카티’뿐이고 본문이 비어 있음 (KATI 농식품수출정보 글)"],
  b1f11b74: [null, "제목이 ‘카티’뿐이고 본문이 비어 있음 (KATI 농식품수출정보 글)"],
  "379c69e1": [null, "제목이 ‘카티’뿐이고 본문이 비어 있음 (KATI 농식품수출정보 글)"],
  "700b0dd6": [null, "제목이 ‘카티’뿐이고 본문이 비어 있음 (KATI 농식품수출정보 글)"],
  "375b2b11": [null, "제목이 기관 이름(한국표준협회)뿐이고 본문이 비어 있음"],
  daf61980: [null, "채용 공고 (연구 자료인지 확인 필요)"],
  b8fa867a: ["신문기사·웹자료", "중국 잡지의 짧은 직업 소개 글 (연구자 확정 2026-11-24)"],
  "8f771ae0": ["보고서·통계", "무역협회 베이징지부 시장 동향"],
};
// 자료 폴더가 아니라 07_원고 에 두기로 한 것 (연구자 확정 2026-11-24): 내 옵시디언 메모(초안)
const TO_DOC = new Set(["c3462d38"]);
// 올린 PDF 의 빈 서지 칸 채우기 (PDF 첫 쪽에서 읽은 것)
const META = {
  "6415ec13": { title: "2025年睡眠健康行业词条报告", bib: { authors: "何婉怡", year: "2025", publisher: "头豹研究院" } },
  "1960e0fe": { title: "健康睡眠的千亿“蓝海”", bib: { kind: "article", authors: "田晖", year: "2025", journal: "健康", issue: "8" } },
};
// 원래 PDF 파일 → 자료 id (docx 에 ‘같은 폴더의 PDF’ 로 적고, PDF 도 그 폴더로 옮김)
const PDF_OF = {
  "6415ec13": "H301_AP202507141708834004_1.pdf",
  "1960e0fe": "健康睡眠的千亿“蓝海”_田晖.pdf",
  b8fa867a: "睡眠疗愈师.pdf",
};

const sources = readJson(path.join(ROOT, "data", "sources.json"), []);
const DECISION = { adopted: "채택", held: "보류", excluded: "제외" };
const host = (o) => {
  try {
    return new URL(o).hostname.replace(/^www\.|^m\./, "");
  } catch {
    return "";
  }
};
const safe = (t, max = 90) =>
  t
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .replace(/[. ]+$/, "") || "제목 없음";
const cleanTitle = (t) => t.replace(/\s*[:|]\s*네이버\s*(블로그|카페)\s*$/, "").replace(/\s+/g, " ").trim();

// 1) 자료마다 갈 곳 정하기
const items = [];
for (const s of sources) {
  if (s.classification?.decision?.status === "excluded") continue;
  const key = s.id.slice(0, 8);
  const meta = META[key];
  const bib = { ...(s.bib ?? {}) };
  if (meta) for (const [k, v] of Object.entries(meta.bib)) if (!bib[k]) bib[k] = v;
  let title = cleanTitle(meta?.title ?? s.title);
  // KISS 제목은 "논문 제목 - 학술지명 - 발행기관" 꼴 → 나눠서 출처 칸에, 연도는 본문 앞 "2004.10" 에서
  if (/kiss\.kstudy\.com/.test(s.origin)) {
    const parts = title.split(" - ");
    if (parts.length >= 3) {
      title = parts.slice(0, -2).join(" - ");
      if (!bib.journal) bib.journal = parts.at(-2);
      if (!bib.publisher) bib.publisher = parts.at(-1);
    }
    if (!bib.year) bib.year = (s.content ?? "").slice(0, 800).match(/\b((?:19|20)\d{2})\.\d{1,2}\b/)?.[1] ?? "";
  }
  const guess = guessMaterial(s);
  const [type, reason] = OVERRIDE[key] ?? (isMaterialType(s.bib?.materialType) ? [s.bib.materialType, "앱에 저장된 유형"] : [guess.type, guess.reason]);
  const region = type === "학위논문" || type === "학술지논문" ? guessRegion({ ...s, title }) : null;
  const folder = TO_DOC.has(key) ? DOC_FOLDER : type ? path.join(MATERIAL_FOLDER[type], region ?? "") : UNSURE_FOLDER;
  const authors = (bib.authors ?? "").split(/\s*[,，、;]\s*/).filter(Boolean);
  const who = authors.length > 1 ? `${authors[0]} 외` : authors[0] || bib.publisher || bib.journal || host(s.origin) || "저자미상";
  const year = bib.year || "연도미상";
  const from = [bib.journal && `${bib.journal}${bib.volume ? ` ${bib.volume}` : ""}${bib.issue ? `(${bib.issue})` : ""}${bib.pages ? `, ${bib.pages}쪽` : ""}`, bib.publisher]
    .filter(Boolean)
    .join(" · ") || host(s.origin) || (s.origin.startsWith("내 파일") ? "내 파일(PDF)" : s.origin.startsWith("내 메모") ? "내 메모(옵시디언)" : "");
  items.push({
    s,
    key,
    bib,
    title,
    type,
    reason,
    region,
    folder,
    who: authors.join(", ") || bib.publisher || "",
    year: bib.year || "",
    from,
    decision: DECISION[s.classification?.decision?.status] ?? "미정",
    fileBase: safe(`${safe(who, 30)}_${year}_${title}`),
  });
}
// 같은 폴더에서 이름이 겹치면 _2, _3
const used = new Map();
for (const it of items) {
  const k = `${it.folder}|${it.fileBase.toLowerCase()}`;
  const n = (used.get(k) ?? 0) + 1;
  used.set(k, n);
  it.fileName = `${it.fileBase}${n > 1 ? `_${n}` : ""}.docx`;
}

// 2) 옮길 파일·폴더
const moves = [];
const moveFile = (fromRel, toFolder) => moves.push({ from: path.join(base, fromRel), toDir: path.join(base, toFolder) });
for (const [key, pdf] of Object.entries(PDF_OF)) {
  const it = items.find((x) => x.key === key);
  if (it) moveFile(path.join("02_선행연구_중국(CNKI)", pdf), it.folder);
}
const listFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f !== "desktop.ini" && !f.startsWith("00_목록")) : []);
for (const f of listFiles(path.join(base, "04_유튜브·영상자료"))) if (/\.(gdoc|gsheet|mp4|mov|url)$/i.test(f)) moveFile(path.join("04_유튜브·영상자료", f), MATERIAL_FOLDER["영상자료"]);
for (const f of listFiles(path.join(base, "05_원고"))) if (!/^00_/.test(f)) moveFile(path.join("05_원고", f), DOC_FOLDER);
for (const f of listFiles(path.join(base, "06_출력물(HWPX·PDF)"))) moveFile(path.join("06_출력물(HWPX·PDF)", f), OUT_FOLDER);
const folderMoves = [
  ...OLD_FOLDERS.filter((f) => existsSync(path.join(base, f))).map((f) => ({ from: path.join(base, f), toDir: path.join(ARCHIVE, `${PROJECT} (예전 폴더)`) })),
  ...OLD_PROJECTS.filter((f) => existsSync(path.join(WORKROOM, f))).map((f) => ({ from: path.join(WORKROOM, f), toDir: ARCHIVE })),
];

// 3) 계획 보여 주기
const ALL_FOLDERS = [
  path.join(MATERIAL_FOLDER["학위논문"], "국내"),
  path.join(MATERIAL_FOLDER["학위논문"], "중국"),
  path.join(MATERIAL_FOLDER["학술지논문"], "국내"),
  path.join(MATERIAL_FOLDER["학술지논문"], "중국"),
  MATERIAL_FOLDER["단행본"],
  MATERIAL_FOLDER["보고서·통계"],
  MATERIAL_FOLDER["신문기사·웹자료"],
  MATERIAL_FOLDER["영상자료"],
  DOC_FOLDER,
  OUT_FOLDER,
  UNSURE_FOLDER,
];
const LIST_FOLDERS = [...ALL_FOLDERS, MATERIAL_FOLDER["학위논문"], MATERIAL_FOLDER["학술지논문"]];
const rel = (p) => path.relative(WORKROOM, p);
console.log(`정리할 곳: ${base}`);
console.log(`자료 ${items.length}개 (‘제외’ 결정 ${sources.length - items.length}개 빼고)`);
for (const f of ALL_FOLDERS) {
  const n = items.filter((x) => x.folder === f).length;
  const m = moves.filter((x) => path.relative(base, x.toDir) === f).length;
  console.log(`  ${f.padEnd(18)} 자료 .docx ${n}개${m ? ` + 옮길 파일 ${m}개` : ""}`);
}
console.log(`\n[${UNSURE_FOLDER}] 목록`);
for (const it of items.filter((x) => x.folder === UNSURE_FOLDER)) console.log(`  - ${it.title.slice(0, 60)}  ← ${it.reason}`);
console.log("\n[옮길 파일]");
for (const m of moves) console.log(`  ${rel(m.from)}  →  ${rel(m.toDir)}${existsSync(m.from) ? "" : "  (없음, 건너뜀)"}`);
console.log("\n[‘_정리 전 보관’으로 옮길 폴더]");
for (const m of folderMoves) console.log(`  ${rel(m.from)}  →  ${rel(m.toDir)}`);
// ── 여기부터 실제 쓰기 ─────────────────────────────────────────────────────────
const FONT = "맑은 고딕";
const p = (text, opts = {}) => new Paragraph({ children: [new TextRun({ text, font: FONT, ...opts })], spacing: { after: 120 } });
const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "C9B8A6" };
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
const row = (label, value) =>
  new TableRow({
    children: [
      new TableCell({
        width: { size: 22, type: WidthType.PERCENTAGE },
        borders,
        shading: { fill: "F5EDE3" },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, font: FONT, size: 20 })] })],
      }),
      new TableCell({
        width: { size: 78, type: WidthType.PERCENTAGE },
        borders,
        children: [
          typeof value === "string"
            ? new Paragraph({ children: [new TextRun({ text: value || "—", font: FONT, size: 20 })] })
            : new Paragraph({ children: [value] }),
        ],
      }),
    ],
  });

async function makeDocx(it) {
  const c = it.s.classification ?? {};
  const d = c.decision ?? {};
  const link = /^https?:\/\//.test(it.s.origin)
    ? new ExternalHyperlink({ link: it.s.origin, children: [new TextRun({ text: it.s.origin.slice(0, 200), style: "Hyperlink", font: FONT, size: 20 })] })
    : PDF_OF[it.key]
      ? `같은 폴더의 원본 PDF: ${PDF_OF[it.key]}`
      : it.s.origin || "—";
  const rows = [
    row("자료 유형", it.type ? `${it.type}${it.region ? ` (${it.region})` : ""}` : "분류 확인 필요"),
    row("저자", it.who || "[확인 필요]"),
    row("연도", it.year || "[확인 필요]"),
    row("출처", it.from || "[확인 필요]"),
    row("링크", link),
    row("내 결정", it.decision),
    row("관련도", c.relevance ? `${c.relevance} / 5` : "아직 AI 판단 안 함"),
    row("토픽·키워드", [d.finalTopic || c.topic, (d.finalKeywords?.length ? d.finalKeywords : c.keywords ?? []).join(", ")].filter(Boolean).join(" · ") || "—"),
  ];
  if (!it.type) rows.push(row("확인할 점", it.reason));
  const children = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: it.title, font: FONT, bold: true, size: 30 })], spacing: { after: 240 } }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "AI 요약", font: FONT, bold: true, size: 24 })], spacing: { before: 300, after: 120 } }),
    p(c.summary || "아직 AI 요약이 없어요."),
  ];
  if (c.reason) children.push(p(`AI 판단 근거: ${c.reason}`, { color: "6B5B4B", size: 20 }));
  if (d.note) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "내 메모", font: FONT, bold: true, size: 24 })], spacing: { before: 300, after: 120 } }));
    children.push(p(d.note));
  }
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 400 },
      children: [new TextRun({ text: `논문작업실에서 만듦 · ${new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}`, font: FONT, size: 16, color: "9A8A7A" })],
    })
  );
  const doc = new Document({ creator: "논문작업실", title: it.title, sections: [{ children }] });
  return Packer.toBuffer(doc);
}

// 아주 작은 xlsx (머리글 굵게·고정, 필터)
const xmlEsc = (v) => String(v ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const colName = (i) => String.fromCharCode(65 + i);
async function makeXlsx(sheetName, headers, rows, widths) {
  const all = [headers, ...rows];
  const sheetRows = all
    .map(
      (r, ri) =>
        `<row r="${ri + 1}">${r
          .map((v, ci) =>
            typeof v === "number"
              ? `<c r="${colName(ci)}${ri + 1}" s="${ri ? 2 : 1}"><v>${v}</v></c>`
              : `<c r="${colName(ci)}${ri + 1}" t="inlineStr" s="${ri ? 2 : 1}"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`
          )
          .join("")}</row>`
    )
    .join("");
  const last = `${colName(headers.length - 1)}${all.length}`;
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xmlEsc(sheetName).slice(0, 31)}'!$A$1:$${colName(headers.length - 1)}$${all.length}</definedName></definedNames></workbook>`
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
  );
  zip.file(
    "xl/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="${FONT}"/></font><font><b/><sz val="10"/><name val="${FONT}"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF5EDE3"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFC9B8A6"/></left><right style="thin"><color rgb="FFC9B8A6"/></right><top style="thin"><color rgb="FFC9B8A6"/></top><bottom style="thin"><color rgb="FFC9B8A6"/></bottom></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/><xf fontId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>`
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths
      .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
      .join("")}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

// --sample <폴더>: 드라이브는 건드리지 않고 견본 .docx 몇 개와 00_목록.xlsx 만 그 폴더에 만들어 봄
const SAMPLE = arg("--sample", "");
if (SAMPLE) {
  mkdirSync(SAMPLE, { recursive: true });
  const pick = [items.find((x) => x.type === "학술지논문"), items.find((x) => x.key === "1960e0fe"), items.find((x) => !x.type)].filter(Boolean);
  for (const it of pick) writeFileSync(path.join(SAMPLE, it.fileName), await makeDocx(it));
  const list = items.filter((x) => x.folder === pick[0].folder).slice(0, 20);
  writeFileSync(path.join(SAMPLE, "00_목록.xlsx"), await makeXlsx("견본", ["번호", "저자", "연도", "제목", "출처(학술지·기관)", "내 결정", "파일 이름"], list.map((it, i) => [i + 1, it.who, it.year, it.title, it.from, it.decision, it.fileName]), [6, 22, 8, 60, 30, 9, 50]));
  console.log(`\n견본을 만들었어요: ${SAMPLE}`);
  process.exit(0);
}
if (!APPLY) {
  console.log("\n확인만 했어요. 실제로 하려면 --apply 를 붙여 다시 실행해요.");
  process.exit(0);
}

let written = 0;
let skipped = 0;
let moved = 0;
const writeNew = (file, buf) => {
  if (!inside(file)) throw new Error(`논문작업실 밖에는 쓸 수 없어요: ${file}`);
  try {
    writeFileSync(file, buf, { flag: "wx" });
    written++;
  } catch (e) {
    if (e.code === "EEXIST") skipped++;
    else throw e;
  }
};
// 덮어쓰지 않는 옮기기: 같은 이름이 있으면 _2, _3 …
const freeName = (dir, name) => {
  const ext = path.extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  let candidate = name;
  for (let n = 2; existsSync(path.join(dir, candidate)); n++) candidate = `${stem}_${n}${ext}`;
  return candidate;
};
const safeMove = (from, toDir, isDir = false) => {
  if (!existsSync(from)) return null;
  if (!inside(from) || !inside(toDir)) throw new Error(`논문작업실 밖은 옮길 수 없어요: ${from}`);
  mkdirSync(toDir, { recursive: true });
  const name = isDir ? (() => { let c = path.basename(from); for (let n = 2; existsSync(path.join(toDir, c)); n++) c = `${path.basename(from)}_${n}`; return c; })() : freeName(toDir, path.basename(from));
  const to = path.join(toDir, name);
  if (existsSync(to)) throw new Error(`이미 있어요(옮기지 않음): ${to}`);
  renameSync(from, to);
  moved++;
  return to;
};

// --lists: 파일은 그대로 두고 폴더마다 00_목록.xlsx 만 지금 상태로 다시 만든다.
//          예전 목록은 지우지 않고 '_정리 전 보관/예전 00_목록 (날짜)/<폴더>' 로 옮긴다.
if (LISTS) {
  const missing = items.filter((it) => !existsSync(path.join(base, it.folder, it.fileName)));
  for (const it of missing) console.log(`  ! 폴더에 .docx 가 없어요: ${it.folder}/${it.fileName}`);
  const stamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(/:/g, "").replace(" ", "_").slice(0, 15);
  const old = path.join(ARCHIVE, `예전 00_목록 (${stamp})`);
  for (const f of LIST_FOLDERS) {
    const to = safeMove(path.join(base, f, "00_목록.xlsx"), path.join(old, f));
    if (to) console.log(`예전 목록 보관: ${f}/00_목록.xlsx → ${rel(to)}`);
  }
  await writeAllLists();
  process.exit(0);
}

// a) 폴더 만들기
for (const f of ALL_FOLDERS) mkdirSync(path.join(base, f), { recursive: true });
// b) 자료 .docx
for (const it of items) writeNew(path.join(base, it.folder, it.fileName), await makeDocx(it));
console.log(`\n자료 .docx: 새로 ${written}개 · 이미 있어 건너뜀 ${skipped}개`);
// c) 파일 옮기기 (원본 PDF·영상 목록·원고·출력물)
const movedInto = new Map(); // 폴더 → 옮겨 온 파일 이름들
for (const m of moves) {
  const to = safeMove(m.from, m.toDir);
  if (to) {
    const k = path.relative(base, m.toDir);
    movedInto.set(k, [...(movedInto.get(k) ?? []), path.basename(to)]);
    console.log(`옮김: ${rel(m.from)} → ${rel(to)}`);
  }
}
// d) 예전 폴더·연습용 프로젝트 → _정리 전 보관 (지우지 않고 옮기기만)
for (const m of folderMoves) {
  const to = safeMove(m.from, m.toDir, true);
  if (to) console.log(`보관: ${rel(m.from)} → ${rel(to)}`);
}

// e) 폴더마다 00_목록.xlsx
await writeAllLists();

async function writeAllLists() {
const HEAD = ["번호", "저자", "연도", "제목", "출처(학술지·기관)", "내 결정", "파일 이름"];
const W = [6, 22, 8, 60, 30, 9, 50];
const rowsOf = (list) => list.map((it, i) => [i + 1, it.who, it.year, it.title, it.from, it.decision, it.fileName]);
const sortKo = (a, b) => (a.who || "힣").localeCompare(b.who || "힣", "ko") || a.title.localeCompare(b.title, "ko");
const listWritten = [];
const writeList = async (folder, list, extraFiles = []) => {
  const rows = rowsOf([...list].sort(sortKo));
  for (const f of extraFiles) rows.push([rows.length + 1, "", "", f, "옮겨 온 파일", "", f]);
  const file = path.join(base, folder, "00_목록.xlsx");
  const before = written;
  writeNew(file, await makeXlsx(path.basename(folder), HEAD, rows, W));
  listWritten.push(`${folder}${written > before ? "" : " (이미 있어 건너뜀)"}`);
};
for (const f of ALL_FOLDERS) {
  const list = items.filter((x) => x.folder === f);
  // 자료 .docx·원본 PDF 말고 폴더에 실제로 있는 파일(옮겨 온 영상 목록 등)도 목록에 넣는다
  const mine = new Set(list.map((it) => it.fileName));
  const extra = listFiles(path.join(base, f)).filter((n) => !mine.has(n) && !Object.values(PDF_OF).includes(n));
  if (f === UNSURE_FOLDER) {
    const rows = [...list].sort(sortKo).map((it, i) => [i + 1, it.who, it.year, it.title, it.from, it.decision, it.reason, it.s.origin, it.fileName]);
    const file = path.join(base, f, "00_목록.xlsx");
    writeNew(file, await makeXlsx("분류확인필요", ["번호", "저자", "연도", "제목", "출처", "내 결정", "확인할 점", "링크", "파일 이름"], rows, [6, 18, 8, 50, 22, 9, 45, 40, 45]));
    listWritten.push(f);
    continue;
  }
  if (f === DOC_FOLDER || f === OUT_FOLDER) {
    const files = listFiles(path.join(base, f));
    const file = path.join(base, f, "00_목록.xlsx");
    writeNew(file, await makeXlsx(f, ["번호", "파일 이름", "종류", "고친 날"], files.map((n, i) => [i + 1, n, path.extname(n).slice(1).toUpperCase(), statSync(path.join(base, f, n)).mtime.toLocaleDateString("ko-KR")]), [6, 70, 10, 14]));
    listWritten.push(f);
    continue;
  }
  await writeList(f, list, extra);
}
// 국내·중국을 나눈 상위 폴더(01, 02)에도 합친 목록
for (const t of ["학위논문", "학술지논문"]) {
  const list = items.filter((x) => x.type === t).sort((a, b) => a.region.localeCompare(b.region, "ko") || sortKo(a, b));
  const rows = list.map((it, i) => [i + 1, it.region, it.who, it.year, it.title, it.from, it.decision, path.join(it.region, it.fileName)]);
  writeNew(path.join(base, MATERIAL_FOLDER[t], "00_목록.xlsx"), await makeXlsx(t, ["번호", "구분", "저자", "연도", "제목", "출처(학술지·기관)", "내 결정", "파일"], rows, [6, 8, 22, 8, 60, 30, 9, 55]));
  listWritten.push(MATERIAL_FOLDER[t]);
}
console.log(`00_목록.xlsx: ${listWritten.join(", ")}`);
}

// f) 앱 기록(data/sources.json)에 자료 유형 저장 + PDF 서지 빈 칸 채우기 (먼저 백업)
const backup = path.join(ROOT, "data", `sources.before-material-type.json`);
if (!existsSync(backup)) copyFileSync(path.join(ROOT, "data", "sources.json"), backup, constants.COPYFILE_EXCL);
const byId = new Map(items.map((it) => [it.s.id, it]));
let typed = 0;
const next = sources.map((s) => {
  const it = byId.get(s.id);
  if (!it) return s;
  const bib = { kind: s.type === "pdf" ? "article" : "web", authors: "", year: "", journal: "", volume: "", issue: "", pages: "", publisher: "", place: "", doi: "", kciId: "", category: "", ...(s.bib ?? {}) };
  for (const [k, v] of Object.entries(it.bib)) if (!bib[k] && v) bib[k] = v;
  if (it.type && !bib.materialType) {
    bib.materialType = it.type;
    typed++;
  }
  return { ...s, bib };
});
writeFileSync(path.join(ROOT, "data", "sources.json"), JSON.stringify(next, null, 2), "utf8");
console.log(`앱 자료 유형 저장: ${typed}개 (백업: data/sources.before-material-type.json)`);
console.log(`\n완료: 새 파일 ${written}개 · 건너뜀 ${skipped}개 · 옮김 ${moved}개 · 지운 것 0개`);
