import { countChars, NEED } from "./bib";
import type { Bib, DocKind, DocPlan, ThesisDoc } from "./types";

// 논문 집필 흐름 (글쓰기 화면 위쪽): 분량 설정 · 장별 분량 · 집필 단계 · 서지 정보 빈칸 검사
// 화면과 서버가 같이 쓴다.

export const DOC_KIND_LABEL: Record<DocKind, string> = { thesis: "학위논문", journal: "학술지 논문", report: "연구보고서" };

/** 고르면 처음 채워지는 장 수·장별 목표 글자 수 (나중에 숫자로 바꿀 수 있음) */
export const DOC_KIND_PRESET: Record<DocKind, { chapters: number; total: number; note: string }> = {
  thesis: { chapters: 5, total: 80_000, note: "석사 학위논문 기준 5장 · 약 8만 자" },
  journal: { chapters: 5, total: 20_000, note: "학술지 투고 기준 5장 · 약 2만 자" },
  report: { chapters: 6, total: 40_000, note: "연구보고서 기준 6장 · 약 4만 자" },
};

export function presetPlan(kind: DocKind): DocPlan {
  const { chapters, total } = DOC_KIND_PRESET[kind];
  // 서론·결론은 짧게, 본론은 길게 (서론 15% · 결론 10% · 나머지 고르게)
  const weights = Array.from({ length: chapters }, (_, i) => (i === 0 ? 1.5 : i === chapters - 1 ? 1 : 2.5));
  const sum = weights.reduce((a, b) => a + b, 0);
  return { kind, chapters, targets: weights.map((w) => Math.round((total * w) / sum / 500) * 500) };
}

/** 장 수를 바꿀 때: 있는 목표는 두고, 늘어난 장은 마지막 본론 장 목표로 채움 */
export function resizePlan(plan: DocPlan, chapters: number): DocPlan {
  const n = Math.min(20, Math.max(1, Math.round(chapters)));
  const fill = plan.targets[Math.max(0, plan.targets.length - 2)] ?? 5000;
  return { ...plan, chapters: n, targets: Array.from({ length: n }, (_, i) => plan.targets[i] ?? fill) };
}

/** 본문을 장("# ")별로 나눠 지금 쓴 글자 수 (장 앞의 글은 첫 장에 넣음) */
export function chapterChars(body: string): { title: string; chars: number }[] {
  const out: { title: string; chars: number }[] = [];
  let lead = "";
  let cur: { title: string; text: string } | null = null;
  const flush = () => cur && out.push({ title: cur.title, chars: countChars(cur.text) });
  for (const line of body.split("\n")) {
    const h = line.match(/^#\s+(.+)$/);
    if (h) {
      flush();
      cur = { title: h[1].trim(), text: "" };
    } else if (cur) cur.text += `${line}\n`;
    else lead += `${line}\n`;
  }
  flush();
  if (lead.trim()) {
    if (out[0]) out[0].chars += countChars(lead);
    else out.push({ title: "(장 제목 없음)", chars: countChars(lead) });
  }
  return out;
}

/** 자료 서지 정보에서 빠진 칸 (참고문헌에 [보완 필요]로 나오는 것) */
export function missingBib(s: { type?: string; bib?: Bib | null }): string[] {
  const b = s.bib;
  const miss: string[] = [];
  if (!b?.authors?.trim()) miss.push("저자");
  if (!b?.year?.trim()) miss.push("연도");
  const kind = b?.kind ?? (s.type === "pdf" ? "article" : "web");
  if (kind === "article" && !b?.journal?.trim()) miss.push("학술지");
  if (kind === "book" && !b?.publisher?.trim()) miss.push("출판사");
  return miss;
}

export const STAGES = ["준비", "초록", "본문 집필", "참고문헌", "양식 적용", "최종 확인"] as const;
export type Stage = (typeof STAGES)[number];

/** 단계마다 다 됐는지 (원고 하나 기준). 화면은 저장된 원고와 지금 원고를 함께 봐서 ‘저장✓ / 저장 전’ 을 나눈다 */
export function stageDone(doc: Pick<ThesisDoc, "title" | "author" | "body" | "abstract" | "keywords" | "plan" | "marks">, references: string[]): Record<Stage, boolean> {
  return {
    준비: !!(doc.title.trim() && doc.author.trim() && doc.plan),
    초록: !!(doc.abstract?.trim() && doc.keywords?.trim()),
    "본문 집필": /^#\s+\S/m.test(doc.body) && countChars(doc.body) > 0,
    참고문헌: references.length > 0 && !references.some((r) => r.includes(NEED)),
    "양식 적용": !!doc.marks?.formatAt,
    "최종 확인": !!doc.marks?.finalAt,
  };
}

export const STAGE_HINT: Record<Stage, string> = {
  준비: "제목·이름을 쓰고 분량(학위논문·학술지 논문·연구보고서)을 정해 저장",
  초록: "국문 초록과 주제어를 쓰고 저장",
  "본문 집필": "장(#)으로 나눠 본문을 쓰고 저장",
  참고문헌: "‘자료로 각주’로 출처를 달고, 서지 정보 [보완 필요]를 모두 채움",
  "양식 적용": "출력 탭에서 HWPX·DOCX·PDF 중 하나로 내보냄",
  "최종 확인": "‘최종 원고’ 화면에서 끝까지 읽고 ‘최종 확인 완료’를 누름",
};
