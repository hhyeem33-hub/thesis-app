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

export type Classification = {
  para: Para;
  /** 내 연구 주제와의 관련도 1~5 */
  relevance: number;
  summary: string;
  classifiedAt: string;
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
};

export type Research = {
  topic: string;
  keywords: string[];
};
