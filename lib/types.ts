export type FolderStatus = {
  ok: boolean;
  /** 생성된 폴더의 전체 경로 (성공했을 때) */
  path?: string;
  /** 실패 이유 (실패했을 때) */
  error?: string;
  /** 온라인(버셀)에서 만든 프로젝트: 폴더는 내 컴퓨터에서만 만들어진다 */
  localOnly?: boolean;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  /** ISO 형식 날짜 문자열 */
  createdAt: string;
  obsidian: FolderStatus;
  drive: FolderStatus;
};

export type Settings = {
  /** 옵시디언 보관함 폴더 (예: C:\Users\me\Documents\Obsidian Vault) */
  obsidianVaultPath: string;
  /** 구글 드라이브 데스크톱 앱의 내 드라이브 폴더 (예: G:\내 드라이브) */
  driveRootPath: string;
};

/** 화면에 보여줄 때 붙이는 값 (저장하지 않음) */
export type ProjectRow = Project & {
  /** AI 작성글 폴더의 hwpx 개수. 폴더를 못 읽으면 null */
  aiDocCount: number | null;
};

export type FolderTarget = "obsidian" | "drive";

export type ActionResult =
  | { ok: true; /** 성공했지만 알려줄 문제 (예: 폴더 일부 실패) */ warning?: string }
  | { ok: false; error: string };

export type DraftResult =
  | {
      ok: true;
      /** AI가 쓴 원고 (화면 표시용) */
      manuscript: import("./ai").Manuscript;
      /** hwpx 저장 위치 (내 컴퓨터에서 저장했을 때) */
      savedPath?: string;
      /** 저장하지 못한 이유 (원고는 화면에 보여 줌) */
      saveNote?: string;
    }
  | { ok: false; error: string };

// ── 자료 (AI WIKI 기능) ───────────────────────────────────────────────────

export const SOURCE_TYPES = ["pdf", "markdown", "web", "youtube"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SOURCE_TYPE_LABEL: Record<SourceType | "ai", string> = {
  pdf: "PDF",
  markdown: "Markdown",
  web: "웹",
  youtube: "YouTube",
  ai: "AI 생성",
};

export const PARA = ["projects", "areas", "resources", "archives"] as const;
export type Para = (typeof PARA)[number];
export const PARA_LABEL: Record<Para, string> = {
  projects: "Projects",
  areas: "Areas",
  resources: "Resources",
  archives: "Archives",
};

export const CONFIDENCE = ["높음", "중간", "낮음"] as const;
export type Confidence = (typeof CONFIDENCE)[number];

/** 연구자 확정 상태: 채택 · 보류 · 제외 (null = 아직 정하지 않음) */
export const DECISIONS = ["adopted", "held", "excluded"] as const;
export type DecisionStatus = (typeof DECISIONS)[number];
export const DECISION_LABEL: Record<DecisionStatus, string> = { adopted: "채택", held: "보류", excluded: "제외" };

export type Decision = {
  status: DecisionStatus | null;
  /** 최종 토픽 (비우면 미분류) */
  finalTopic: string;
  finalKeywords: string[];
  /** 내 관점 메모 */
  note: string;
  decidedAt: string;
};

export type ClassificationLog = { at: string; who: "AI" | "연구자"; what: string };

/** AI 판단 (+ 연구자 확정). sources.classification 칸에 함께 저장 */
export type Classification = {
  para: Para;
  /** 내 연구와의 관련도 1~5 */
  relevance: number;
  summary: string;
  classifiedAt: string;
  /** 제안 토픽 */
  topic?: string;
  /** 관련 키워드 */
  keywords?: string[];
  /** 분류 근거 */
  reason?: string;
  confidence?: Confidence;
  /** 판단에 쓴 프로젝트 (연구 설정 기준) */
  basisProjectId?: string | null;
  decision?: Decision;
  /** 분류 수정 기록 (최근 30개) */
  log?: ClassificationLog[];
};

/** 프로젝트별 연구 설정 (AI 분류·AI 초안의 기준) */
export type ProjectResearch = {
  purpose: string;
  keywords: string[];
  perspective: string;
  /** 한 줄에 하나 */
  questions: string[];
  /** 목차 (/ 로 구분해 입력) */
  outline: string[];
  updatedAt: string;
};
export type ProjectResearchRecord = ProjectResearch & {
  /** 수정 이력 (최근 50개, 바뀐 칸과 그때 값) */
  history: { at: string; changed: string[]; snapshot: ProjectResearch }[];
};

export type Source = {
  id: string;
  projectId: string | null;
  title: string;
  type: SourceType;
  /** 출처 (URL, 서지 정보 등). 비어 있으면 "미확인 출처" */
  origin: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  classification: Classification | null;
  /** 서지 정보 (없으면 null) */
  bib?: Bib | null;
};

export type Research = {
  topic: string;
  keywords: string[];
};

// ── 서지 정보 · 논문 원고 · 히스토리 ──────────────────────────────────────────

/** 자료의 서지 정보 (참고문헌·각주에 쓰임). 모르는 칸은 빈 문자열 → [보완 필요] */
export type Bib = {
  kind: "article" | "book" | "web";
  /** 저자. 여러 명이면 쉼표로 (예: 홍길동, 김철수) */
  authors: string;
  year: string;
  /** 학술지명 (논문) */
  journal: string;
  volume: string;
  issue: string;
  pages: string;
  /** 출판사·발행기관 */
  publisher: string;
  /** 출판지 (책) */
  place: string;
  doi: string;
  /** KCI 논문 번호 (ART…) */
  kciId: string;
  /** 자료 분류 표시 (예: 선행연구) */
  category: string;
};

export type Footnote = {
  /** 본문의 [^id] 표시와 짝 */
  id: string;
  text: string;
  /** 라이브러리 자료를 출처로 쓴 경우 */
  sourceId: string | null;
};

/** 프로젝트 하나의 논문 원고 */
export type ThesisDoc = {
  projectId: string;
  title: string;
  author: string;
  affiliation: string;
  /** "# 장", "## 절", "### 목" 제목 줄 + 빈 줄로 나눈 문단. 각주 자리는 [^id] */
  body: string;
  footnotes: Footnote[];
  updatedAt: string;
};

export type DocVersion = {
  id: string;
  projectId: string;
  savedAt: string;
  /** 본문 글자 수 (각주 표시 제외) */
  chars: number;
  memo: string;
  doc: ThesisDoc;
};

/** 글쓰기 화면에서 불러올 AI 초안 */
export type AiDraftRecord = {
  id: string;
  projectId: string | null;
  topic: string;
  title: string;
  createdAt: string;
  manuscript: import("./ai").Manuscript;
};

/** KCI에서 가져온 논문 정보 */
export type KciArticle = {
  kciId: string;
  title: string;
  authors: string;
  journal: string;
  year: string;
  volume: string;
  issue: string;
  pages: string;
  publisher: string;
  doi: string;
  keywords: string;
  abstract: string;
  url: string;
};
