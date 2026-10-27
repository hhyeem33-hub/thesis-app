import { promises as fs } from "fs";
import path from "path";
import { isDirectory } from "./store";
import type { FolderStatus, Project } from "./types";

// ⚠️ 옵시디언 보관함 보호 규칙 (CLAUDE.md 참고)
// - 보관함 안의 기존 파일은 절대 수정·삭제하지 않는다.
// - 앱은 "논문작업실/<프로젝트 이름>" 폴더 안에만 새 파일을 만든다.
// - 파일은 "wx" 플래그로만 쓴다: 이미 있으면 덮어쓰지 않고 그대로 둔다.

export const APP_FOLDER = "논문작업실";
export const AI_FOLDER = "AI 작성글";
export const OVERVIEW_NOTE = "00_프로젝트 개요.md";

/** <root>\논문작업실\<이름> 경로. 이름이 폴더 밖으로 벗어나지 못하게 확인한다. */
function projectDir(root: string, name: string) {
  const base = path.resolve(root, APP_FOLDER);
  const dir = path.resolve(base, name);
  if (path.dirname(dir) !== base) throw new Error("잘못된 프로젝트 이름이에요.");
  return dir;
}

export async function projectFolderExists(root: string, name: string) {
  if (!root) return false;
  return isDirectory(projectDir(root, name));
}

function toMessage(e: unknown) {
  const err = e as NodeJS.ErrnoException;
  switch (err.code) {
    case "EACCES":
    case "EPERM":
      return "권한이 없어 폴더를 만들 수 없어요. 파일이 다른 프로그램에서 열려 있는지 확인해 주세요.";
    case "ENOENT":
      return "경로를 찾을 수 없어요. 설정의 경로를 확인해 주세요.";
    case "ENOTDIR":
      return "같은 이름의 파일이 있어서 폴더를 만들 수 없어요.";
    default:
      return err.message ?? String(e);
  }
}

function overviewNote(project: Project) {
  const date = project.createdAt.slice(0, 10);
  return `---
tags: [논문작업실]
created: ${date}
---
# ${project.name}

## 프로젝트 설명
${project.description || "(설명 없음)"}

## 폴더 안내
- 이 폴더: 연구 자료와 메모를 정리하는 곳
- 구글 드라이브 \`내 드라이브/${APP_FOLDER}/${project.name}/${AI_FOLDER}\`: AI가 쓴 글이 저장되는 곳

## 할 일
- [ ] 연구 주제 정리
- [ ] 참고문헌 모으기
- [ ] 목차 초안 만들기
`;
}

export async function createObsidianFolder(
  vaultPath: string,
  project: Project
): Promise<FolderStatus> {
  if (!vaultPath)
    return { ok: false, error: "설정에서 옵시디언 보관함 경로를 지정해 주세요." };
  if (!(await isDirectory(vaultPath)))
    return { ok: false, error: `보관함 폴더를 찾을 수 없어요: ${vaultPath}` };
  try {
    const dir = projectDir(vaultPath, project.name);
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.writeFile(path.join(dir, OVERVIEW_NOTE), overviewNote(project), {
        encoding: "utf8",
        flag: "wx",
      });
    } catch (e) {
      // 노트가 이미 있으면 덮어쓰지 않고 그대로 둔다
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    return { ok: true, path: dir };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}

/** 드라이브 "AI 작성글" 폴더 안의 hwpx 파일 수. 폴더를 못 읽으면 null. */
export async function countAiDocs(project: Project): Promise<number | null> {
  if (!project.drive.ok || !project.drive.path) return null;
  try {
    const files = await fs.readdir(path.join(project.drive.path, AI_FOLDER));
    return files.filter((f) => f.toLowerCase().endsWith(".hwpx")).length;
  } catch {
    return null;
  }
}

/**
 * 프로젝트 폴더 안에 "AI 작성글" 폴더를 만들고, 정말 생겼는지 확인한다.
 * 구글 드라이브는 동기화 중에 방금 만든 폴더가 바로 안 보일 수 있어 몇 번 다시 시도한다.
 */
async function ensureAiFolder(dir: string) {
  const aiDir = path.join(dir, AI_FOLDER);
  for (let i = 0; i < 5; i++) {
    await fs.mkdir(aiDir, { recursive: true });
    if (await isDirectory(aiDir)) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`'${AI_FOLDER}' 폴더를 만들지 못했어요. 구글 드라이브 앱이 켜져 있는지 확인하고 다시 시도해 주세요.`);
}

export async function createDriveFolder(
  driveRoot: string,
  project: Project
): Promise<FolderStatus> {
  if (!driveRoot)
    return { ok: false, error: "설정에서 구글 드라이브 경로를 지정해 주세요." };
  if (!(await isDirectory(driveRoot)))
    return {
      ok: false,
      error: `드라이브 폴더를 찾을 수 없어요: ${driveRoot} (구글 드라이브 앱이 켜져 있는지 확인해 주세요)`,
    };
  try {
    const dir = projectDir(driveRoot, project.name);
    await fs.mkdir(dir, { recursive: true });
    await ensureAiFolder(dir);
    return { ok: true, path: dir };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}
