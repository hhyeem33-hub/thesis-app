import { promises as fs } from "fs";
import path from "path";
import type { Project, Settings } from "./types";

// DB 대신 프로젝트 폴더 안의 data/*.json 파일에 저장한다.
const DATA_DIR = path.join(process.cwd(), "data");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

async function writeJson(file: string, data: unknown) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/** 최신순으로 정렬된 프로젝트 목록 */
export async function getProjects(): Promise<Project[]> {
  const list = (await readJson<Project[]>(PROJECTS_FILE)) ?? [];
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveProjects(projects: Project[]) {
  await writeJson(PROJECTS_FILE, projects);
}

export async function getSettings(): Promise<Settings> {
  const saved = await readJson<Settings>(SETTINGS_FILE);
  if (saved) return saved;
  return {
    obsidianVaultPath: await detectObsidianVault(),
    driveRootPath: await detectDriveRoot(),
  };
}

export async function saveSettings(settings: Settings) {
  await writeJson(SETTINGS_FILE, settings);
}

export async function isDirectory(p: string) {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** %APPDATA%\obsidian\obsidian.json 에서 보관함 위치를 찾는다 (열려 있는 보관함 우선) */
async function detectObsidianVault(): Promise<string> {
  const appData = process.env.APPDATA;
  if (!appData) return "";
  type ObsidianConfig = {
    vaults?: Record<string, { path: string; ts?: number; open?: boolean }>;
  };
  try {
    const config = await readJson<ObsidianConfig>(
      path.join(appData, "obsidian", "obsidian.json")
    );
    const vaults = Object.values(config?.vaults ?? {});
    vaults.sort(
      (a, b) => Number(!!b.open) - Number(!!a.open) || (b.ts ?? 0) - (a.ts ?? 0)
    );
    return vaults[0]?.path ?? "";
  } catch {
    return "";
  }
}

/** 구글 드라이브 데스크톱 앱이 만든 드라이브(G: 등)에서 "내 드라이브" 폴더를 찾는다 */
async function detectDriveRoot(): Promise<string> {
  const letters = "GDEFHIJKLMNOPQRSTUVWXYZ".split("");
  for (const letter of letters) {
    for (const folder of ["내 드라이브", "My Drive"]) {
      const candidate = `${letter}:\\${folder}`;
      if (await isDirectory(candidate)) return candidate;
    }
  }
  return "";
}
