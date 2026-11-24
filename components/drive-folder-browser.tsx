"use client";

import { useEffect, useState } from "react";
import { ChevronRight, File, Folder, FolderDown, FolderUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ‘폴더 통째로 가져오기’ 의 폴더 고르기 창.
// 구글 선택 창(Picker)은 드라이브의 모든 폴더를 한 줄로 늘어놓아서, 대신 Drive API 로 ‘논문작업실’ 부터 한 단계씩 들어가게 한다.
// 파일은 흐리게만 보여 준다 (폴더가 비었는지 알 수 있게, 고를 수는 없음).

const FOLDER = "application/vnd.google-apps.folder";
const START_FOLDER = "논문작업실";

export type PickedFolder = { id: string; name: string };
type Crumb = { id: string; name: string };
type Entry = { id: string; name: string; mimeType: string };

export class DriveScopeError extends Error {}

async function drive(params: Record<string, string>, token: string) {
  const q = new URLSearchParams({ supportsAllDrives: "true", includeItemsFromAllDrives: "true", ...params });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${q}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 || res.status === 403) throw new DriveScopeError("scope");
  if (!res.ok) throw new Error(`드라이브 폴더를 읽지 못했어요 (${res.status})`);
  return (await res.json()) as { files?: Entry[]; nextPageToken?: string };
}

/** 내 드라이브 맨 위의 ‘논문작업실’ 폴더 (없으면 null → 내 드라이브부터) */
async function findStart(token: string): Promise<Crumb | null> {
  const r = await drive(
    { q: `name = '${START_FOLDER}' and mimeType = '${FOLDER}' and 'root' in parents and trashed = false`, fields: "files(id, name)", pageSize: "5" },
    token
  );
  const f = r.files?.[0];
  return f ? { id: f.id, name: f.name } : null;
}

async function children(id: string, token: string): Promise<{ folders: Entry[]; files: Entry[]; more: boolean }> {
  const r = await drive(
    { q: `'${id}' in parents and trashed = false`, fields: "nextPageToken, files(id, name, mimeType)", orderBy: "folder,name", pageSize: "1000" },
    token
  );
  const all = r.files ?? [];
  return { folders: all.filter((f) => f.mimeType === FOLDER), files: all.filter((f) => f.mimeType !== FOLDER), more: !!r.nextPageToken };
}

export function DriveFolderBrowser({
  token,
  onPick,
  onCancel,
  onError,
}: {
  /** 있으면 창이 열린다 */
  token: string | null;
  onPick: (f: PickedFolder) => void;
  onCancel: () => void;
  onError: (e: unknown) => void;
}) {
  const [trail, setTrail] = useState<Crumb[]>([]);
  const [list, setList] = useState<{ folders: Entry[]; files: Entry[]; more: boolean } | null>(null);
  // 창을 열 때마다 새로 만들어진다(부모가 key 로) → 처음엔 읽는 중
  const [loading, setLoading] = useState(true);

  // 창이 열리면 ‘논문작업실’ 에서 시작
  useEffect(() => {
    if (!token) return;
    let alive = true;
    findStart(token)
      .then(async (start) => {
        const t: Crumb[] = [{ id: "root", name: "내 드라이브" }, ...(start ? [start] : [])];
        const l = await children(t.at(-1)!.id, token);
        if (!alive) return;
        setTrail(t);
        setList(l);
      })
      .catch((e) => alive && onError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // onError 는 부모가 매번 새로 만들어도 다시 읽을 필요가 없다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function go(next: Crumb[]) {
    if (!token) return;
    setLoading(true);
    try {
      const l = await children(next.at(-1)!.id, token);
      setTrail(next);
      setList(l);
    } catch (e) {
      onError(e);
    } finally {
      setLoading(false);
    }
  }

  const here = trail.at(-1);
  const atRoot = here?.id === "root";
  return (
    <Dialog open={!!token} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>통째로 가져올 폴더 고르기</DialogTitle>
          <DialogDescription>
            폴더를 눌러 한 단계씩 들어가고, 가져올 폴더 안에서 아래 버튼을 눌러요. 하위 폴더까지 모두 가져와요. 흐린 글자는 그
            폴더에 든 파일이에요.
          </DialogDescription>
        </DialogHeader>

        <nav className="flex flex-wrap items-center gap-1 text-xs" aria-label="지금 위치">
          {trail.map((c, i) => (
            <span key={c.id} className="inline-flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3 text-muted-foreground" />}
              <button
                type="button"
                disabled={loading || i === trail.length - 1}
                className="underline-offset-2 hover:underline disabled:font-semibold disabled:no-underline"
                onClick={() => go(trail.slice(0, i + 1))}
              >
                {c.name}
              </button>
            </span>
          ))}
        </nav>

        <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border text-sm" aria-busy={loading}>
          {trail.length > 1 && (
            <li>
              <button
                type="button"
                disabled={loading}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-muted-foreground hover:bg-accent/50"
                onClick={() => go(trail.slice(0, -1))}
              >
                <FolderUp className="size-4" /> 위 폴더로
              </button>
            </li>
          )}
          {!list && (
            <li className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 드라이브 폴더를 읽는 중…
            </li>
          )}
          {list?.folders.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                disabled={loading}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/50"
                onClick={() => go([...trail, { id: f.id, name: f.name }])}
              >
                <Folder className="size-4 shrink-0 text-gold" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            </li>
          ))}
          {list?.files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground/70">
              <File className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
            </li>
          ))}
          {list && !list.folders.length && !list.files.length && (
            <li className="px-3 py-4 text-center text-xs text-muted-foreground">빈 폴더예요.</li>
          )}
          {list?.more && <li className="px-3 py-1.5 text-center text-xs text-muted-foreground">항목이 1,000개가 넘어 일부만 보여요.</li>}
        </ul>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {list ? `폴더 ${list.folders.length}개 · 파일 ${list.files.length}개` : " "}
            {loading && list && <Loader2 className="ml-1 inline size-3 animate-spin" />}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel}>
              취소
            </Button>
            <Button disabled={loading || !here || atRoot} onClick={() => here && onPick(here)}>
              <FolderDown />
              {here && !atRoot ? `‘${here.name}’ 가져오기` : "폴더를 골라 주세요"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
