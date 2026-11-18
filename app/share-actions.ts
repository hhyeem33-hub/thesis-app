"use server";

import { promises as fs } from "fs";
import path from "path";
import { headers } from "next/headers";
import { guestBlock } from "@/lib/auth";
import { ONLINE } from "@/lib/online";
import { createShare, findShare, removeShare, resolveShare, type PublicItem, type ShareKind } from "@/lib/shares";
import { getSettings, isDirectory } from "@/lib/store";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function origin() {
  const h = await headers();
  return h.get("origin") || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

/** 지금 공유 상태 (켜져 있으면 링크) */
export async function shareStatus(kind: ShareKind, id: string): Promise<Result<{ url: string | null }>> {
  try {
    const s = await findShare(kind, id);
    return { ok: true, url: s ? `${await origin()}/share/${s.token}` : null };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

/** "공유해도 되는 자료"로 표시 → 읽기 전용 링크 */
export async function enableShare(kind: ShareKind, id: string): Promise<Result<{ url: string }>> {
  const blocked = await guestBlock();
  if (blocked) return blocked;
  try {
    const s = await createShare(kind, id);
    return { ok: true, url: `${await origin()}/share/${s.token}` };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

/** 공유 끄기 (예전 링크는 더 이상 열리지 않음) */
export async function disableShare(kind: ShareKind, id: string): Promise<Result> {
  const blocked = await guestBlock();
  if (blocked) return blocked;
  try {
    await removeShare(kind, id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

const safe = (t: string) => t.replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80).replace(/[. ]+$/, "") || "공유 자료";

function itemMd(it: PublicItem) {
  return [
    `## ${it.title}`,
    "",
    `- **서지**: ${it.reference}`,
    it.origin ? `- **출처**: ${it.origin}` : null,
    it.summary ? `- **AI 요약**: ${it.summary}` : null,
    "",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/**
 * 드라이브 공유 폴더로 보내기 (내 컴퓨터 전용): <내 드라이브>\논문작업실\공유\<이름>.md
 * 공유 링크와 같은 내용(제목·출처·서지·AI 요약)만. 같은 이름 파일이 있으면 덮어쓰지 않고 _2, _3 … 을 붙인다.
 */
export async function sendToDriveShare(kind: ShareKind, id: string): Promise<Result<{ file: string }>> {
  const blocked = await guestBlock();
  if (blocked) return blocked;
  if (ONLINE) return { ok: false, error: "드라이브 공유 폴더로 보내기는 내 컴퓨터에서 앱을 실행할 때만 돼요." };
  try {
    const s = await createShare(kind, id); // 공유로 표시된 것만 보낸다
    const data = await resolveShare(s.token);
    if (!data) return { ok: false, error: "공유할 내용을 찾지 못했어요." };
    const root = (await getSettings()).driveRootPath;
    if (!root || !(await isDirectory(root))) return { ok: false, error: "구글 드라이브 폴더를 찾지 못했어요. 설정의 경로를 확인해 주세요." };
    const dir = path.join(root, "논문작업실", "공유");
    await fs.mkdir(dir, { recursive: true });
    const title = data.kind === "source" ? data.item.title : data.name;
    const body =
      data.kind === "source"
        ? `# ${data.item.title}\n\n${itemMd(data.item)}`
        : `# ${data.name} (공유 자료 ${data.items.length}개)\n\n${data.items.map(itemMd).join("\n")}`;
    const text = `${body}\n---\n논문작업실에서 공유 · 읽기 전용 링크: ${await origin()}/share/${s.token}\n`;
    for (let n = 1; n < 100; n++) {
      const file = path.join(dir, `${safe(title)}${n > 1 ? `_${n}` : ""}.md`);
      try {
        await fs.writeFile(file, text, { encoding: "utf8", flag: "wx" });
        return { ok: true, file };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      }
    }
    return { ok: false, error: "같은 이름 파일이 너무 많아요." };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}
