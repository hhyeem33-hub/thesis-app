"use server";

import { guestBlock } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { fetchLink } from "@/lib/link-import";
import { addSources, listDriveFolder, readDriveFiles, scanObsidian } from "@/lib/source-intake";
import { getSources } from "@/lib/sources";
import { getProjects } from "@/lib/store";
import { createProject } from "@/app/actions";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** 옵시디언 Clippings 에서 아직 라이브러리에 없는 노트 세기 (읽기만) */
export async function previewObsidian(): Promise<Result<{ vault: string; total: number; fresh: { title: string }[] }>> {
  try {
    const { vault, items } = await scanObsidian();
    const have = new Set((await getSources()).map((s) => s.id));
    const fresh = items.filter((i) => i.id && !have.has(i.id));
    return { ok: true, vault, total: items.length, fresh: fresh.map((f) => ({ title: f.title })) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 새 노트만 라이브러리에 넣기 (보관함 원본은 읽기만) */
export async function importObsidian(projectId: string): Promise<Result<{ added: string[]; skipped: string[] }>> {
  // 둘러보기 모드에서는 바꾸거나 비용이 드는 일을 막는다
  const blocked = await guestBlock();
  if (blocked) return blocked;
  try {
    const { items } = await scanObsidian();
    const have = new Set((await getSources()).map((s) => s.id));
    const project = (await getProjects()).find((p) => p.id === projectId) ?? null;
    const { added, skipped } = await addSources(items.filter((i) => i.id && !have.has(i.id)), project?.id ?? null);
    revalidatePath("/sources");
    revalidatePath("/dashboard");
    return { ok: true, added, skipped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 링크(유튜브·웹)로 자료 하나 가져오기 */
export async function importLink(
  url: string,
  projectId: string
): Promise<Result<{ added: string[]; skipped: string[]; title: string; note?: string }>> {
  const blocked = await guestBlock();
  if (blocked) return blocked;
  try {
    const item = await fetchLink(url);
    const project = (await getProjects()).find((p) => p.id === projectId) ?? null;
    const { added, skipped } = await addSources([item], project?.id ?? null);
    revalidatePath("/sources");
    revalidatePath("/dashboard");
    return { ok: true, added, skipped, title: item.title, note: item.note };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 내 컴퓨터의 구글 드라이브 폴더 둘러보기 (읽기만): PDF·Word·한글 파일과 하위 폴더 */
export async function browseDriveFolder(
  rel: string
): Promise<Result<{ root: string; rel: string; folders: string[]; files: { name: string; size: number }[] }>> {
  try {
    return { ok: true, ...(await listDriveFolder(rel)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 내 컴퓨터의 구글 드라이브 폴더에서 고른 파일의 글자를 꺼내 자료로 저장 */
export async function importDriveFiles(
  rel: string,
  names: string[],
  projectId: string
): Promise<Result<{ added: string[]; skipped: string[]; failed: { name: string; error: string }[] }>> {
  const blocked = await guestBlock();
  if (blocked) return blocked;
  try {
    const { items, failed } = await readDriveFiles(rel, names.slice(0, 30));
    const project = (await getProjects()).find((p) => p.id === projectId) ?? null;
    const { added, skipped } = await addSources(items, project?.id ?? null);
    revalidatePath("/sources");
    revalidatePath("/dashboard");
    return { ok: true, added, skipped, failed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 폴더 통째로 가져오기 전에: 이 드라이브 파일 주소들 중 이미 자료로 있는 것 (다시 받지 않게) */
export async function existingDriveOrigins(urls: string[]): Promise<string[]> {
  const have = new Set((await getSources()).map((s) => s.origin));
  return urls.filter((u) => have.has(u));
}

/** 메인 폴더 이름과 같은 프로젝트를 찾고, 없으면 새로 만든다 (만든 프로젝트 id) */
export async function ensureProjectNamed(name: string): Promise<Result<{ id: string; created: boolean }>> {
  const blocked = await guestBlock();
  if (blocked) return blocked;
  const clean = name.trim().slice(0, 60);
  const found = (await getProjects()).find((p) => p.name === clean);
  if (found) return { ok: true, id: found.id, created: false };
  const r = await createProject({ name: clean, description: "구글 드라이브 폴더에서 가져온 프로젝트" });
  if (!r.ok) return { ok: false, error: `‘${clean}’ 프로젝트를 만들지 못했어요: ${r.error}` };
  const made = (await getProjects()).find((p) => p.name === clean);
  return made ? { ok: true, id: made.id, created: true } : { ok: false, error: "프로젝트를 만들었지만 찾지 못했어요." };
}
