export type FolderStatus = {
  ok: boolean;
  /** 생성된 폴더의 전체 경로 (성공했을 때) */
  path?: string;
  /** 실패 이유 (실패했을 때) */
  error?: string;
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
