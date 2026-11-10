import { promises as fs } from "fs";
import path from "path";
import { ONLINE } from "./db";
import type { KciArticle } from "./types";

// KCI(한국학술지인용색인) 논문 정보 가져오기
// 1) 키 없이: KCI 논문 상세 페이지(공개)의 서지 칸을 읽는다 — 사용자가 고른 논문 하나씩
// 2) 키 있을 때: KCI Open API(openApiSearch.kci)로 검색 — 신청한 집 IP에서만 되므로 내 컴퓨터에서만
// ⚠️ KCI 키는 data/kci-key.json(깃허브 제외) 또는 환경 변수 KCI_API_KEY 에만 둔다.

const KEY_FILE = path.join(process.cwd(), "data", "kci-key.json");
const UA = "Mozilla/5.0 (compatible; thesis-app)"; // 머리말에는 한글을 넣을 수 없다

export const kciDetailUrl = (id: string) =>
  `https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=${id}`;

/** 주소나 글에서 KCI 논문 번호(ART + 숫자 9자리)를 찾는다 */
export function findKciId(text: string) {
  return text.match(/ART\d{9}/)?.[0] ?? null;
}

// ── 키 ───────────────────────────────────────────────────────────────────────

async function savedKey() {
  try {
    return (JSON.parse(await fs.readFile(KEY_FILE, "utf8")) as { key?: string }).key?.trim() ?? "";
  } catch {
    return "";
  }
}
export async function getKciKey() {
  return process.env.KCI_API_KEY?.trim() || (await savedKey());
}
export async function getKciKeyStatus() {
  const env = process.env.KCI_API_KEY?.trim();
  if (env) return { source: "env" as const, last4: env.slice(-4) };
  const saved = await savedKey();
  return saved ? { source: "saved" as const, last4: saved.slice(-4) } : { source: "none" as const };
}
export async function saveKciKey(key: string) {
  await fs.mkdir(path.dirname(KEY_FILE), { recursive: true });
  await fs.writeFile(KEY_FILE, JSON.stringify({ key }, null, 2) + "\n", "utf8");
}
export async function deleteKciKey() {
  await fs.rm(KEY_FILE, { force: true });
}
/** 키 검색을 쓸 수 있는지 (키가 있고, 내 컴퓨터일 때) */
export async function canUseKciApi() {
  return !ONLINE && !!(await getKciKey());
}

// ── 공통 ─────────────────────────────────────────────────────────────────────

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** "안가청/Yan, Keqing(제1),남영운/Nam, Youngwon(교신)" → "안가청, 남영운" */
function koreanAuthors(raw: string) {
  return raw
    .split(/\)\s*,/)
    .map((a) => a.replace(/\(.*$/, "").trim())
    .map((a) => (a.includes("/") ? a.split("/")[0].trim() : a))
    .filter(Boolean)
    .join(", ");
}

// ── 1) 키 없이: 상세 페이지 ──────────────────────────────────────────────────

export async function fetchKciArticle(id: string): Promise<KciArticle> {
  let html: string;
  try {
    const res = await fetch(kciDetailUrl(id), { headers: { "User-Agent": UA }, cache: "no-store" });
    if (!res.ok) throw new Error(`KCI 응답 ${res.status}`);
    html = await res.text();
  } catch (e) {
    throw new Error(
      `KCI 페이지를 읽지 못했어요 (${e instanceof Error ? e.message : e}). 아래 칸에 직접 입력해 주세요.`
    );
  }
  const hidden = (name: string) =>
    decode(html.match(new RegExp(`id="${name}"\\s+value=(?:'([^']*)'|"([^"]*)")`))?.slice(1).find((v) => v !== undefined) ?? "");
  const title = decode(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
  if (!title || !html.includes(id)) throw new Error("KCI에서 이 번호의 논문을 찾지 못했어요. 주소를 확인해 주세요.");
  const vol = hidden("hdnVolInfo"); // 예: 2024, vol.35no.2,pp. 55-77(23 pages)
  return {
    kciId: id,
    title,
    authors: koreanAuthors(hidden("hdnAuthor")),
    journal: hidden("hdnJournalNm"),
    publisher: hidden("hdnPublisher"),
    year: vol.match(/^(\d{4})/)?.[1] ?? "",
    volume: vol.match(/vol\.\s*(\d+)/i)?.[1] ?? "",
    issue: vol.match(/no\.\s*(\d+)/i)?.[1] ?? "",
    pages: vol.match(/pp\.\s*([\d]+\s*-\s*[\d]+)/i)?.[1]?.replace(/\s/g, "") ?? "",
    doi: hidden("hdnDoi"),
    keywords: hidden("hdnKeyWords"),
    abstract: decode(html.match(/id="korAbst"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "").slice(0, 4000),
    url: kciDetailUrl(id),
  };
}

// ── 2) 키 있을 때: Open API 검색 ─────────────────────────────────────────────

const tag = (xml: string, name: string) => decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? "");
const tags = (xml: string, name: string) =>
  [...xml.matchAll(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "g"))].map((m) => decode(m[1])).filter(Boolean);

/** 한 번에 가져오는 검색 결과 수 (KCI API 최대 100) */
export const KCI_PAGE_SIZE = 50;

export async function searchKciApi(
  query: string,
  page = 1,
  /** true 면 최근 논문(발행 연도 내림차순) 먼저 */
  recent = false
): Promise<{ total: number; items: KciArticle[] }> {
  if (ONLINE) throw new Error("KCI 키 검색은 신청한 집 IP에서만 돼서 내 컴퓨터에서만 쓸 수 있어요.");
  const key = await getKciKey();
  if (!key) throw new Error("설정에서 KCI API 키를 먼저 넣어 주세요.");
  const url = new URL("https://open.kci.go.kr/po/openapi/openApiSearch.kci");
  url.search = new URLSearchParams({
    apiCode: "articleSearch",
    key,
    title: query,
    displayCount: String(KCI_PAGE_SIZE),
    page: String(page),
    ...(recent ? { sortNm: "pubiYr", sortDir: "desc" } : {}),
  }).toString();
  let xml: string;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
    xml = await res.text();
  } catch (e) {
    throw new Error(`KCI API에 연결하지 못했어요: ${e instanceof Error ? e.message : e}`);
  }
  if (/방화벽|차단/.test(xml) || /<span[\s>]/.test(xml.slice(0, 200)))
    throw new Error("KCI가 이 컴퓨터의 접속을 막았어요. API를 신청한 IP(집 인터넷)에서 실행해 주세요.");
  const err = tag(xml, "error") || tag(xml, "errMsg") || tag(xml, "resultMsg");
  const records = [...xml.matchAll(/<record>([\s\S]*?)<\/record>/g)].map((m) => m[1]);
  if (!records.length && /no\s*data/i.test(err)) return { total: 0, items: [] }; // 검색 결과 없음
  if (!records.length && err) throw new Error(`KCI API 오류: ${err}`);
  const items = records.map((r) => {
    const id = r.match(/article-id="(ART\d+)"/)?.[1] ?? findKciId(r) ?? "";
    const titles = [...r.matchAll(/<article-title[^>]*lang="([^"]*)"[^>]*>([\s\S]*?)<\/article-title>/g)];
    const title = decode((titles.find((t) => t[1] === "original") ?? titles[0])?.[2] ?? tag(r, "article-title"));
    return {
      kciId: id,
      title,
      authors: tags(r, "author").map((a) => a.replace(/\(.*\)$/, "").trim()).join(", "),
      journal: tag(r, "journal-name"),
      publisher: tag(r, "publisher-name"),
      year: tag(r, "pub-year"),
      volume: tag(r, "volume"),
      issue: tag(r, "issue"),
      pages: [tag(r, "fpage"), tag(r, "lpage")].filter(Boolean).join("-"),
      doi: tag(r, "doi"),
      keywords: tags(r, "keyword").join(", "),
      abstract: tag(r, "abstract").slice(0, 4000),
      url: tag(r, "url") || (id ? kciDetailUrl(id) : ""),
    };
  });
  return { total: Number(tag(xml, "total") || items.length), items };
}
