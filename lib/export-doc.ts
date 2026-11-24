import { footnoteNumbers, MARK_RE, NEED } from "./bib";
import { parseTable } from "./table";
import type { Footnote, ThesisDoc } from "./types";

// 글쓰기 원고 → 출력용 구조 (HTML · Markdown · PDF(인쇄) · Word 공용)
// 장 "# " → 1. / 절 "## " → 1.1. / 목 "### " → 1.1.1, 각주 [^id] → 본문 순서 번호

export type ExportDoc = Pick<ThesisDoc, "title" | "author" | "affiliation" | "body" | "footnotes" | "abstract" | "keywords">;

/** 글자와 각주 번호가 번갈아 나온다 */
export type Parts = (string | { note: number })[];

export type Block =
  | { kind: "heading"; level: 0 | 1 | 2; num: string; text: string }
  | { kind: "para"; parts: Parts }
  /** 표: 첫 행은 머리글, no = <표 N> 번호 */
  | { kind: "table"; no: number; caption: string; rows: Parts[][] };

/** 표 제목: 외대 양식처럼 "<표 1> 제목" */
export const tableCaption = (b: { no: number; caption: string }) => `<표 ${b.no}>${b.caption ? ` ${b.caption}` : ""}`;

export type Outline = {
  title: string;
  author: string;
  affiliation: string;
  /** 국문 초록 (문단은 빈 줄로) · 주제어 (없으면 빈 문자열) */
  abstract: string;
  keywords: string;
  blocks: Block[];
  /** 본문 순서대로의 각주 글 */
  notes: string[];
  references: string[];
};

export function outline(doc: ExportDoc, references: string[]): Outline {
  const numbers = footnoteNumbers(doc.body);
  const fnText = new Map(doc.footnotes.map((f) => [f.id, f.text]));
  const notes: string[] = [];
  for (const [id, n] of numbers) notes[n - 1] = fnText.get(id) || NEED;
  const count = [0, 0, 0];
  const blocks: Block[] = [];
  const toParts = (text: string): Parts => {
    const parts: Parts = [];
    text
      .replace(/\n/g, " ")
      .split(MARK_RE)
      .forEach((piece, i) => {
        if (i % 2 === 1) {
          const n = numbers.get(piece);
          if (n) parts.push({ note: n });
        } else if (piece) parts.push(piece);
      });
    return parts;
  };
  let tableNo = 0;
  for (const raw of doc.body.split(/\n\s*\n|\n(?=#{1,3}\s)/)) {
    const b = raw.trim();
    if (!b) continue;
    const h = b.match(/^(#{1,3})\s+(.+)$/);
    if (h && !b.includes("\n")) {
      const level = (h[1].length - 1) as 0 | 1 | 2;
      count[level]++;
      for (let k = level + 1; k < 3; k++) count[k] = 0;
      blocks.push({ kind: "heading", level, num: count.slice(0, level + 1).join(".") + (level < 2 ? "." : ""), text: h[2].trim() });
      continue;
    }
    const t = parseTable(b);
    if (t) {
      if (t.before) blocks.push({ kind: "para", parts: toParts(t.before) });
      blocks.push({ kind: "table", no: ++tableNo, caption: t.caption, rows: t.rows.map((r) => r.map(toParts)) });
      continue;
    }
    blocks.push({ kind: "para", parts: toParts(b) });
  }
  return {
    title: doc.title.trim() || NEED,
    author: doc.author.trim(),
    affiliation: doc.affiliation.trim(),
    abstract: doc.abstract?.trim() ?? "",
    keywords: doc.keywords?.trim() ?? "",
    blocks,
    notes,
    references,
  };
}

/** 내려받기 전에 확인할 곳: [보완 필요] 자리, 출처(라이브러리 자료)가 없는 각주 */
export function checkPoints(doc: ExportDoc, references: string[]) {
  const used = footnoteNumbers(doc.body);
  const usedNotes: Footnote[] = doc.footnotes.filter((f) => used.has(f.id));
  // 본문에는 있는데 각주 내용이 없는 표시도 "출처 없음"으로 센다
  const missing = [...used.keys()].filter((id) => !doc.footnotes.some((f) => f.id === id)).length;
  const texts = [doc.title, doc.body, ...usedNotes.map((f) => f.text), ...references];
  const need = texts.reduce((n, t) => n + (t.match(/\[보완 필요[^\]]*\]/g)?.length ?? 0), 0) + (doc.title.trim() ? 0 : 1);
  const noSource = usedNotes.filter((f) => !f.sourceId).length + missing;
  return { need, noSource, total: need + noSource };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 한 파일로 열리는 HTML (인쇄·PDF 저장에도 그대로 쓴다) */
export function toHtml(o: Outline, opts: { print?: boolean } = {}) {
  // 같은 각주가 여러 번 나오면 되돌아가기 자리(id)는 처음 한 번만
  const seen = new Set<number>();
  const html = (parts: Parts) =>
    parts
      .map((p) => {
        if (typeof p === "string") return esc(p);
        const id = seen.has(p.note) ? "" : ` id="r${p.note}"`;
        seen.add(p.note);
        return `<sup><a href="#fn${p.note}"${id}>${p.note}</a></sup>`;
      })
      .join("");
  const body = o.blocks
    .map((b) => {
      if (b.kind === "heading") {
        const tag = ["h2", "h3", "h4"][b.level];
        return `<${tag}>${esc(b.num)} ${esc(b.text)}</${tag}>`;
      }
      if (b.kind === "table") {
        const [head, ...rest] = b.rows;
        const row = (r: Parts[], tag: string) => `<tr>${r.map((c) => `<${tag}>${html(c)}</${tag}>`).join("")}</tr>`;
        return `<table><caption>${esc(tableCaption(b))}</caption><thead>${row(head, "th")}</thead><tbody>${rest
          .map((r) => row(r, "td"))
          .join("")}</tbody></table>`;
      }
      return `<p>${html(b.parts)}</p>`;
    })
    .join("\n");
  const notes = o.notes.length
    ? `<section class="notes"><h2>각주</h2><ol>${o.notes.map((n, i) => `<li id="fn${i + 1}">${esc(n)} <a href="#r${i + 1}">↩</a></li>`).join("")}</ol></section>`
    : "";
  const refs = o.references.length
    ? `<section class="refs"><h2>참고문헌</h2>${o.references.map((r) => `<p>${esc(r)}</p>`).join("")}</section>`
    : "";
  const byline = [o.author, o.affiliation].filter(Boolean).map(esc).join(" · ");
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<style>
  @page { size: A4; margin: 30mm 30mm 25mm; }
  body { font-family: "HCR Batang", "함초롬바탕", "Batang", "바탕", "Noto Serif KR", serif; font-size: 10.5pt; line-height: 1.8; color: #222; max-width: 160mm; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 16pt; text-align: center; margin: 0 0 .4rem; }
  .byline { text-align: center; margin-bottom: 2rem; color: #555; }
  h2 { font-size: 13pt; margin: 1.6rem 0 .6rem; }
  h3 { font-size: 11pt; margin: 1.2rem 0 .4rem; }
  h4 { font-size: 10.5pt; margin: 1rem 0 .3rem; }
  p { text-align: justify; text-indent: 1em; margin: 0 0 .5rem; }
  sup a { text-decoration: none; color: inherit; }
  table { border-collapse: collapse; width: 100%; margin: .8rem 0 1.2rem; font-size: 9.5pt; line-height: 1.5; page-break-inside: avoid; }
  caption { caption-side: top; text-align: center; font-weight: bold; margin-bottom: .3rem; }
  th, td { border: 1px solid #555; padding: .3rem .5rem; vertical-align: middle; text-align: left; }
  th { background: #f0f0f0; text-align: center; }
  thead { display: table-header-group; }
  @media print { th { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  .notes, .refs { margin-top: 2rem; border-top: 1px solid #bbb; padding-top: .5rem; }
  .notes ol { font-size: 9pt; padding-left: 1.4rem; }
  .notes a { text-decoration: none; color: #888; }
  .refs p { text-indent: -2em; padding-left: 2em; font-size: 9.5pt; }
  .abstract { margin: 0 0 2rem; padding: .8rem 1rem; border-top: 1px solid #bbb; border-bottom: 1px solid #bbb; font-size: 9.5pt; }
  .abstract h2 { font-size: 11pt; text-align: center; margin: 0 0 .5rem; }
  .abstract .kw { text-indent: 0; margin-top: .5rem; }
  ${opts.print ? "@media print { body { margin: 0; max-width: none; } .notes a[href^='#r'] { display: none; } }" : ""}
</style>
</head>
<body>
<h1>${esc(o.title)}</h1>
${byline ? `<p class="byline">${byline}</p>` : ""}
${abstractHtml(o)}
${body}
${notes}
${refs}
</body>
</html>`;
}

const md = (parts: Parts) => parts.map((p) => (typeof p === "string" ? p : `[^${p.note}]`)).join("");

/** 국문 초록·주제어 (HTML·PDF) */
function abstractHtml(o: Outline) {
  if (!o.abstract && !o.keywords) return "";
  const paras = o.abstract
    .split(/\n\s*\n/)
    .map((p) => `<p>${esc(p.replace(/\n/g, " "))}</p>`)
    .join("");
  return `<section class="abstract"><h2>국문 초록</h2>${paras}${o.keywords ? `<p class="kw"><b>주제어</b>: ${esc(o.keywords)}</p>` : ""}</section>`;
}

/** Markdown: 각주는 [^1] 형식, 참고문헌은 목록 */
export function toMarkdown(o: Outline) {
  const lines = [`# ${o.title}`, ""];
  const byline = [o.author, o.affiliation].filter(Boolean).join(" · ");
  if (byline) lines.push(`*${byline}*`, "");
  if (o.abstract) lines.push("## 국문 초록", "", o.abstract, "");
  if (o.keywords) lines.push(`**주제어**: ${o.keywords}`, "");
  for (const b of o.blocks) {
    if (b.kind === "heading") lines.push(`${"#".repeat(b.level + 2)} ${b.num} ${b.text}`, "");
    else if (b.kind === "table") {
      lines.push(`**${tableCaption(b)}**`, "");
      b.rows.forEach((r, i) => {
        lines.push(`| ${r.map((c) => md(c).replace(/\|/g, "\\|")).join(" | ")} |`);
        if (i === 0) lines.push(`| ${r.map(() => "---").join(" | ")} |`);
      });
      lines.push("");
    } else lines.push(md(b.parts), "");
  }
  if (o.references.length) {
    lines.push("## 참고문헌", "");
    o.references.forEach((r) => lines.push(`- ${r}`));
    lines.push("");
  }
  o.notes.forEach((n, i) => lines.push(`[^${i + 1}]: ${n}`));
  return lines.join("\n").trimEnd() + "\n";
}

/** Word(.docx): 진짜 각주(쪽 아래)로 넣는다. 브라우저에서 만든다 (온라인에서도 됨) */
export async function toDocx(o: Outline): Promise<Blob> {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    FootnoteReferenceRun,
    HeadingLevel,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
  } = await import("docx");
  const FONT = "함초롬바탕";
  // A4(11906) - 좌우 여백 1701×2 = 본문 너비 (twip)
  const TEXT_WIDTH = 11906 - 1701 * 2;
  const runs = (parts: Parts, size: number, bold = false) =>
    parts.map((p) => (typeof p === "string" ? new TextRun({ text: p, size, bold, font: FONT }) : new FootnoteReferenceRun(p.note)));
  const line = { style: BorderStyle.SINGLE, size: 4, color: "555555" };
  const table = (b: Extract<Block, { kind: "table" }>) => {
    const cols = b.rows[0].length;
    const widths = Array.from({ length: cols }, (_, i) => Math.floor(TEXT_WIDTH / cols) + (i === cols - 1 ? TEXT_WIDTH % cols : 0));
    return new Table({
      width: { size: TEXT_WIDTH, type: WidthType.DXA },
      columnWidths: widths,
      borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
      rows: b.rows.map(
        (r, ri) =>
          new TableRow({
            tableHeader: ri === 0,
            cantSplit: true,
            children: r.map(
              (c, ci) =>
                new TableCell({
                  width: { size: widths[ci], type: WidthType.DXA },
                  verticalAlign: VerticalAlign.CENTER,
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  shading: ri === 0 ? { fill: "F0F0F0" } : undefined,
                  children: [
                    new Paragraph({ alignment: ri === 0 ? AlignmentType.CENTER : AlignmentType.LEFT, children: runs(c, 19, ri === 0) }),
                  ],
                })
            ),
          })
      ),
    });
  };
  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: o.title, bold: true, size: 32, font: FONT })] }),
  ];
  const byline = [o.author, o.affiliation].filter(Boolean).join(" · ");
  if (byline) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: byline, size: 21, font: FONT })] }));
  if (o.abstract || o.keywords) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 }, children: [new TextRun({ text: "국문 초록", bold: true, size: 22, font: FONT })] }));
    for (const p of o.abstract.split(/\n\s*\n/).filter((x) => x.trim()))
      children.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: { firstLine: 200 },
          spacing: { line: 320, after: 80 },
          children: [new TextRun({ text: p.replace(/\n/g, " "), size: 19, font: FONT })],
        })
      );
    if (o.keywords)
      children.push(new Paragraph({ spacing: { before: 80, after: 400 }, children: [new TextRun({ text: "주제어: ", bold: true, size: 19, font: FONT }), new TextRun({ text: o.keywords, size: 19, font: FONT })] }));
  }
  const headingSize = [26, 22, 21];
  const headingLevel = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
  for (const b of o.blocks) {
    if (b.kind === "heading")
      children.push(
        new Paragraph({
          heading: headingLevel[b.level],
          spacing: { before: 240, after: 120 },
          children: [new TextRun({ text: `${b.num} ${b.text}`, bold: true, size: headingSize[b.level], font: FONT, color: "000000" })],
        })
      );
    else if (b.kind === "table")
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          keepNext: true,
          spacing: { before: 200, after: 80 },
          children: [new TextRun({ text: tableCaption(b), bold: true, size: 20, font: FONT })],
        }),
        table(b),
        new Paragraph({ spacing: { after: 120 }, children: [] })
      );
    else
      children.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: { firstLine: 200 },
          spacing: { line: 360, after: 80 },
          children: runs(b.parts, 21),
        })
      );
  }
  if (o.references.length) {
    children.push(
      new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "참고문헌", bold: true, size: 26, font: FONT })] })
    );
    for (const r of o.references)
      children.push(new Paragraph({ indent: { left: 400, hanging: 400 }, spacing: { after: 80 }, children: [new TextRun({ text: r, size: 19, font: FONT })] }));
  }
  const footnotes: Record<number, { children: InstanceType<typeof Paragraph>[] }> = {};
  o.notes.forEach((n, i) => {
    footnotes[i + 1] = { children: [new Paragraph({ children: [new TextRun({ text: n, size: 18, font: FONT })] })] };
  });
  const doc = new Document({
    creator: o.author || "논문작업실",
    title: o.title,
    footnotes,
    sections: [{ properties: { page: { margin: { top: 1701, bottom: 1417, left: 1701, right: 1701 } } }, children }],
  });
  return Packer.toBlob(doc);
}

/** 파일 이름: 2026-11-13_제목.확장자 */
export function exportName(title: string, ext: string) {
  const safe = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 50) || "논문";
  return `${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })}_${safe}.${ext}`;
}
