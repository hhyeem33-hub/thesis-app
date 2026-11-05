// 참고문헌·각주·원고 변환 (화면과 서버가 같이 쓰는 순수 함수)
import type { Manuscript } from "./ai";
import type { Bib, Footnote, Source, ThesisDoc } from "./types";

export const NEED = "[보완 필요]";
const or = (v: string | undefined | null) => (v && v.trim()) || NEED;

export function emptyBib(kind: Bib["kind"] = "web"): Bib {
  return {
    kind,
    authors: "",
    year: "",
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

/** 참고문헌 묶음: 한국어 → 중국어 → 영어(그 밖) */
export type RefLang = "ko" | "zh" | "en";
export function refLang(s: Pick<Source, "title"> & { bib?: Bib | null }): RefLang {
  const text = `${s.bib?.authors ?? ""} ${s.title}`;
  if (/[가-힣]/.test(text)) return "ko";
  if (/[一-鿿]/.test(text)) return "zh";
  return "en";
}

function volIssue(b: Bib) {
  if (!b.volume && !b.issue) return NEED;
  return `${b.volume || NEED}${b.issue ? `(${b.issue})` : ""}`;
}

/**
 * 한국외대 학위논문 양식 참고문헌 한 줄.
 * - 국문·중문 논문: 저자(연도), 「논문 제목」, 『학술지명』 권(호), 쪽.
 * - 국문·중문 책: 저자(연도), 『책 제목』, 출판지: 출판사.
 * - 웹 자료: 저자·기관(연도), 「제목」, 주소.
 * - 영문: Author(Year), Title. Journal Vol(Issue), pages.
 * 모르는 칸은 [보완 필요]
 */
export function formatReference(s: Pick<Source, "title" | "origin" | "type"> & { bib?: Bib | null }): string {
  const b = s.bib ?? emptyBib(s.type === "pdf" ? "article" : "web");
  const lang = refLang(s);
  const head = `${or(b.authors)}(${or(b.year)})`;
  const pages = b.pages ? `, ${b.pages}` : "";
  const url = /^https?:\/\//.test(s.origin) ? s.origin : "";
  if (lang === "en") {
    if (b.kind === "book") return `${head}, ${s.title}. ${or(b.place)}: ${or(b.publisher)}.`;
    if (b.kind === "article") return `${head}, ${s.title}. ${or(b.journal)} ${volIssue(b)}${pages}.`;
    return `${head}, ${s.title}. ${url || NEED}`;
  }
  if (b.kind === "book") return `${head}, 『${s.title}』, ${or(b.place)}: ${or(b.publisher)}`;
  if (b.kind === "article") return `${head}, 「${s.title}」, 『${or(b.journal)}』 ${volIssue(b)}${pages}`;
  return `${head}, 「${s.title}」, ${url || NEED}`;
}

/** 각주에 넣을 출처 (본문 인용용 짧은 형식): 저자(연도), 「제목」. */
export function footnoteCitation(s: Pick<Source, "title" | "origin" | "type"> & { bib?: Bib | null }): string {
  return `${formatReference(s)} 참고.`;
}

// ── 각주 표시 [^id] ──────────────────────────────────────────────────────────

export const MARK_RE = /\[\^([a-z0-9]{4,12})\]/g;

export function newFootnoteId() {
  return Math.random().toString(36).slice(2, 8);
}

/** 본문에 나오는 순서대로 각주 번호 (id → 1, 2, 3 …) */
export function footnoteNumbers(body: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const m of body.matchAll(MARK_RE)) if (!map.has(m[1])) map.set(m[1], map.size + 1);
  return map;
}

/** 본문 글자 수 (각주 표시·제목 기호 제외, 공백 포함) */
export function countChars(body: string) {
  return Array.from(body.replace(MARK_RE, "").replace(/^#{1,3}\s+/gm, "")).length;
}

/** 각주에 쓴 라이브러리 자료 → 참고문헌 목록 (국문→중문→영문, 그 안에서 저자·제목 순) */
export function buildReferences(
  doc: Pick<ThesisDoc, "body" | "footnotes">,
  sources: (Pick<Source, "id" | "title" | "origin" | "type"> & { bib?: Bib | null })[]
) {
  const used = footnoteNumbers(doc.body);
  const ids = new Set(
    doc.footnotes.filter((f) => f.sourceId && used.has(f.id)).map((f) => f.sourceId as string)
  );
  const order: Record<RefLang, number> = { ko: 0, zh: 1, en: 2 };
  const collator = { ko: "ko", zh: "zh", en: "en" } as const;
  return sources
    .filter((s) => ids.has(s.id))
    .map((s) => ({ id: s.id, lang: refLang(s), key: `${s.bib?.authors || "힣"} ${s.title}`, text: formatReference(s) }))
    .sort((a, b) => order[a.lang] - order[b.lang] || a.key.localeCompare(b.key, collator[a.lang]));
}

// ── 원고 ↔ hwpx 원고(JSON) ──────────────────────────────────────────────────

type Section = { title: string; blocks: string[]; subsections: { title: string; blocks: string[] }[] };
type Chapter = { title: string; blocks: string[]; sections: Section[] };

/** 글쓰기 원고 → make_hwpx.py 원고 JSON. 각주는 [^각주 내용] 으로 그 자리에 넣는다 */
export function docToManuscript(doc: ThesisDoc, references: string[]) {
  const fn = new Map(doc.footnotes.map((f) => [f.id, f.text]));
  // 각주 안의 대괄호 [보완 필요] 는 한 겹까지 허용되므로 그대로 둔다
  const inline = (t: string) =>
    t.replace(MARK_RE, (_, id: string) => {
      const text = (fn.get(id) || NEED).replace(/[\[\]]/g, (c) => (c === "[" ? "［" : "］"));
      return `[^${text.replace(/［보완 필요］/g, NEED)}]`;
    });
  const chapters: Chapter[] = [];
  const lead: string[] = [];
  let ch: Chapter | null = null;
  let sec: Section | null = null;
  let sub: { title: string; blocks: string[] } | null = null;
  for (const raw of doc.body.split(/\n\s*\n|\n(?=#{1,3}\s)/)) {
    const para = raw.trim();
    if (!para) continue;
    const h = para.match(/^(#{1,3})\s+(.+)$/);
    if (h && !para.includes("\n")) {
      const title = h[2].trim();
      if (h[1] === "#") {
        ch = { title, blocks: [], sections: [] };
        chapters.push(ch);
        sec = sub = null;
      } else if (h[1] === "##") {
        if (!ch) chapters.push((ch = { title: "서론", blocks: [], sections: [] }));
        sec = { title, blocks: [], subsections: [] };
        ch.sections.push(sec);
        sub = null;
      } else {
        if (!ch) chapters.push((ch = { title: "서론", blocks: [], sections: [] }));
        if (!sec) ch.sections.push((sec = { title: "개요", blocks: [], subsections: [] }));
        sub = { title, blocks: [] };
        sec.subsections.push(sub);
      }
      continue;
    }
    const text = inline(para.replace(/\n/g, " "));
    if (sub) sub.blocks.push(text);
    else if (sec) sec.blocks.push(text);
    else if (ch) ch.blocks.push(text);
    else lead.push(text);
  }
  if (lead.length) {
    if (chapters[0]) chapters[0].blocks.unshift(...lead);
    else chapters.push({ title: "서론", blocks: lead, sections: [] });
  }
  return {
    title: doc.title.trim() || NEED,
    author: doc.author.trim() || "○○○",
    author_note: doc.affiliation.trim() || "한국외국어대학교 대학원 ○○학과 석사과정",
    chapters,
    references,
  };
}

/** AI 초안(원고 JSON) → 글쓰기 원고 본문과 각주 */
export function manuscriptToDoc(m: Manuscript): { title: string; body: string; footnotes: Footnote[] } {
  const footnotes: Footnote[] = [];
  const pull = (t: string) =>
    t.replace(/\[\^((?:[^\[\]]|\[[^\[\]]*\])+)\]/g, (_, text: string) => {
      const id = newFootnoteId();
      footnotes.push({ id, text, sourceId: null });
      return `[^${id}]`;
    });
  const out: string[] = [];
  for (const ch of m.chapters) {
    out.push(`# ${ch.title}`, ...ch.blocks.map(pull));
    for (const sec of ch.sections) out.push(`## ${sec.title}`, ...sec.blocks.map(pull));
  }
  return { title: m.title, body: out.join("\n\n"), footnotes };
}
