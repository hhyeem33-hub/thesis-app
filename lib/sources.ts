import { promises as fs } from "fs";
import path from "path";
import {
  dbCountDrafts,
  dbGetResearch,
  dbGetSource,
  dbGetSources,
  dbSaveResearch,
  dbSaveSource,
  ONLINE,
} from "./db";
import { countAiDocs } from "./folders";
import { getProjects } from "./store";
import type { Research, Source } from "./types";

// 자료·연구 설정 저장소: 온라인은 슈파베이스, 내 컴퓨터는 data/sources.json · data/research.json

const DATA_DIR = path.join(process.cwd(), "data");
const SOURCES_FILE = path.join(DATA_DIR, "sources.json");
const RESEARCH_FILE = path.join(DATA_DIR, "research.json");

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

/** 최근 수정한 순서 */
export async function getSources(): Promise<Source[]> {
  if (ONLINE) return dbGetSources();
  const list = (await readJson<Source[]>(SOURCES_FILE)) ?? [];
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getSource(id: string): Promise<Source | null> {
  if (ONLINE) return dbGetSource(id);
  return (await getSources()).find((s) => s.id === id) ?? null;
}

/** 내 컴퓨터 파일 저장을 한 번에 하나씩 (AI 판단을 4개씩 동시에 해도 서로 덮어쓰지 않게) */
let saveQueue: Promise<unknown> = Promise.resolve();

/** 새 자료는 추가하고, 같은 id가 있으면 바꾼다 */
export async function saveSource(source: Source) {
  if (ONLINE) return dbSaveSource(source);
  const run = saveQueue.then(async () => {
    const list = (await readJson<Source[]>(SOURCES_FILE)) ?? [];
    const i = list.findIndex((s) => s.id === source.id);
    if (i >= 0) list[i] = source;
    else list.push(source);
    // 임시 파일에 다 쓴 뒤 바꿔 끼운다 (쓰는 도중에 읽어도 깨진 파일을 보지 않게)
    const tmp = `${SOURCES_FILE}.${process.pid}.tmp`;
    await fs.mkdir(DATA_DIR, { recursive: true });
    const text = JSON.stringify(list, null, 2) + "\n";
    await fs.writeFile(tmp, text, "utf8");
    try {
      await fs.rename(tmp, SOURCES_FILE);
    } catch {
      // 윈도우·원드라이브가 파일을 잠깐 잡고 있으면 바꿔 끼우기가 안 될 수 있다 → 바로 쓴다
      await fs.writeFile(SOURCES_FILE, text, "utf8");
      await fs.rm(tmp, { force: true });
    }
  });
  saveQueue = run.catch(() => {});
  return run;
}

export async function getResearch(): Promise<Research> {
  const saved = ONLINE ? await dbGetResearch() : await readJson<Research>(RESEARCH_FILE);
  return { topic: saved?.topic ?? "", keywords: saved?.keywords ?? [] };
}

export async function saveResearch(research: Research) {
  if (ONLINE) return dbSaveResearch(research);
  await writeJson(RESEARCH_FILE, research);
}

/** AI 생성물 수: 온라인은 AI 초안 기록, 내 컴퓨터는 드라이브 'AI 작성글' 폴더의 hwpx 수 */
export async function countAiOutputs(): Promise<number> {
  if (ONLINE) return dbCountDrafts();
  const counts = await Promise.all((await getProjects()).map(countAiDocs));
  return counts.reduce<number>((sum, n) => sum + (n ?? 0), 0);
}
