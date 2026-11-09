import path from "path";
import { createClient } from "@supabase/supabase-js";
import { aiErrorMessage, getAiKeyStatus, testConnection } from "./ai";
import { ONLINE } from "./db";
import { getKciKeyStatus, searchKciApi } from "./kci";
import { getSettings, isDirectory } from "./store";

// 연결 설정 화면: 각 연결을 실제로 확인하고 초록(ok)/빨강(fail)/회색(off: 해당 없음·선택) 으로 알려 준다

export type CheckResult = {
  id: "obsidian" | "drive" | "supabase" | "claude" | "kci";
  name: string;
  state: "ok" | "fail" | "off";
  summary: string;
  /** 실패·해당 없음일 때 이유와 고치는 방법 */
  detail?: string;
  fixHref?: string;
};

/** 오래 걸리면 실패로 (네트워크가 막혔을 때 화면이 멈추지 않게) */
function withTimeout<T>(p: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${ms / 1000}초 안에 응답이 없어요`)), ms))]);
}
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function checkObsidian(): Promise<CheckResult> {
  const base = { id: "obsidian" as const, name: "옵시디언 보관함", fixHref: "/settings" };
  if (ONLINE) return { ...base, state: "off", summary: "내 컴퓨터에서만 써요", detail: "온라인(버셀)에는 보관함이 없어요." };
  const { obsidianVaultPath: vault } = await getSettings();
  if (!vault) return { ...base, state: "fail", summary: "경로가 없어요", detail: "설정에서 보관함 경로를 넣어 주세요." };
  if (!(await isDirectory(vault))) return { ...base, state: "fail", summary: "폴더를 찾지 못했어요", detail: vault };
  if (!(await isDirectory(path.join(vault, ".obsidian"))))
    return { ...base, state: "fail", summary: "옵시디언 보관함이 아니에요", detail: `${vault} 안에 .obsidian 폴더가 없어요.` };
  return { ...base, state: "ok", summary: "연결됨", detail: vault };
}

async function checkDrive(): Promise<CheckResult> {
  const base = { id: "drive" as const, name: "구글 드라이브 폴더", fixHref: "/settings" };
  if (ONLINE) return { ...base, state: "off", summary: "내 컴퓨터에서만 써요", detail: "구글 드라이브 데스크톱 앱 폴더는 내 컴퓨터에 있어요." };
  const { driveRootPath: root } = await getSettings();
  if (!root) return { ...base, state: "fail", summary: "경로가 없어요", detail: "설정에서 내 드라이브 경로를 넣어 주세요." };
  if (!(await isDirectory(root)))
    return { ...base, state: "fail", summary: "폴더를 찾지 못했어요", detail: `${root} — 구글 드라이브 데스크톱 앱이 켜져 있는지 확인해 주세요.` };
  return { ...base, state: "ok", summary: "연결됨", detail: root };
}

async function checkSupabase(): Promise<CheckResult> {
  const base = { id: "supabase" as const, name: "슈파베이스 (온라인 저장소)" };
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const real = (v?: string) => !!v && !v.includes("[SENSITIVE]") && !v.includes("여기에");
  if (!real(url) || !real(key))
    return ONLINE
      ? { ...base, state: "fail", summary: "환경 변수가 없어요", detail: "버셀에서 슈파베이스 연결(Storage)을 확인해 주세요." }
      : {
          ...base,
          state: "off",
          summary: "내 컴퓨터는 data 폴더에 저장해요",
          detail: "온라인으로 자료를 올리는 db:push 를 쓰려면 .env.local 에 SUPABASE_URL·SUPABASE_SECRET_KEY 를 넣어요 (선택).",
        };
  try {
    const db = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { count, error } = await withTimeout(Promise.resolve(db.from("sources").select("id", { count: "exact", head: true })));
    if (error) throw new Error(error.message);
    return {
      ...base,
      state: "ok",
      summary: `연결됨 · 온라인 자료 ${count ?? 0}개`,
      detail: ONLINE ? "온라인(버셀) 저장소로 쓰는 중" : "db:push 로 내 컴퓨터 자료를 올릴 수 있어요",
    };
  } catch (e) {
    return { ...base, state: "fail", summary: "연결 실패", detail: `${msg(e)} — 키가 맞는지, sources 표가 있는지 확인해 주세요.` };
  }
}

async function checkClaude(): Promise<CheckResult> {
  const base = { id: "claude" as const, name: "Claude API (AI 판단·초안)", fixHref: "/settings" };
  const status = await getAiKeyStatus();
  if (status.source === "none")
    return { ...base, state: "fail", summary: "API 키가 없어요", detail: "설정 → AI 연결에서 키를 넣어 주세요. (버셀은 환경 변수 ANTHROPIC_API_KEY)" };
  try {
    const name = await withTimeout(testConnection());
    return { ...base, state: "ok", summary: `연결됨 · ${name}`, detail: `키 끝자리 …${status.last4} (${status.source === "env" ? "환경 변수" : "설정에 저장"})` };
  } catch (e) {
    return { ...base, state: "fail", summary: "연결 실패", detail: aiErrorMessage(e) };
  }
}

async function checkKci(): Promise<CheckResult> {
  const base = { id: "kci" as const, name: "KCI Open API", fixHref: "/settings" };
  if (ONLINE)
    return { ...base, state: "off", summary: "온라인은 키 없는 방식", detail: "KCI API는 신청한 IP에서만 돼서, 온라인에서는 ‘새 탭 검색 + 주소 붙여넣기’로 써요." };
  const status = await getKciKeyStatus();
  if (status.source === "none")
    return { ...base, state: "fail", summary: "키가 없어요 (승인 대기)", detail: "키가 없어도 ‘KCI 검색’에서 새 탭 검색 + 주소 붙여넣기로 쓸 수 있어요. 승인되면 설정 → KCI 연결에 넣어 주세요." };
  try {
    const r = await withTimeout(searchKciApi("수면"), 10_000);
    return { ...base, state: "ok", summary: `연결됨 · ‘수면’ ${r.total.toLocaleString()}건`, detail: `키 끝자리 …${status.last4}` };
  } catch (e) {
    return { ...base, state: "fail", summary: "연결 실패", detail: msg(e) };
  }
}

export async function checkAll(): Promise<CheckResult[]> {
  return Promise.all([checkObsidian(), checkDrive(), checkSupabase(), checkClaude(), checkKci()]);
}
