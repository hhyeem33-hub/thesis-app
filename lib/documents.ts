import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { countChars } from "./bib";
import {
  dbGetDoc,
  dbGetVersion,
  dbListDrafts,
  dbListVersions,
  dbSaveDoc,
  ONLINE,
} from "./db";
import type { AiDraftRecord, DocVersion, ThesisDoc } from "./types";

// 논문 원고·버전 기록·AI 초안 기록 저장소
// 온라인은 슈파베이스(documents, document_versions, ai_drafts 표),
// 내 컴퓨터는 data/documents.json · data/document-versions.json · data/ai-drafts.json

const DATA_DIR = path.join(process.cwd(), "data");
const DOCS_FILE = path.join(DATA_DIR, "documents.json");
const VERSIONS_FILE = path.join(DATA_DIR, "document-versions.json");
const DRAFTS_FILE = path.join(DATA_DIR, "ai-drafts.json");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
}

async function writeJson(file: string, data: unknown) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function emptyDoc(projectId: string, title = ""): ThesisDoc {
  return {
    projectId,
    title,
    author: "",
    affiliation: "",
    body: "",
    footnotes: [],
    updatedAt: new Date(0).toISOString(),
  };
}

export async function getDoc(projectId: string): Promise<ThesisDoc | null> {
  if (ONLINE) return dbGetDoc(projectId);
  const docs = await readJson<Record<string, ThesisDoc>>(DOCS_FILE, {});
  return docs[projectId] ?? null;
}

/** 원고를 저장하고 버전 하나를 기록한다 */
export async function saveDocWithVersion(doc: ThesisDoc, memo: string): Promise<DocVersion> {
  const now = new Date().toISOString();
  const saved: ThesisDoc = { ...doc, updatedAt: now };
  const version: DocVersion = {
    id: randomUUID(),
    projectId: doc.projectId,
    savedAt: now,
    chars: countChars(doc.body),
    memo: memo.trim().slice(0, 100),
    doc: saved,
  };
  if (ONLINE) {
    await dbSaveDoc(saved, version);
    return version;
  }
  const docs = await readJson<Record<string, ThesisDoc>>(DOCS_FILE, {});
  docs[doc.projectId] = saved;
  await writeJson(DOCS_FILE, docs);
  const versions = await readJson<DocVersion[]>(VERSIONS_FILE, []);
  versions.push(version);
  await writeJson(VERSIONS_FILE, versions);
  return version;
}

/** 최신순 버전 목록 (원고 내용 없이) */
export async function listVersions(projectId: string): Promise<Omit<DocVersion, "doc">[]> {
  if (ONLINE) return dbListVersions(projectId);
  const versions = await readJson<DocVersion[]>(VERSIONS_FILE, []);
  return versions
    .filter((v) => v.projectId === projectId)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .map(({ doc, ...v }) => (void doc, v));
}

export async function getVersion(id: string): Promise<DocVersion | null> {
  if (ONLINE) return dbGetVersion(id);
  const versions = await readJson<DocVersion[]>(VERSIONS_FILE, []);
  return versions.find((v) => v.id === id) ?? null;
}

/** 내 컴퓨터에서 쓴 AI 초안 기록 (온라인은 ai_drafts 표에 이미 기록됨) */
export async function recordLocalDraft(d: Omit<AiDraftRecord, "id" | "createdAt">) {
  if (ONLINE) return;
  const list = await readJson<AiDraftRecord[]>(DRAFTS_FILE, []);
  list.push({ ...d, id: randomUUID(), createdAt: new Date().toISOString() });
  await writeJson(DRAFTS_FILE, list.slice(-50));
}

export async function listDrafts(): Promise<AiDraftRecord[]> {
  if (ONLINE) return dbListDrafts();
  const list = await readJson<AiDraftRecord[]>(DRAFTS_FILE, []);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
