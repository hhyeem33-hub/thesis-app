import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { existsSync, promises as fs } from "fs";
import os from "os";
import path from "path";
import { buildReferences, docToManuscript } from "./bib";
import type { ThesisDoc } from "./types";
import type { getSources } from "./sources";

// HWPX 만들기 (내 컴퓨터 전용: hufs-thesis-hwpx 스킬의 파이썬 스크립트를 쓴다)
// 올린 양식은 data/templates/ 에 사본으로 둔다 (data 폴더는 깃허브 제외)

const DATA_DIR = path.join(process.cwd(), "data");
const TEMPLATE_DIR = path.join(DATA_DIR, "templates");
const TEMPLATE_LIST = path.join(DATA_DIR, "templates.json");
const SCRIPT = path.join(process.cwd(), ".claude", "skills", "hufs-thesis-hwpx", "scripts", "make_hwpx.py");

export type TemplateInfo = { id: string; name: string; uploadedAt: string };

function python() {
  const local = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "Programs", "Python", "Python312", "python.exe")
    : "";
  return local && existsSync(local) ? local : "python";
}

function run(args: string[]) {
  return new Promise<string>((resolve, reject) =>
    execFile(
      python(),
      [SCRIPT, ...args],
      { cwd: process.cwd(), encoding: "utf8", timeout: 120_000, env: { ...process.env, PYTHONIOENCODING: "utf-8" } },
      (err, stdout, stderr) => {
        // 파이썬 오류 목록(Traceback)은 빼고 마지막 안내 문장만
        const msg = (stderr || stdout || err?.message || "").trim().split("\n").filter(Boolean).at(-1) ?? "";
        return err ? reject(new Error(msg)) : resolve(stdout);
      }
    )
  );
}

export async function listTemplates(): Promise<TemplateInfo[]> {
  try {
    return JSON.parse(await fs.readFile(TEMPLATE_LIST, "utf8")) as TemplateInfo[];
  } catch {
    return [];
  }
}

/** 올린 양식을 검사하고 저장한다. 외대 양식 구조가 아니면 안내 문장을 담은 오류 */
export async function addTemplate(name: string, bytes: Buffer): Promise<TemplateInfo> {
  await fs.mkdir(TEMPLATE_DIR, { recursive: true });
  const id = randomUUID();
  const file = path.join(TEMPLATE_DIR, `${id}.hwpx`);
  await fs.writeFile(file, bytes);
  try {
    await run(["--check-template", "--template", file]);
  } catch (e) {
    await fs.rm(file, { force: true });
    throw e;
  }
  const info: TemplateInfo = { id, name: name.slice(0, 80), uploadedAt: new Date().toISOString() };
  await fs.writeFile(TEMPLATE_LIST, JSON.stringify([...(await listTemplates()), info], null, 2) + "\n", "utf8");
  return info;
}

export async function removeTemplate(id: string) {
  const list = await listTemplates();
  if (!list.some((t) => t.id === id)) return;
  await fs.rm(path.join(TEMPLATE_DIR, `${id}.hwpx`), { force: true });
  await fs.writeFile(TEMPLATE_LIST, JSON.stringify(list.filter((t) => t.id !== id), null, 2) + "\n", "utf8");
}

/** 원고 → hwpx 파일 내용. templateId 가 없으면 기본 외대 양식 */
export async function buildHwpx(
  doc: ThesisDoc,
  sources: Awaited<ReturnType<typeof getSources>>,
  templateId: string | null
): Promise<Buffer> {
  const references = buildReferences(doc, sources).map((r) => r.text);
  const manuscript = docToManuscript(doc, references);
  if (manuscript.chapters.length < 2)
    throw new Error("장 제목(# 으로 시작하는 줄)이 2개 이상 있어야 해요. 예: # 서론, # 결론");
  if (!manuscript.references.length)
    manuscript.references = ["[보완 필요] 참고문헌이 없어요. ‘자료로 각주’로 출처를 달면 자동으로 들어가요."];

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "thesis-hwpx-"));
  try {
    const json = path.join(tmp, "manuscript.json");
    const out = path.join(tmp, "out.hwpx");
    await fs.writeFile(json, JSON.stringify(manuscript), "utf8");
    const args = [json, "--out", out];
    if (templateId) {
      if (!(await listTemplates()).some((t) => t.id === templateId)) throw new Error("양식을 찾을 수 없어요.");
      args.push("--template", path.join(TEMPLATE_DIR, `${templateId}.hwpx`));
    }
    await run(args);
    return await fs.readFile(out);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}
