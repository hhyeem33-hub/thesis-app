"use server";

import { revalidatePath } from "next/cache";
import { countChars } from "@/lib/bib";
import { getVersion, listVersions, saveDocWithVersion } from "@/lib/documents";
import { getSource, saveSource } from "@/lib/sources";
import { getProjects } from "@/lib/store";
import type { Bib, DocVersion, Footnote, ThesisDoc } from "@/lib/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const MAX_BODY = 500_000;

/** 원고 저장 = 버전 하나 기록 */
export async function saveDocument(input: {
  doc: Omit<ThesisDoc, "updatedAt">;
  memo: string;
}): Promise<Result<{ version: Omit<DocVersion, "doc"> }>> {
  const d = input.doc;
  if (!(await getProjects()).some((p) => p.id === d.projectId))
    return { ok: false, error: "프로젝트를 찾을 수 없어요." };
  if (d.body.length > MAX_BODY) return { ok: false, error: "본문이 너무 길어요 (50만 자 이하)." };
  const footnotes: Footnote[] = d.footnotes.slice(0, 2000).map((f) => ({
    id: String(f.id).slice(0, 12),
    text: String(f.text ?? "").slice(0, 2000),
    sourceId: f.sourceId ? String(f.sourceId) : null,
  }));
  try {
    const { doc, ...version } = await saveDocWithVersion(
      {
        projectId: d.projectId,
        title: d.title.slice(0, 200),
        author: d.author.slice(0, 50),
        affiliation: d.affiliation.slice(0, 100),
        body: d.body,
        footnotes,
        updatedAt: "",
      },
      input.memo || `${countChars(d.body).toLocaleString()}자 저장`
    );
    void doc;
    revalidatePath("/write");
    return { ok: true, version };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function fetchVersions(projectId: string): Promise<Result<{ versions: Omit<DocVersion, "doc">[] }>> {
  try {
    return { ok: true, versions: await listVersions(projectId) };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** 예전 버전 보기 */
export async function fetchVersion(id: string): Promise<Result<{ version: DocVersion }>> {
  try {
    const version = await getVersion(id);
    return version ? { ok: true, version } : { ok: false, error: "버전을 찾을 수 없어요." };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** 되돌리기: 예전 버전 내용을 새 버전으로 저장한다 (기록은 지워지지 않음) */
export async function restoreVersion(id: string): Promise<Result<{ doc: ThesisDoc; version: Omit<DocVersion, "doc"> }>> {
  try {
    const old = await getVersion(id);
    if (!old) return { ok: false, error: "버전을 찾을 수 없어요." };
    const when = new Date(old.savedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const { doc, ...version } = await saveDocWithVersion(old.doc, `${when} 버전으로 되돌림`);
    revalidatePath("/write");
    return { ok: true, doc, version };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** 자료의 서지 정보 고치기 (참고문헌·각주에 쓰임) */
export async function updateSourceBib(id: string, bib: Bib): Promise<Result> {
  try {
    const source = await getSource(id);
    if (!source) return { ok: false, error: "자료를 찾을 수 없어요." };
    const clean = Object.fromEntries(
      Object.entries(bib).map(([k, v]) => [k, String(v ?? "").trim().slice(0, 300)])
    ) as Bib;
    if (!["article", "book", "web"].includes(clean.kind)) clean.kind = "web";
    await saveSource({ ...source, bib: clean, updatedAt: new Date().toISOString() });
    revalidatePath(`/sources/${id}`);
    revalidatePath("/write");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
