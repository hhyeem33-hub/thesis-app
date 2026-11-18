import { getState } from "./app-state";

// 논문 진행 칸반: 프로젝트마다 단계 (자료 모으기 → 초안 → 수정 → 출력). 작은 저장소(app_state)의 "progress" 키
export const STAGE_KEY = "progress";
export type Stage = "collect" | "draft" | "revise" | "output";
export const STAGES: Stage[] = ["collect", "draft", "revise", "output"];

export async function getStages(): Promise<Record<string, Stage>> {
  return (await getState<Record<string, Stage>>(STAGE_KEY).catch(() => null)) ?? {};
}
