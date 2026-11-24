// 자료 유형 (교수님 요청으로 드라이브 폴더 구조와 같게): 학위논문 · 학술지논문 · 단행본 · 보고서·통계 · 신문기사·웹자료 · 영상자료
// 화면·서버·스크립트(scripts/reorganize-drive.mjs)가 같이 쓰는 순수 함수만 둔다 (다른 파일을 import 하지 않음).

export const MATERIAL_TYPES = ["학위논문", "학술지논문", "단행본", "보고서·통계", "신문기사·웹자료", "영상자료"] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];
export type MaterialRegion = "국내" | "중국";

/** 드라이브 폴더 이름 (논문작업실/<프로젝트>/ 아래) */
export const MATERIAL_FOLDER: Record<MaterialType, string> = {
  학위논문: "01_학위논문",
  학술지논문: "02_학술지논문",
  단행본: "03_단행본",
  "보고서·통계": "04_보고서·통계",
  "신문기사·웹자료": "05_신문기사·웹자료",
  영상자료: "06_영상자료",
};
export const UNSURE_FOLDER = "99_분류확인필요";

export function isMaterialType(v: unknown): v is MaterialType {
  return typeof v === "string" && (MATERIAL_TYPES as readonly string[]).includes(v);
}

/** 폴더 경로("02_학술지논문 / 중국", "05_신문기사·웹자료")에서 자료 유형 읽기. 모르면 null */
export function materialFromFolder(folderPath: string): MaterialType | null {
  const norm = (t: string) => t.replace(/^\d+[_.\s-]*/, "").replace(/[\s·・.,_-]/g, "");
  for (const part of folderPath.split(/\s*[/\\]\s*/)) {
    const p = norm(part);
    if (!p) continue;
    for (const t of MATERIAL_TYPES) if (p === norm(t)) return t;
    // 짧게 쓴 폴더 이름도 받기
    if (/^(학위|석사|박사|학위논문)/.test(p)) return "학위논문";
    if (/^(학술지|학술논문|저널)/.test(p)) return "학술지논문";
    if (/^(단행본|도서|책)$/.test(p)) return "단행본";
    if (/^(보고서|통계|시장보고서)/.test(p)) return "보고서·통계";
    if (/^(신문|기사|웹자료|웹)/.test(p)) return "신문기사·웹자료";
    if (/^(영상|유튜브|동영상)/.test(p)) return "영상자료";
  }
  return null;
}

type SourceLike = {
  title: string;
  type?: string;
  origin?: string;
  content?: string;
  bib?: { kind?: string; kciId?: string; materialType?: string } | null;
};

const REPORT_HOSTS = [
  "sphericalinsights.com",
  "fortunebusinessinsights.com",
  "gminsights.com",
  "straitsresearch.com",
  "giikorea.co.kr",
  "businessresearchinsights.com",
  "eiec.kdi.re.kr",
  "dream.kotra.or.kr",
  "datalab.visitkorea.or.kr",
  "tradesupport.gwd.go.kr",
  "kostat.go.kr",
];

const host = (origin = "") => {
  try {
    return new URL(origin).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** 중국어로만 된 제목·CNKI → 중국, 그 밖 → 국내 (논문 자료만 의미 있음) */
export function guessRegion(s: SourceLike): MaterialRegion {
  if (/cnki/i.test(s.origin ?? "")) return "중국";
  return /[一-鿿]/.test(s.title) && !/[가-힣]/.test(s.title) ? "중국" : "국내";
}

/**
 * 제목·주소·앞부분 글로 자료 유형 짐작. 애매하면 type=null (→ 99_분류확인필요).
 * reason 은 사람이 확인할 때 보여 줄 짧은 이유.
 */
export function guessMaterial(s: SourceLike): { type: MaterialType | null; reason: string } {
  const origin = s.origin ?? "";
  const h = host(origin);
  const title = s.title ?? "";
  const head = (s.content ?? "").slice(0, 3000);
  const top = (s.content ?? "").slice(0, 400);

  if (s.type === "youtube" || /(^|\.)youtube\.com$|^youtu\.be$/.test(h)) return { type: "영상자료", reason: "유튜브 주소" };
  if (origin.startsWith("내 메모")) return { type: null, reason: "내가 쓴 메모 (자료가 아니라 원고·메모일 수 있음)" };
  if (/^scholar\.google\./.test(h)) return { type: null, reason: "구글 학술 검색 결과 화면 (논문 1편이 아님)" };
  if (/(석사|박사)\s*학위\s*논문|学位论文/.test(title)) return { type: "학위논문", reason: "제목에 학위논문" };
  if (/kci\.go\.kr$/.test(h) || s.bib?.kciId) return { type: "학술지논문", reason: "KCI 논문" };
  if (/dbpia/.test(h)) {
    if (/논문 검색 결과/.test(title)) return { type: null, reason: "DBpia 검색 결과 화면 (논문 1편이 아님)" };
    if (/nodeId=T\d/.test(origin) || /\)\s*학위논문\s*\[|\s학위논문\s/.test(head.slice(0, 2000)))
      return { type: "학위논문", reason: "DBpia 학위논문" };
    if (/학술대회자료/.test(head)) return { type: null, reason: "학술대회 발표자료 (학술지 논문인지 확인 필요)" };
    if (/학술저널/.test(head)) return { type: "학술지논문", reason: "DBpia 학술저널" };
    return { type: null, reason: "DBpia 자료 종류를 못 읽음" };
  }
  if (/kiss\.kstudy\.com$/.test(h)) {
    if (/초록집/.test(title)) return { type: null, reason: "학회 초록집 (학술지 논문인지 확인 필요)" };
    if (/브리프|산업연구원|연구원$/.test(title)) return { type: "보고서·통계", reason: "연구기관 보고서" };
    return { type: "학술지논문", reason: "KISS 학술지" };
  }
  if (/scienceon\.kisti\.re\.kr$/.test(h)) {
    if (/^\s*\[보고서\]/.test(title)) return { type: "보고서·통계", reason: "ScienceON 보고서" };
    return { type: "학술지논문", reason: "ScienceON 논문" };
  }
  // 내 파일로 올린 PDF (CNKI 등): 앞부분으로 판단
  if (s.type === "pdf" || origin.startsWith("내 파일")) {
    if (/第\s*\d+\s*期|\d+권\s*\d+호|Vol\.\s*\d+/i.test(top.slice(0, 80))) return { type: "학술지논문", reason: "PDF 첫머리에 권·호(期)" };
    if (/报告|보고서|Report/i.test(top)) return { type: "보고서·통계", reason: "PDF 앞부분에 보고서" };
    return { type: null, reason: "올린 파일 — 학술지·잡지·보고서 중 무엇인지 못 읽음" };
  }
  if (REPORT_HOSTS.some((r) => h === r || h.endsWith(`.${r}`))) return { type: "보고서·통계", reason: "시장조사·기관 보고서 사이트" };
  if (/보고서|통계|조사\s*결과|매뉴얼|민원인안내서|백서|report/i.test(title)) return { type: "보고서·통계", reason: "제목에 보고서·통계" };
  if (/^https?:\/\//.test(origin)) return { type: "신문기사·웹자료", reason: "웹 주소 (기사·블로그·누리집)" };
  return { type: null, reason: "출처가 없어 유형을 못 정함" };
}

/** 저장된 유형이 있으면 그것, 없으면 짐작한 유형 (못 정하면 null) */
export function materialTypeOf(s: SourceLike): MaterialType | null {
  const saved = s.bib?.materialType;
  if (isMaterialType(saved)) return saved;
  return guessMaterial(s).type;
}
