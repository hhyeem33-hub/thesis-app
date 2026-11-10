import { NO_TOPIC, type ResearchBasis } from "./ai";

// 규칙 기반 분류 (AI 키가 없을 때): 자료의 제목·키워드·앞부분이 연구 설정 키워드와 얼마나 겹치는지로 등급을 매긴다.
// AI 비용이 들지 않는다. 판단이 거칠어서 신뢰도는 항상 '낮음'으로 둔다.

const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 연구 설정에서 비교할 낱말들 (핵심 키워드 + 목적·질문에서 2글자 이상 낱말) */
function basisWords(r: ResearchBasis) {
  const words = new Set<string>();
  for (const k of r.keywords) if (k.trim()) words.add(k.trim());
  for (const line of [r.purpose, ...r.questions])
    for (const w of line.split(/[\s,.·?!()「」『』"'‘’“”]+/))
      if (w.length >= 2 && !/^(그리고|어떻게|어떤|있는가|다른가|보이는가|밝힌다|차이를|차이)$/.test(w)) words.add(w.replace(/(을|를|이|가|은|는|의|에|와|과|로|으로)$/, ""));
  return [...words].filter((w) => w.length >= 2);
}

export function ruleClassify(input: { title: string; content: string; research: ResearchBasis }) {
  const keywords = input.research.keywords.map((k) => k.trim()).filter(Boolean);
  const title = squash(input.title);
  const body = squash(input.content.slice(0, 3000));
  const words = basisWords(input.research);

  // 핵심 키워드가 제목에 있으면 2점, 본문에만 있으면 1점. 목적·질문 낱말은 0.5점
  let score = 0;
  const hits: string[] = [];
  for (const k of keywords) {
    const s = squash(k);
    if (title.includes(s)) {
      score += 2;
      hits.push(k);
    } else if (body.includes(s)) {
      score += 1;
      hits.push(k);
    }
  }
  for (const w of words) {
    if (keywords.includes(w)) continue;
    if (title.includes(squash(w)) || body.includes(squash(w))) score += 0.5;
  }
  const relevance = score >= 6 ? 5 : score >= 4 ? 4 : score >= 2.5 ? 3 : score >= 1 ? 2 : 1;

  // 제안 토픽: 목차 항목의 낱말이 제목·앞부분과 가장 많이 겹치는 곳
  let topic = input.research.outline.length ? NO_TOPIC : hits[0] ?? "미분류";
  let best = 0;
  for (const item of input.research.outline) {
    const parts = item.split(/[\s·,]+/).filter((p) => p.length >= 2 && !/^(분석|연구|비교)$/.test(p));
    const n = parts.filter((p) => title.includes(squash(p)) || body.includes(squash(p))).length;
    if (n > best) {
      best = n;
      topic = item;
    }
  }

  const para = relevance >= 4 ? "projects" : relevance === 3 ? "areas" : relevance === 2 ? "resources" : "archives";
  return {
    relevance,
    topic,
    keywords: hits.slice(0, 8),
    reason: hits.length
      ? `규칙 기반 판단(AI 아님): 연구 설정 키워드 ${hits.map((h) => `‘${h}’`).join(", ")}가 제목·내용에 나와 ${relevance}등급으로 매겼다.`
      : "규칙 기반 판단(AI 아님): 연구 설정 키워드가 제목·내용에 거의 나오지 않아 관련도를 낮게 매겼다.",
    confidence: "낮음" as const,
    para: para as "projects" | "areas" | "resources" | "archives",
    summary: input.content.replace(/\s+/g, " ").trim().slice(0, 200),
  };
}
