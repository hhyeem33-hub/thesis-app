import { promises as fs } from "fs";
import path from "path";
import { requireUserId, requireWriter } from "./auth";
import { db } from "./db";
import { ONLINE } from "./online";

// 작은 설정 저장소 (공유 링크, 논문 진행 칸반 단계 등): 키 → 값(JSON)
// 온라인은 슈파베이스 app_state 표(사람마다 따로, supabase/app-state.sql), 내 컴퓨터는 data/app-state.json

const FILE = path.join(process.cwd(), "data", "app-state.json");

async function readLocal(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}
async function writeLocal(all: Record<string, unknown>) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(all, null, 2) + "\n", "utf8");
}

function friendly(message: string) {
  return /app_state/.test(message) && /does not exist|schema cache/.test(message)
    ? "슈파베이스에 app_state 표가 아직 없어요. SQL Editor에서 supabase/app-state.sql 을 Run해 주세요."
    : `슈파베이스 오류: ${message}`;
}

export async function getState<T>(key: string): Promise<T | null> {
  if (!ONLINE) return ((await readLocal())[key] as T) ?? null;
  const uid = await requireUserId();
  const { data, error } = await db().from("app_state").select("value").eq("user_id", uid).eq("key", key).maybeSingle();
  if (error) throw new Error(friendly(error.message));
  return (data?.value as T) ?? null;
}

/** 이 사람의 키 중 앞부분이 같은 것 모두 (예: "share:") */
export async function listState<T>(prefix: string): Promise<{ key: string; value: T }[]> {
  if (!ONLINE)
    return Object.entries(await readLocal())
      .filter(([k]) => k.startsWith(prefix))
      .map(([key, value]) => ({ key, value: value as T }));
  const uid = await requireUserId();
  const { data, error } = await db().from("app_state").select("key, value").eq("user_id", uid).like("key", `${prefix}%`);
  if (error) throw new Error(friendly(error.message));
  return (data ?? []).map((r) => ({ key: r.key as string, value: r.value as T }));
}

export async function setState(key: string, value: unknown) {
  if (!ONLINE) {
    const all = await readLocal();
    all[key] = value;
    return writeLocal(all);
  }
  const uid = await requireWriter();
  const { error } = await db().from("app_state").upsert({ user_id: uid, key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(friendly(error.message));
}

export async function deleteState(key: string) {
  if (!ONLINE) {
    const all = await readLocal();
    delete all[key];
    return writeLocal(all);
  }
  const uid = await requireWriter();
  const { error } = await db().from("app_state").delete().eq("user_id", uid).eq("key", key);
  if (error) throw new Error(friendly(error.message));
}

/** 공유 화면용: 로그인과 상관없이 키 하나를 찾는다 (누구 것인지 함께). 서버에서만 부른다 */
export async function findStateAnyUser<T>(key: string): Promise<{ userId: string | null; value: T } | null> {
  if (!ONLINE) {
    const v = (await readLocal())[key];
    return v ? { userId: null, value: v as T } : null;
  }
  const { data, error } = await db().from("app_state").select("user_id, value").eq("key", key).maybeSingle();
  if (error) throw new Error(friendly(error.message));
  return data ? { userId: data.user_id as string, value: data.value as T } : null;
}
