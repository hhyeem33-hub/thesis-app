// 원고 속 표 읽기 (마크다운 표: | 칸 | 칸 | 줄, 둘째 줄 | --- | --- | 는 있어도 없어도 됨)
// 표 바로 위 한 줄이 "<표 1> 제목" · "표 1. 제목"이면 표 제목으로 쓴다. 첫 줄은 머리글 행.
// 출력(HTML·PDF·DOCX·Markdown)·HWPX·미리보기가 같이 쓴다.

export type ParsedTable = {
  /** 표 앞에 붙어 있던 일반 글 (빈 줄 없이 바로 표가 이어질 때) */
  before: string;
  caption: string;
  rows: string[][];
};

const ROW = /^\|.*\|?$/;
const SEP_CELL = /^:?-{2,}:?$/;
const CAPTION = /^[<〈＜]\s*표\s*\d*\s*[>〉＞]\s*|^표\s*\d+\s*[.:)]\s*/;

function cells(line: string) {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

/** 문단 덩어리(빈 줄로 나뉜 것)가 표를 담고 있으면 나눠서 돌려준다. 아니면 null */
export function parseTable(block: string): ParsedTable | null {
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  const start = lines.findIndex((l) => ROW.test(l));
  if (start < 0) return null;
  const tableLines = lines.slice(start);
  if (!tableLines.every((l) => ROW.test(l))) return null;
  const rows = tableLines.map(cells).filter((r) => !r.every((c) => SEP_CELL.test(c)));
  // 한 줄짜리 "| ... |" 는 표가 아니라 그냥 글일 수 있다
  if (rows.length < 2 && tableLines.length < 2) return null;
  const width = Math.max(...rows.map((r) => r.length));
  const filled = rows.map((r) => [...r, ...Array(width - r.length).fill("")]);

  const pre = lines.slice(0, start);
  let caption = "";
  if (pre.length && CAPTION.test(pre[pre.length - 1])) caption = pre.pop()!.replace(CAPTION, "").trim();
  return { before: pre.join(" "), caption, rows: filled };
}
