import { randomBytes } from "crypto";
import { deleteState, findStateAnyUser, listState, setState } from "./app-state";
import { formatReference } from "./bib";
import { db } from "./db";
import { ONLINE } from "./online";
import { getSource, getSources } from "./sources";
import { getProjects } from "./store";
import type { Bib, Classification, Source } from "./types";

// 읽기 전용 공유 링크: "공유해도 되는 자료"로 표시한 자료·프로젝트만 /share/<토큰> 으로 볼 수 있다.
// 링크를 받은 사람에게는 제목·출처·서지·AI 요약만 보여 준다 (본문·메모·결정은 보이지 않음). 공유 끄기 = 토큰 지우기.

export type ShareKind = "source" | "project";
export type ShareRecord = { kind: ShareKind; id: string; title: string; createdAt: string };
export type PublicItem = { title: string; type: Source["type"]; origin: string; reference: string; summary: string; year: string };
export type PublicShare =
  | { kind: "source"; item: PublicItem; sharedAt: string }
  | { kind: "project"; name: string; items: PublicItem[]; sharedAt: string };

const KEY = (token: string) => `share:${token}`;
const isToken = (t: string) => /^[A-Za-z0-9_-]{16,64}$/.test(t);

/** 이 자료·프로젝트의 공유 링크 (없으면 null) */
export async function findShare(kind: ShareKind, id: string) {
  const all = await listState<ShareRecord>("share:");
  const hit = all.find((s) => s.value.kind === kind && s.value.id === id);
  return hit ? { token: hit.key.slice("share:".length), ...hit.value } : null;
}

export async function createShare(kind: ShareKind, id: string) {
  const old = await findShare(kind, id);
  if (old) return old;
  // 내 것인지 확인 (온라인은 getSource·getProjects 가 로그인한 사람 것만 준다)
  let title = "";
  if (kind === "source") title = (await getSource(id))?.title ?? "";
  else title = (await getProjects()).find((p) => p.id === id)?.name ?? "";
  if (!title) throw new Error(kind === "source" ? "자료를 찾을 수 없어요." : "프로젝트를 찾을 수 없어요.");
  const token = randomBytes(18).toString("base64url");
  const record: ShareRecord = { kind, id, title, createdAt: new Date().toISOString() };
  await setState(KEY(token), record);
  return { token, ...record };
}

export async function removeShare(kind: ShareKind, id: string) {
  const old = await findShare(kind, id);
  if (old) await deleteState(KEY(old.token));
}

export async function listShares() {
  return (await listState<ShareRecord>("share:")).map((s) => ({ token: s.key.slice("share:".length), ...s.value }));
}

// ── 링크를 연 사람에게 보여 줄 것 (로그인 없이) ─────────────────────────────

type Row = { id: string; title: string; type: Source["type"]; origin: string; bib: Bib | null; classification: Classification | null; project_id: string | null };

function toPublic(s: Pick<Source, "title" | "type" | "origin"> & { bib?: Bib | null; classification?: Classification | null }): PublicItem {
  return {
    title: s.title,
    type: s.type,
    origin: /^https?:\/\//.test(s.origin) ? s.origin : "",
    reference: formatReference(s),
    summary: s.classification?.summary ?? "",
    year: s.bib?.year ?? "",
  };
}

export async function resolveShare(token: string): Promise<PublicShare | null> {
  if (!isToken(token)) return null;
  const found = await findStateAnyUser<ShareRecord>(KEY(token));
  if (!found) return null;
  const { value: r, userId } = found;
  const cols = "id, title, type, origin, bib, classification, project_id";

  if (!ONLINE) {
    const all = await getSources();
    if (r.kind === "source") {
      const s = all.find((x) => x.id === r.id);
      return s ? { kind: "source", item: toPublic(s), sharedAt: r.createdAt } : null;
    }
    const p = (await getProjects()).find((x) => x.id === r.id);
    if (!p) return null;
    const items = all.filter((s) => s.projectId === p.id && s.classification?.decision?.status !== "excluded").map(toPublic);
    return { kind: "project", name: p.name, items, sharedAt: r.createdAt };
  }

  // 온라인: 공유한 사람(userId)의 것만, 비밀 키로 서버에서 읽는다
  if (!userId) return null;
  if (r.kind === "source") {
    const { data } = await db().from("sources").select(cols).eq("id", r.id).eq("user_id", userId).maybeSingle();
    return data ? { kind: "source", item: toPublic(data as Row), sharedAt: r.createdAt } : null;
  }
  const { data: p } = await db().from("projects").select("id, name").eq("id", r.id).eq("user_id", userId).maybeSingle();
  if (!p) return null;
  const { data: rows } = await db().from("sources").select(cols).eq("project_id", r.id).eq("user_id", userId).limit(1000);
  const items = ((rows ?? []) as Row[]).filter((s) => s.classification?.decision?.status !== "excluded").map(toPublic);
  return { kind: "project", name: p.name as string, items, sharedAt: r.createdAt };
}
