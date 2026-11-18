"use server";

import { revalidatePath } from "next/cache";
import { setState } from "@/lib/app-state";
import { guestBlock } from "@/lib/auth";
import { getStages, STAGE_KEY, STAGES, type Stage } from "@/lib/progress";
import { getProjects } from "@/lib/store";

export async function setProjectStage(projectId: string, stage: Stage): Promise<{ ok: true } | { ok: false; error: string }> {
  const blocked = await guestBlock();
  if (blocked) return blocked;
  if (!STAGES.includes(stage)) return { ok: false, error: "알 수 없는 단계예요." };
  try {
    if (!(await getProjects()).some((p) => p.id === projectId)) return { ok: false, error: "프로젝트를 찾을 수 없어요." };
    const all = await getStages();
    all[projectId] = stage;
    await setState(STAGE_KEY, all);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
