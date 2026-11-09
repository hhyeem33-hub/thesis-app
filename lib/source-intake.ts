import { createHash, randomUUID } from "crypto";
import { existsSync, promises as fs } from "fs";
import path from "path";
import { emptyBib } from "./bib";
import { ONLINE } from "./db";
import { getSources, saveSource } from "./sources";
import { getSettings } from "./store";
import type { Bib, Source, SourceType } from "./types";

// 자료 수집: 파일·목록·옵시디언에서 들어온 자료를 라이브러리에 넣는다 (중복은 건너뜀)

const MAX_CONTENT = 200_000;
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

export type NewSource = {
  title: string;
  type: SourceType;
  origin: string;
  content: string;
  bib?: Partial<Bib>;
  /** 정해진 id (옵시디언 노트처럼 다시 가져와도 같은 자료여야 할 때) */
  id?: string;
};

/** 여러 자료를 넣는다. 같은 id·제목·주소가 이미 있으면 건너뛴다 */
export async function addSources(items: NewSource[], projectId: string | null) {
  const existing = await getSources();
  const ids = new Set(existing.map((s) => s.id));
  const titles = new Set(existing.map((s) => norm(s.title)));
  const urls = new Set(existing.map((s) => s.origin).filter((o) => /^https?:\/\//.test(o)));
  const added: string[] = [];
  const skipped: string[] = [];
  for (const it of items) {
    const title = it.title.trim().slice(0, 200);
    const url = /^https?:\/\//.test(it.origin) ? it.origin.trim() : "";
    if (!title || (it.id && ids.has(it.id)) || titles.has(norm(title)) || (url && urls.has(url))) {
      skipped.push(title || "(제목 없음)");
      continue;
    }
    const now = new Date().toISOString();
    const source: Source = {
      id: it.id ?? randomUUID(),
      projectId,
      title,
      type: it.type,
      origin: it.origin.trim().slice(0, 1000),
      content: it.content.trim().slice(0, MAX_CONTENT),
      createdAt: now,
      updatedAt: now,
      classification: null,
      bib: { ...emptyBib(it.type === "pdf" ? "article" : "web"), ...(it.bib ?? {}) },
    };
    await saveSource(source);
    ids.add(source.id);
    titles.add(norm(title));
    if (url) urls.add(url);
    added.push(source.id);
  }
  return { added, skipped };
}

// ── 파일에서 글자 꺼내기 ─────────────────────────────────────────────────────

export const FILE_KINDS = ".pdf, .docx, .txt, .md";

export async function extractText(name: string, bytes: Buffer): Promise<{ text: string; type: SourceType }> {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".pdf") {
    const { extractText: pdf, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await pdf(doc, { mergePages: true });
    const t = (Array.isArray(text) ? text.join("\n") : text).trim();
    if (!t) throw new Error("PDF에서 글자를 찾지 못했어요. 스캔한 이미지 PDF는 글자를 꺼낼 수 없어요.");
    return { text: t, type: "pdf" };
  }
  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: bytes });
    return { text: value.trim(), type: "markdown" };
  }
  if (ext === ".txt" || ext === ".md" || ext === ".markdown") {
    let t = bytes.toString("utf8").replace(/^﻿/, "");
    // 옵시디언 머리말(---)은 빼고 본문만
    t = t.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
    return { text: t.replace(/\r\n?/g, "\n").trim(), type: "markdown" };
  }
  if (ext === ".doc" || ext === ".hwp")
    throw new Error(`${ext} 파일은 읽을 수 없어요. Word는 .docx로, 한글은 PDF로 저장해서 올려 주세요.`);
  throw new Error(`이 형식은 아직 못 읽어요 (${FILE_KINDS}만 돼요).`);
}

// ── 목록(엑셀·CSV) 읽기 ───────────────────────────────────────────────────────

/** 머리글 → 자료 칸 (한국어·영어 모두) */
const HEADER: Record<string, keyof Omit<NewSource, "bib" | "id"> | keyof Bib> = {
  제목: "title", title: "title", 논문명: "title", 논문제목: "title",
  유형: "type", type: "type",
  출처: "origin", 주소: "origin", url: "origin", 링크: "origin", link: "origin",
  내용: "content", 초록: "content", 요약: "content", abstract: "content", content: "content", 메모: "content",
  저자: "authors", author: "authors", authors: "authors",
  연도: "year", 발행연도: "year", year: "year",
  학술지: "journal", 학술지명: "journal", journal: "journal",
  권: "volume", volume: "volume",
  호: "issue", issue: "issue",
  쪽: "pages", 페이지: "pages", pages: "pages",
  출판사: "publisher", 발행기관: "publisher", publisher: "publisher",
  doi: "doi",
  분류: "category", category: "category",
};
const TYPE_WORD: Record<string, SourceType> = {
  pdf: "pdf", 논문: "pdf", markdown: "markdown", md: "markdown", 노트: "markdown",
  web: "web", 웹: "web", youtube: "youtube", 유튜브: "youtube", 영상: "youtube",
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const delim = (text.split("\n")[0].match(/\t/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? "\t" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.filter((r) => r.some((c) => c.trim()));
}

export async function parseList(name: string, bytes: Buffer) {
  const ext = path.extname(name).toLowerCase();
  let rows: string[][];
  if (ext === ".xlsx") {
    const { readSheet } = await import("read-excel-file/node");
    rows = (await readSheet(bytes)).map((r) => r.map((c) => (c == null ? "" : String(c))));
  } else if (ext === ".csv" || ext === ".tsv" || ext === ".txt") {
    let text = bytes.toString("utf8").replace(/^﻿/, "");
    // 엑셀에서 저장한 CSV가 EUC-KR(완성형)이면 다시 읽는다
    if (text.includes("�")) text = new TextDecoder("euc-kr").decode(bytes);
    rows = parseCsv(text);
  } else if (ext === ".xls") {
    throw new Error("예전 엑셀(.xls)은 못 읽어요. 엑셀에서 .xlsx 또는 CSV로 저장해 주세요.");
  } else throw new Error(".xlsx 또는 .csv 파일을 올려 주세요.");

  if (rows.length < 2) throw new Error("첫 줄은 머리글(제목, 저자, 연도…), 둘째 줄부터 자료여야 해요.");
  const keys = rows[0].map((h) => HEADER[h.trim().toLowerCase().replace(/\s/g, "")] ?? HEADER[h.trim()] ?? null);
  if (!keys.includes("title")) throw new Error("머리글에 ‘제목’ 칸이 없어요. 첫 줄에 제목, 저자, 연도, 출처… 를 적어 주세요.");
  const items: NewSource[] = rows.slice(1).map((r) => {
    const v: Record<string, string> = {};
    keys.forEach((k, i) => k && (v[k] = (r[i] ?? "").trim()));
    const type = TYPE_WORD[(v.type ?? "").toLowerCase()] ?? (v.journal ? "pdf" : /^https?:\/\//.test(v.origin ?? "") ? "web" : "markdown");
    return {
      title: v.title ?? "",
      type,
      origin: v.origin ?? "",
      content: v.content ?? "",
      bib: {
        kind: v.journal ? "article" : v.publisher && !v.origin ? "book" : "web",
        authors: v.authors ?? "",
        year: (v.year ?? "").match(/(19|20)\d{2}/)?.[0] ?? "",
        journal: v.journal ?? "",
        volume: v.volume ?? "",
        issue: v.issue ?? "",
        pages: v.pages ?? "",
        publisher: v.publisher ?? "",
        doi: v.doi ?? "",
        category: v.category ?? "",
      },
    };
  });
  return { items: items.filter((i) => i.title), columns: rows[0].filter((_, i) => keys[i]), ignored: rows[0].filter((_, i) => !keys[i]) };
}

// ── 옵시디언 보관함의 새 스크랩 노트 (읽기만) ─────────────────────────────────
// scripts/import-obsidian.mjs 와 같은 규칙: 같은 노트는 항상 같은 id, 본문·주소 중복은 하나만

function stableId(rel: string) {
  const h = createHash("sha1").update(`obsidian:${rel}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function scanObsidian(): Promise<{ vault: string; items: NewSource[] }> {
  if (ONLINE) throw new Error("옵시디언 가져오기는 내 컴퓨터에서만 돼요.");
  const vault = (await getSettings()).obsidianVaultPath;
  const dir = path.join(vault, "Clippings");
  if (!vault || !existsSync(dir)) throw new Error(`보관함의 Clippings 폴더를 찾지 못했어요 (${dir}). 설정의 보관함 경로를 확인해 주세요.`);
  const files = (await fs.readdir(dir))
    .filter((f) => f.endsWith(".md"))
    .sort((a, b) => {
      const base = (f: string) => f.replace(/ \d+\.md$/, ".md");
      const num = (f: string) => Number(f.match(/ (\d+)\.md$/)?.[1] ?? 0);
      return base(a).localeCompare(base(b), "ko") || num(a) - num(b);
    });
  const seen = new Set<string>();
  const items: NewSource[] = [];
  for (const f of files) {
    const rel = `Clippings/${f}`;
    const raw = await fs.readFile(path.join(vault, rel), "utf8");
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    const fm: Record<string, string> = {};
    const authors: string[] = [];
    let key = "";
    for (const line of m?.[1].split(/\r?\n/) ?? []) {
      const kv = line.match(/^([\w_]+):\s*(.*)$/);
      if (kv) {
        key = kv[1];
        fm[key] = kv[2].replace(/^"(.*)"$/, "$1").trim();
      } else if (key === "author") {
        const it = line.match(/^\s+-\s+(.*)$/);
        if (it) authors.push(it[1].replace(/^"(.*)"$/, "$1").replace(/^\[\[(.*)\]\]$/, "$1").trim());
      }
    }
    const body = (m ? raw.slice(m[0].length) : raw).replace(/\r\n?/g, "\n").trim();
    const dupKey = createHash("sha1").update(body.replace(/\s+/g, " ")).digest("hex");
    const url = fm.source ?? "";
    if (seen.has(dupKey) || (url && seen.has(url))) continue;
    seen.add(dupKey);
    if (url) seen.add(url);
    items.push({
      id: stableId(rel),
      title: fm.title || f.replace(/\.md$/, ""),
      type: "web",
      origin: url,
      content: body,
      bib: { kind: "web", authors: authors.join(", "), year: (fm.published ?? "").match(/(19|20)\d{2}/)?.[0] ?? "" },
    });
  }
  return { vault, items };
}
