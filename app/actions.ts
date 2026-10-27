"use server";

import { execFile } from "child_process";
import { randomUUID } from "crypto";
import path from "path";
import { revalidatePath } from "next/cache";
import {
  AI_FOLDER,
  createDriveFolder,
  createObsidianFolder,
  projectFolderExists,
} from "@/lib/folders";
import {
  getProjects,
  getSettings,
  isDirectory,
  saveProjects,
  saveSettings,
} from "@/lib/store";
import type { ActionResult, FolderTarget, Project } from "@/lib/types";
import { validateProjectName } from "@/lib/validate";

export async function createProject(input: {
  name: string;
  description: string;
}): Promise<ActionResult> {
  const name = input.name.trim();
  const description = input.description.trim().slice(0, 500);

  const projects = await getProjects();
  const nameError = validateProjectName(name, projects.map((p) => p.name));
  if (nameError) return { ok: false, error: nameError };

  // 앱 밖에서 이미 만들어진 같은 이름 폴더는 건드리지 않는다
  const settings = await getSettings();
  if (await projectFolderExists(settings.obsidianVaultPath, name))
    return {
      ok: false,
      error: "옵시디언 '논문작업실' 폴더 안에 같은 이름의 폴더가 이미 있어요. 다른 이름을 써 주세요.",
    };
  if (await projectFolderExists(settings.driveRootPath, name))
    return {
      ok: false,
      error: "구글 드라이브 '논문작업실' 폴더 안에 같은 이름의 폴더가 이미 있어요. 다른 이름을 써 주세요.",
    };

  const project: Project = {
    id: randomUUID(),
    name,
    description,
    createdAt: new Date().toISOString(),
    obsidian: { ok: false },
    drive: { ok: false },
  };
  project.obsidian = await createObsidianFolder(settings.obsidianVaultPath, project);
  project.drive = await createDriveFolder(settings.driveRootPath, project);

  await saveProjects([...projects, project]);
  revalidatePath("/projects");
  const failed = [
    !project.obsidian.ok && "옵시디언",
    !project.drive.ok && "드라이브",
  ].filter(Boolean);
  return failed.length
    ? { ok: true, warning: `${failed.join("·")} 폴더는 만들지 못했어요. 표의 ‘다시 시도’를 눌러 주세요.` }
    : { ok: true };
}

export async function retryFolder(
  id: string,
  target: FolderTarget
): Promise<ActionResult> {
  const projects = await getProjects();
  const project = projects.find((p) => p.id === id);
  if (!project) return { ok: false, error: "프로젝트를 찾을 수 없어요." };

  const settings = await getSettings();
  const status =
    target === "obsidian"
      ? await createObsidianFolder(settings.obsidianVaultPath, project)
      : await createDriveFolder(settings.driveRootPath, project);
  project[target] = status;

  await saveProjects(projects);
  revalidatePath("/projects");
  return status.ok ? { ok: true } : { ok: false, error: status.error ?? "실패했어요." };
}

/** 프로젝트 폴더를 윈도우 탐색기로 연다 (저장된 프로젝트 경로만 열 수 있음) */
export async function openFolder(
  id: string,
  target: FolderTarget | "ai"
): Promise<ActionResult> {
  const project = (await getProjects()).find((p) => p.id === id);
  const folder =
    target === "ai"
      ? project?.drive.path && path.join(project.drive.path, AI_FOLDER)
      : project?.[target].path;
  if (!folder || !(await isDirectory(folder)))
    return { ok: false, error: "폴더를 찾을 수 없어요." };
  // explorer.exe 는 성공해도 종료 코드 1을 돌려줄 때가 있어 오류는 무시한다
  execFile("explorer.exe", [folder], () => {});
  return { ok: true };
}

export async function updateSettings(input: {
  obsidianVaultPath: string;
  driveRootPath: string;
}): Promise<ActionResult> {
  const clean = (p: string) => p.trim().replace(/^"(.*)"$/, "$1");
  const obsidianVaultPath = clean(input.obsidianVaultPath);
  const driveRootPath = clean(input.driveRootPath);

  if (!(await isDirectory(obsidianVaultPath)))
    return { ok: false, error: "옵시디언 보관함 폴더를 찾을 수 없어요. 경로를 확인해 주세요." };
  if (!(await isDirectory(path.join(obsidianVaultPath, ".obsidian"))))
    return {
      ok: false,
      error: "옵시디언 보관함이 아닌 것 같아요 (.obsidian 폴더가 없어요). 보관함 맨 위 폴더를 지정해 주세요.",
    };
  if (!(await isDirectory(driveRootPath)))
    return { ok: false, error: "구글 드라이브 폴더를 찾을 수 없어요. 경로를 확인해 주세요." };

  await saveSettings({ obsidianVaultPath, driveRootPath });
  revalidatePath("/settings");
  return { ok: true };
}
