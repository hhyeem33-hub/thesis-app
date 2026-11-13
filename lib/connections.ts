import path from "path";
import { createClient } from "@supabase/supabase-js";
import { aiErrorMessage, getAiKeyStatus, testConnection } from "./ai";
import { currentUser } from "./auth";
import { dbLastImports, isObsidianId, ONLINE } from "./db";
import { googleConfig } from "./google";
import { getKciKeyStatus, searchKciApi } from "./kci";
import { getSources } from "./sources";
import { getSettings, isDirectory } from "./store";

// 연결 상태: 옵시디언 · 구글 드라이브 · KCI · AI 4개를 실제로 확인한다 (+ 연결 설정 화면에는 슈파베이스도)
// 초록(ok) = 연결됨, 회색(off) = 연결 안 됨 + 이유

export type CheckId = "obsidian" | "drive" | "kci" | "claude" | "supabase";

export type CheckResult = {
  id: CheckId;
  /** 사이드바에 쓰는 짧은 이름 */
  short: string;
  name: string;
  state: "ok" | "off";
  summary: string;
  /** 이유·경로 같은 자세한 설명 */
  detail?: string;
  fixHref?: string;
};

/** 오래 걸리면 실패로 (네트워크가 막혔을 때 화면이 멈추지 않게) */
function withTimeout<T>(p: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${ms / 1000}초 안에 응답이 없어요`)), ms))]);
}
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const day = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

/** 옵시디언·KCI 자료를 마지막으로 가져온 날짜 (온라인은 슈파베이스, 내 컴퓨터는 data/sources.json) */
async function lastImports() {
  if (ONLINE) return dbLastImports();
  let obsidian: string | null = null;
  let kci: string | null = null;
  for (const s of await getSources()) {
    if (isObsidianId(s.id) && (!obsidian || s.createdAt > obsidian)) obsidian = s.createdAt;
    if (s.bib?.kciId && (!kci || s.createdAt > kci)) kci = s.createdAt;
  }
  return { obsidian, kci };
}

async function checkObsidian(last: string | null): Promise<CheckResult> {
  const base = { id: "obsidian" as const, short: "Obsidian", name: "옵시디언 보관함", fixHref: "/settings" };
  const lastText = last ? `마지막 가져오기 ${day(last)}` : "아직 가져온 적 없음";
  if (ONLINE)
    return last
      ? { ...base, state: "ok", summary: `내 컴퓨터에서 연결됨 · ${lastText}`, detail: "보관함은 내 컴퓨터에 있어요. 내 컴퓨터에서 가져온 자료가 온라인에 올라와 있어요." }
      : { ...base, state: "off", summary: "연결 안 됨 · 아직 가져온 적 없음", detail: "옵시디언 가져오기는 내 컴퓨터에서 앱을 실행할 때만 돼요." };
  const { obsidianVaultPath: vault } = await getSettings();
  if (!vault) return { ...base, state: "off", summary: "연결 안 됨 · 경로가 없어요", detail: "설정에서 보관함 경로를 넣어 주세요." };
  if (!(await isDirectory(vault))) return { ...base, state: "off", summary: "연결 안 됨 · 폴더를 찾지 못했어요", detail: vault };
  if (!(await isDirectory(path.join(vault, ".obsidian"))))
    return { ...base, state: "off", summary: "연결 안 됨 · 옵시디언 보관함이 아니에요", detail: `${vault} 안에 .obsidian 폴더가 없어요.` };
  return { ...base, state: "ok", summary: `연결됨 · ${lastText}`, detail: vault };
}

async function checkDrive(): Promise<CheckResult> {
  const base = { id: "drive" as const, short: "Drive", name: "구글 드라이브", fixHref: "/settings" };
  if (ONLINE) {
    // 실제 연결(구글 로그인)은 브라우저에서 확인한다 → components/google-status.tsx 가 초록으로 바꿈
    return googleConfig().ready
      ? { ...base, state: "off", summary: "연결 안 됨 · 구글 로그인 전", detail: "자료 수집 → Google Drive 탭에서 ‘구글 드라이브 연결’을 누르면 연결돼요.", fixHref: "/sources/new?tab=drive" }
      : { ...base, state: "off", summary: "연결 안 됨 · 구글 클라우드 설정 전", detail: "버셀 환경 변수 NEXT_PUBLIC_GOOGLE_CLIENT_ID·NEXT_PUBLIC_GOOGLE_API_KEY·NEXT_PUBLIC_GOOGLE_APP_ID 가 필요해요. (README의 ‘구글 드라이브 연결’ 참고)" };
  }
  const { driveRootPath: root } = await getSettings();
  if (!root) return { ...base, state: "off", summary: "연결 안 됨 · 경로가 없어요", detail: "설정에서 내 드라이브 경로를 넣어 주세요." };
  if (!(await isDirectory(root)))
    return { ...base, state: "off", summary: "연결 안 됨 · 폴더를 찾지 못했어요", detail: `${root} — 구글 드라이브 데스크톱 앱이 켜져 있는지 확인해 주세요.` };
  return { ...base, state: "ok", summary: "연결됨 · 데스크톱 앱 폴더", detail: root };
}

async function checkKci(last: string | null): Promise<CheckResult> {
  const base = { id: "kci" as const, short: "KCI", name: "KCI (한국학술지인용색인)", fixHref: "/settings" };
  const lastText = last ? `마지막 가져오기 ${day(last)}` : "아직 가져온 적 없음";
  if (ONLINE)
    return last
      ? { ...base, state: "ok", summary: `내 컴퓨터에서 연결됨 · ${lastText}`, detail: "KCI API는 신청한 IP(내 컴퓨터)에서만 돼요. 온라인에서는 ‘새 탭 검색 + 주소 붙여넣기’로 가져와요." }
      : { ...base, state: "off", summary: "연결 안 됨 · 아직 가져온 적 없음", detail: "온라인에서는 KCI 검색 탭의 ‘새 탭 검색 + 주소 붙여넣기’로 가져올 수 있어요." };
  const status = await getKciKeyStatus();
  if (status.source === "none")
    return { ...base, state: "off", summary: "연결 안 됨 · API 키가 없어요", detail: "설정 → KCI 연결에 키를 넣어 주세요. 키가 없어도 ‘새 탭 검색 + 주소 붙여넣기’는 돼요." };
  try {
    const r = await withTimeout(searchKciApi("수면"), 10_000);
    return { ...base, state: "ok", summary: `연결됨 · ${lastText}`, detail: `API 키 …${status.last4} · 시험 검색 ‘수면’ ${r.total.toLocaleString()}건` };
  } catch (e) {
    return { ...base, state: "off", summary: "연결 안 됨 · 검색 실패", detail: msg(e) };
  }
}

async function checkClaude(): Promise<CheckResult> {
  const base = { id: "claude" as const, short: "AI", name: "AI (Claude)", fixHref: "/settings" };
  const status = await getAiKeyStatus();
  if (status.source === "none")
    return {
      ...base,
      state: "off",
      summary: ONLINE ? "연결 안 됨 · 규칙 기반으로 판단 중" : "연결 안 됨 · API 키가 없어요",
      detail: "설정 → AI 연결에서 Claude API 키를 넣어 주세요.",
    };
  try {
    const name = await withTimeout(testConnection());
    return { ...base, state: "ok", summary: `연결됨 · ${name}`, detail: `키 끝자리 …${status.last4} (${status.source === "env" ? "환경 변수" : "설정에 저장"})` };
  } catch (e) {
    return { ...base, state: "off", summary: "연결 안 됨 · 시험 실패", detail: aiErrorMessage(e) };
  }
}

async function checkSupabase(): Promise<CheckResult> {
  const base = { id: "supabase" as const, short: "DB", name: "슈파베이스 (온라인 저장소)" };
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const real = (v?: string) => !!v && !v.includes("[SENSITIVE]") && !v.includes("여기에");
  if (!real(url) || !real(key))
    return ONLINE
      ? { ...base, state: "off", summary: "연결 안 됨 · 환경 변수가 없어요", detail: "버셀에서 슈파베이스 연결(Storage)을 확인해 주세요." }
      : { ...base, state: "off", summary: "내 컴퓨터는 data 폴더에 저장해요", detail: "온라인으로 자료를 올리는 db:push 를 쓰려면 .env.local 에 SUPABASE_URL·SUPABASE_SECRET_KEY 를 넣어요 (선택)." };
  try {
    const db = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
    const uid = ONLINE ? (await currentUser())?.id : null;
    let q = db.from("sources").select("id", { count: "exact", head: true });
    if (uid) q = q.eq("user_id", uid);
    const { count, error } = await withTimeout(Promise.resolve(q));
    if (error) throw new Error(error.message);
    return { ...base, state: "ok", summary: `연결됨 · ${uid ? "내" : "온라인"} 자료 ${count ?? 0}개` };
  } catch (e) {
    return { ...base, state: "off", summary: "연결 안 됨", detail: msg(e) };
  }
}

/** 옵시디언 · 구글 드라이브 · KCI · AI */
async function runFour(): Promise<CheckResult[]> {
  const last = await lastImports().catch(() => ({ obsidian: null, kci: null }));
  return Promise.all([checkObsidian(last.obsidian), checkDrive(), checkKci(last.kci), checkClaude()]);
}

// 사이드바는 화면을 옮길 때마다 그려지므로, 실제 확인 결과를 5분 동안 기억한다 (계정마다 따로)
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; results: CheckResult[] }>();
const cacheKey = async () => (ONLINE ? ((await currentUser())?.id ?? "guest") : "local");

export async function checkFour(fresh = false): Promise<CheckResult[]> {
  const key = await cacheKey();
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.results;
  const results = await runFour();
  cache.set(key, { at: Date.now(), results });
  return results;
}

/** 연결 설정 화면: 4개(새로 확인) + 슈파베이스 */
export async function checkAll(): Promise<{ main: CheckResult[]; extra: CheckResult[] }> {
  const [main, supabase] = await Promise.all([checkFour(true), checkSupabase()]);
  return { main, extra: [supabase] };
}
