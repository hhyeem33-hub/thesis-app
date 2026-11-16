import { matchTopic, writeChapter, type ChapterSourceInput } from "./ai";
import { footnoteCitation, newFootnoteId } from "./bib";
import { researchBasis } from "./research";
import { getSources } from "./sources";
import type { Footnote, Source } from "./types";

// 장별 AI 초안: 연구자가 '채택'한 자료만 근거로, 문장마다 근거 자료를 각주([^id])로 단다.
// 각주의 sourceId 덕분에 본문에 넣으면 참고문헌에도 자동으로 들어간다.

/** 한 장에 보낼 채택 자료 수와 자료마다 보낼 글자 수 (비용·정확도 균형) */
const MAX_SOURCES = 24;
const EXCERPT_CHARS = 1500;
const NEED_CHECK = "[확인 필요]";

export type ChapterDraft =
  | {
      ok: true;
      chapter: string;
      /** "# 장\n\n## 절\n\n문단…" (각주 표시 [^id] 포함) */
      body: string;
      footnotes: Footnote[];
      /** 실제로 각주에 쓴 자료 제목 */
      used: string[];
      /** [확인 필요] 표시 수 */
      needCheck: number;
      costUsd: number;
      tokens: { input: number; output: number };
    }
  | { ok: false; chapter: string; insufficient: true; reason: string; costUsd: number }
  | { ok: false; chapter: string; insufficient?: false; error: string };

const isAdopted = (s: Source) => s.classification?.decision?.status === "adopted";

/** 이 프로젝트의 목차 (연구 설정 → 비어 있으면 공통·최근 연구 설정) */
export async function chapterOutline(projectId: string) {
  const basis = await researchBasis(projectId);
  return { outline: basis.outline.map((o) => o.trim()).filter(Boolean), basisProjectId: basis.projectId };
}

export async function countAdopted() {
  return (await getSources()).filter(isAdopted).length;
}

function meta(s: Source) {
  const b = s.bib;
  return [b?.authors, b?.year, b?.journal || b?.publisher].filter(Boolean).join(", ") || s.origin || "서지 정보 없음";
}

export async function draftChapter(projectId: string, chapter: string): Promise<ChapterDraft> {
  const basis = await researchBasis(projectId);
  const outline = basis.outline.map((o) => o.trim()).filter(Boolean);
  const adopted = (await getSources()).filter(isAdopted);
  if (!adopted.length)
    return { ok: false, chapter, insufficient: true, reason: "채택한 자료가 하나도 없어요. 자료 관리에서 자료를 ‘채택’해 주세요.", costUsd: 0 };

  // 이 장으로 배정된 자료를 앞에, 나머지는 관련도 높은 순 (AI가 이 장에 맞는 자료만 골라 씀)
  const topicOf = (s: Source) => s.classification?.decision?.finalTopic || s.classification?.topic || "";
  const forThis = (s: Source) => outline.length > 0 && matchTopic(topicOf(s), outline) === matchTopic(chapter, outline);
  const picked = [...adopted]
    .sort((a, b) => Number(forThis(b)) - Number(forThis(a)) || (b.classification?.relevance ?? 0) - (a.classification?.relevance ?? 0))
    .slice(0, MAX_SOURCES);
  const byKey = new Map<string, Source>();
  const inputs: ChapterSourceInput[] = picked.map((s, i) => {
    const key = `S${i + 1}`;
    byKey.set(key, s);
    return {
      key,
      title: s.title,
      meta: meta(s),
      summary: s.classification?.summary ?? "",
      excerpt: s.content.slice(0, EXCERPT_CHARS),
      topic: topicOf(s),
    };
  });

  const { draft, usage } = await writeChapter({ chapter, research: basis, sources: inputs });
  if (!draft.enough || !draft.sections.length)
    return {
      ok: false,
      chapter,
      insufficient: true,
      reason: draft.reason.trim() || "이 장과 관련된 채택 자료가 부족해요.",
      costUsd: usage.costUsd,
    };

  // 문장마다 근거 자료를 각주로 (자료가 여럿이면 각주도 여럿 → 참고문헌에 모두 들어감)
  const footnotes: Footnote[] = [];
  const used = new Set<string>();
  let needCheck = 0;
  const sentence = (text: string, keys: string[]) => {
    let t = text.trim();
    const srcs = [...new Set(keys.map((k) => k.trim().toUpperCase()))].map((k) => byKey.get(k)).filter((s): s is Source => !!s);
    // 근거 없이 숫자(통계·연도·비율)를 말하는 문장은 반드시 [확인 필요] (장 도입·연결 문장은 그대로)
    if (!srcs.length && /\d/.test(t) && !t.includes(NEED_CHECK)) t = `${t.replace(/\s+$/, "")} ${NEED_CHECK}`;
    if (t.includes(NEED_CHECK)) needCheck++;
    for (const s of srcs) {
      const id = newFootnoteId();
      footnotes.push({ id, text: footnoteCitation(s), sourceId: s.id });
      used.add(s.title);
      t += `[^${id}]`;
    }
    return t;
  };
  const body = [
    `# ${chapter}`,
    ...draft.sections.map((sec) =>
      [`## ${sec.title.trim()}`, ...sec.paragraphs.map((p) => p.sentences.map((s) => sentence(s.text, s.sources)).join(" "))].join("\n\n")
    ),
  ].join("\n\n");

  if (!used.size)
    return {
      ok: false,
      chapter,
      insufficient: true,
      reason: "채택 자료에서 이 장의 근거를 찾지 못했어요.",
      costUsd: usage.costUsd,
    };
  return {
    ok: true,
    chapter,
    body,
    footnotes,
    used: [...used],
    needCheck,
    costUsd: usage.costUsd,
    tokens: { input: usage.inputTokens, output: usage.outputTokens },
  };
}
