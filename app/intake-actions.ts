"use server";

import { revalidatePath } from "next/cache";
import { addSources, scanObsidian } from "@/lib/source-intake";
import { getSources } from "@/lib/sources";
import { getProjects } from "@/lib/store";

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
