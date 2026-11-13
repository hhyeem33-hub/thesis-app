import type { NewSource } from "./source-intake";

// 링크로 자료 가져오기: 유튜브는 제목·채널·날짜·자막(한국어 우선), 일반 웹은 제목·본문

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAX_HTML = 3_000_000;

async function get(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`페이지를 열지 못했어요 (${res.status})`);
  return res;
}

/** 태그 하나 (속성 값 안의 ">" 도 건너뜀) */
const TAG = /<(?:[^>"']|"[^"]*"|'[^']*')*>/g;

const decodeHtml = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

export function youtubeId(url: string) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m?.[1] ?? null;
}

/** 페이지 안의 JSON 덩어리 (var ytInitialPlayerResponse = {...};) 꺼내기 */
function pageJson(html: string, name: string): Record<string, unknown> | null {
  const i = html.indexOf(name);
  if (i < 0) return null;
  const start = html.indexOf("{", i);
  let depth = 0;
  let inStr = false;
  for (let j = start; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (c === "\\") j++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, j + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

type Track = { baseUrl: string; languageCode: string; kind?: string; name?: { simpleText?: string; runs?: { text?: string }[] } };
async function captions(tracks: Track[]): Promise<{ text: string; lang: string } | null> {
  // 한국어(직접 올린 자막 → 자동 자막) → 그 밖의 언어 순
  const order = [...tracks].sort((a, b) => {
    const score = (t: Track) => (t.languageCode.startsWith("ko") ? 0 : 2) + (t.kind === "asr" ? 1 : 0);
    return score(a) - score(b);
  });
  for (const t of order) {
    try {
      // 자막 주소는 XML(<text>…</text> 또는 <p>…</p>)로 온다
      const body = await (await get(t.baseUrl.replace(/&fmt=[^&]*/, ""))).text();
      const text = decodeHtml(
        [...body.matchAll(/<(?:text|p)\b[^>]*>([\s\S]*?)<\/(?:text|p)>/g)].map((m) => m[1].replace(TAG, "")).join(" ")
      )
        .replace(/\s*\n\s*/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (text) return { text, lang: t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode };
    } catch {
      // 다음 자막으로
    }
  }
  return null;
}

async function fromYoutube(url: string, id: string): Promise<NewSource & { note?: string }> {
  const watch = `https://www.youtube.com/watch?v=${id}`;
  let title = "";
  let channel = "";
  let date = "";
  let description = "";
  let transcript: { text: string; lang: string } | null = null;
  try {
    const html = (await (await get(`${watch}&hl=ko`, { headers: { Cookie: "CONSENT=YES+1" } })).text()).slice(0, MAX_HTML);
    const player = pageJson(html, "ytInitialPlayerResponse") as {
      videoDetails?: { title?: string; author?: string; shortDescription?: string };
      microformat?: { playerMicroformatRenderer?: { publishDate?: string; uploadDate?: string } };
      captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: Track[] } };
    } | null;
    title = player?.videoDetails?.title ?? "";
    channel = player?.videoDetails?.author ?? "";
    description = player?.videoDetails?.shortDescription ?? "";
    const mf = player?.microformat?.playerMicroformatRenderer;
    date = (mf?.publishDate || mf?.uploadDate || "").slice(0, 10);
    transcript = await captions(player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []);
  } catch {
    // 아래 oEmbed 로 제목·채널만이라도
  }
  if (!title) {
    const o = (await (await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`)).json()) as {
      title?: string;
      author_name?: string;
    };
    title = o.title ?? "";
    channel = o.author_name ?? "";
  }
  if (!title) throw new Error("유튜브 영상 정보를 가져오지 못했어요. 주소를 확인해 주세요.");
  const head = [`채널: ${channel || "[보완 필요]"}`, `게시일: ${date || "[보완 필요]"}`, `주소: ${watch}`].join("\n");
  const content = transcript
    ? `${head}\n\n## 자막 (${transcript.lang})\n\n${transcript.text}`
    : `${head}\n\n## 영상 설명\n\n${description || "(설명 없음)"}\n\n[보완 필요: 자막을 가져오지 못했어요 — 유튜브에서 ‘스크립트 표시’로 복사해 붙여 넣어 주세요]`;
  return {
    title,
    type: "youtube",
    origin: watch,
    content,
    bib: { kind: "web", authors: channel, year: date.slice(0, 4), publisher: "YouTube" },
    note: transcript
      ? `자막(${transcript.lang})까지 가져왔어요.`
      : "유튜브가 자막을 내주지 않아 영상 설명을 대신 저장했어요. 자료 상세에서 스크립트를 붙여 넣을 수 있어요.",
  };
}

/** 일반 웹 페이지: 제목(og:title·<title>), 글쓴이, 날짜, 본문(<article>·<main> 우선) */
async function fromWeb(url: string): Promise<NewSource & { note?: string }> {
  const res = await get(url);
  const type = res.headers.get("content-type") ?? "";
  if (!/html|xml|text\/plain/.test(type)) throw new Error("웹 페이지가 아니에요. PDF·한글 파일은 Google Drive 탭이나 파일 올리기로 넣어 주세요.");
  const html = (await res.text()).slice(0, MAX_HTML);
  const meta = (name: string) =>
    decodeHtml(
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i"))?.[1] ??
        html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, "i"))?.[1] ??
        ""
    ).trim();
  const title = meta("og:title") || decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const author = meta("author") || meta("article:author");
  const date = (meta("article:published_time") || meta("date") || meta("pubdate")).slice(0, 10);
  const site = meta("og:site_name");

  let body = html
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const main = body.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? body.match(/<main[\s\S]*?<\/main>/i)?.[0];
  if (main && main.replace(TAG, "").trim().length > 300) body = main;
  const text = decodeHtml(
    body
      .replace(/<\/(p|div|h[1-6]|li|br|tr|section)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(TAG, " ")
  )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!title && !text) throw new Error("페이지에서 글자를 찾지 못했어요.");
  return {
    title: title || url,
    type: "web",
    origin: url,
    content: text || meta("description"),
    bib: { kind: "web", authors: author, year: date.match(/(19|20)\d{2}/)?.[0] ?? "", publisher: site },
    note: text.length > 200 ? "제목·본문을 가져왔어요." : "본문이 짧아요. 로그인이 필요한 페이지일 수 있어요.",
  };
}

export async function fetchLink(raw: string): Promise<NewSource & { note?: string }> {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("주소가 올바르지 않아요.");
  }
  // 내 컴퓨터·사내망 주소는 막는다 (서버가 대신 여는 것이므로)
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[::1\])/i.test(parsed.hostname))
    throw new Error("이 주소는 가져올 수 없어요.");
  const id = youtubeId(url);
  return id ? fromYoutube(url, id) : fromWeb(url);
}
