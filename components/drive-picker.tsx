"use client";

import { useEffect, useRef, useState } from "react";
import { Cloud, FolderDown, Loader2, LogOut } from "lucide-react";
import { ensureProjectNamed, existingDriveOrigins } from "@/app/intake-actions";
import { toast } from "sonner";
import { readDriveToken, saveDriveToken, useDriveConnected } from "@/components/google-status";
import { Button } from "@/components/ui/button";
import { DriveFolderBrowser, DriveScopeError, type PickedFolder } from "@/components/drive-folder-browser";
import { DRIVE_EXT, DRIVE_MIME, type GoogleConfig } from "@/lib/google";

// 구글 드라이브 연결 (브라우저에서) — "화면 이동(리다이렉트)" 방식
// 버튼 → 구글 로그인 화면으로 이동 → 허용 → /sources/new 로 돌아옴(#access_token=…) → 바로 파일 선택 창(Picker)
// 팝업을 쓰지 않아서 크롬의 팝업 차단·창 격리(COOP) 때문에 로그인 창이 바로 닫히는 문제가 없다.
// 권한은 drive.readonly — "폴더 통째로 가져오기"에서 고른 폴더 안의 파일 목록을 읽으려면 필요하다 (읽기만, 바꾸지 않음).

const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const FOLDER = "application/vnd.google-apps.folder";
/** 지금 로그인이 어떤 권한으로 받은 것인지 (이 탭에서만) */
const SCOPE_MARK = "gdrive_scope";
/** 폴더 통째로 가져오기 한 번에 다룰 최대 파일 수 */
const MAX_FOLDER_FILES = 500;
const GOOGLE_DOC = "application/vnd.google-apps.document";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** 버셀 서버가 한 번에 받을 수 있는 크기 (요청 4.5MB 제한) */
const MAX_UPLOAD = 4 * 1024 * 1024;
/** 구글에서 돌아올 주소 (구글 클라우드의 '승인된 리디렉션 URI'에 똑같이 넣어야 함) */
export const DRIVE_RETURN_PATH = "/sources/new";
/** 구글로 떠나기 전에 기억해 둘 것 (돌아왔을 때 맞는 요청인지 확인 + 고른 프로젝트) */
const PENDING = "gdrive_oauth_pending";

type PickedDoc = { id: string; name: string; mimeType: string; url?: string; sizeBytes?: number };
type PickerGlobal = {
  picker: {
    DocsView: new (viewId?: unknown) => {
      setMimeTypes(m: string): unknown;
      setIncludeFolders(b: boolean): unknown;
      setMode(m: unknown): unknown;
      setSelectFolderEnabled(b: boolean): unknown;
    };
    ViewId: { DOCS: unknown; FOLDERS: unknown };
    DocsViewMode: { LIST: unknown };
    Feature: { MULTISELECT_ENABLED: unknown };
    Action: { PICKED: string; CANCEL: string };
    PickerBuilder: new () => PickerBuilder;
  };
};
type PickerBuilder = {
  addView(v: unknown): PickerBuilder;
  setOAuthToken(t: string): PickerBuilder;
  setDeveloperKey(k: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setLocale(l: string): PickerBuilder;
  setTitle(t: string): PickerBuilder;
  setOrigin(o: string): PickerBuilder;
  enableFeature(f: unknown): PickerBuilder;
  setCallback(cb: (d: { action: string; docs?: PickedDoc[] }) => void): PickerBuilder;
  build(): { setVisible(v: boolean): void };
};
type Win = Window & {
  google?: PickerGlobal;
  gapi?: { load(name: string, o: { callback: () => void; onerror: () => void }): void };
};

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const old = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (old?.dataset.loaded) return resolve();
    const s = old ?? Object.assign(document.createElement("script"), { src, async: true });
    s.addEventListener("load", () => {
      s.dataset.loaded = "1";
      resolve();
    });
    s.addEventListener("error", () => reject(new Error("script")));
    if (!old) document.head.appendChild(s);
  });
}

/** 파일 선택 창(Picker) 스크립트만 미리 불러온다 (로그인은 화면 이동이라 스크립트가 필요 없음) */
async function loadPicker() {
  await loadScript("https://apis.google.com/js/api.js");
  const w = window as Win;
  await new Promise<void>((resolve, reject) => w.gapi!.load("picker", { callback: resolve, onerror: () => reject(new Error("picker")) }));
  if (!w.google?.picker) throw new Error("script");
  return w.google;
}

/** 구글이 돌려준 영어 오류 → 한국어 이유와 고치는 법 */
function koreanOAuthError(code: string) {
  switch (code) {
    case "access_denied":
      return "구글 드라이브 접근을 허용하지 않았어요. 다시 눌러 ‘계속’(허용)을 골라 주세요. 테스트 중인 앱이면 구글 클라우드의 테스트 사용자에 이 계정이 있어야 해요.";
    case "redirect_uri_mismatch":
      return `구글 클라우드 OAuth 클라이언트의 ‘승인된 리디렉션 URI’에 ${location.origin}${DRIVE_RETURN_PATH} 를 넣어 주세요.`;
    case "invalid_client":
    case "unauthorized_client":
      return "구글 클라이언트 ID가 맞지 않아요. 버셀 환경 변수 NEXT_PUBLIC_GOOGLE_CLIENT_ID 를 확인해 주세요.";
    case "state_mismatch":
      return "구글에서 돌아온 정보가 이 브라우저의 요청과 달라요. 버튼을 다시 눌러 주세요.";
    default:
      return `구글 로그인에 실패했어요 (${code}).`;
  }
}

function pick(google: PickerGlobal, cfg: GoogleConfig, token: string): Promise<PickedDoc[]> {
  return new Promise((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS);
    view.setMimeTypes(DRIVE_MIME.join(","));
    view.setIncludeFolders(true);
    view.setMode(google.picker.DocsViewMode.LIST);
    new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(cfg.apiKey)
      .setAppId(cfg.appId)
      .setOrigin(location.origin)
      .setLocale("ko")
      .setTitle("자료로 넣을 파일 고르기 (PDF·Word·한글)")
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setCallback((d) => {
        if (d.action === google.picker.Action.PICKED) resolve(d.docs ?? []);
        else if (d.action === google.picker.Action.CANCEL) resolve([]);
      })
      .build()
      .setVisible(true);
  });
}

/** 고른 파일 내려받기 (구글 문서는 Word로 바꿔서) */
async function download(doc: PickedDoc, token: string): Promise<File> {
  const isDoc = doc.mimeType === GOOGLE_DOC;
  const url = isDoc
    ? `https://www.googleapis.com/drive/v3/files/${doc.id}/export?mimeType=${encodeURIComponent(DOCX)}`
    : `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    saveDriveToken(null);
    throw new Error("구글 로그인이 끝났어요(1시간). ‘구글 드라이브 연결’을 다시 눌러 주세요.");
  }
  if (res.status === 403) throw new Error("이 파일을 읽을 권한이 없어요. 파일 선택 창에서 다시 골라 주세요.");
  if (!res.ok) throw new Error(`내려받지 못했어요 (${res.status})`);
  const name = isDoc ? `${doc.name}.docx` : doc.name;
  return new File([await res.blob()], name);
}

/**
 * 구글에서 돌아왔는지: 주소 뒤(#)의 access_token·state 를 읽고 주소에서 지운다.
 * 자료 수집 화면이 Google Drive 탭을 바로 열 수 있게 밖에서도 쓴다.
 */
export function readDriveReturn(): { token?: string; expiresIn: number; error?: string; projectId?: string; mode?: "files" | "folder" } | null {
  if (typeof window === "undefined" || !/[#&](access_token|error)=/.test(location.hash)) return null;
  const p = new URLSearchParams(location.hash.slice(1));
  let pending: { state?: string; projectId?: string; mode?: "files" | "folder" } = {};
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING) ?? "{}");
  } catch {}
  return {
    token: p.get("state") && p.get("state") === pending.state ? (p.get("access_token") ?? undefined) : undefined,
    expiresIn: Number(p.get("expires_in")) || 3600,
    error: p.get("error") ?? (p.get("state") !== pending.state ? "state_mismatch" : undefined),
    projectId: pending.projectId,
    mode: pending.mode,
  };
}

type FolderFile = { id: string; name: string; mimeType: string; origin: string; category: string };
class ScopeError extends Error {}

// 앱이 드라이브에 만든 파일은 다시 자료로 가져오지 않는다 (자료가 겹치지 않게):
//   00_목록.xlsx·00_목록.md, 정리 스크립트가 만든 자료 카드 "저자_연도_제목.pdf/.docx" (00_목록 이 있는 폴더에서만),
//   ‘_정리 전 보관’·내가 쓴 글 폴더(07_원고·08_출력물·AI 작성글·AI 논문). 원문 PDF("…_원문.pdf")와 그 밖의 파일은 가져온다.
const APP_LIST = /^00_목록/;
const CARD = /^.+_(\d{4}|연도미상)_.+\.(pdf|docx)$/i;
const ORIGINAL = /_원문\.pdf$/i;
const SKIP_FOLDER = /^(_정리 전 보관|07_원고|08_출력물|AI 작성글|AI 논문)$/;

/** 폴더 안을 하위 폴더까지 훑어서 가져올 수 있는 파일 목록 (분류 = 메인 폴더 아래 경로) */
async function listFolder(rootId: string, token: string): Promise<{ files: FolderFile[]; skippedCards: number }> {
  const out: FolderFile[] = [];
  let skippedCards = 0;
  const queue: { id: string; path: string[] }[] = [{ id: rootId, path: [] }];
  while (queue.length && out.length < MAX_FOLDER_FILES) {
    const { id, path } = queue.shift()!;
    let pageToken = "";
    const entries: { id: string; name: string; mimeType: string }[] = [];
    do {
      const q = new URLSearchParams({
        q: `'${id}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType)",
        pageSize: "1000",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        ...(pageToken ? { pageToken } : {}),
      });
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?${q}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401 || res.status === 403) throw new ScopeError("scope");
      if (!res.ok) throw new Error(`폴더 목록을 읽지 못했어요 (${res.status})`);
      const data = (await res.json()) as { nextPageToken?: string; files?: { id: string; name: string; mimeType: string }[] };
      entries.push(...(data.files ?? []));
      pageToken = data.nextPageToken ?? "";
    } while (pageToken);
    // 00_목록 이 있으면 앱이 정리한 폴더 → 자료 카드는 건너뜀
    const appFolder = entries.some((f) => APP_LIST.test(f.name));
    for (const f of entries) {
      if (f.mimeType === FOLDER) {
        if (!SKIP_FOLDER.test(f.name)) queue.push({ id: f.id, path: [...path, f.name] });
        continue;
      }
      if (APP_LIST.test(f.name) || (appFolder && CARD.test(f.name) && !ORIGINAL.test(f.name))) {
        skippedCards++;
        continue;
      }
      if (f.mimeType === GOOGLE_DOC || DRIVE_EXT.some((e) => f.name.toLowerCase().endsWith(e)))
        out.push({ ...f, origin: `https://drive.google.com/file/d/${f.id}/view`, category: path.join(" / ") });
    }
  }
  return { files: out.slice(0, MAX_FOLDER_FILES), skippedCards };
}

export function DrivePicker({
  config,
  projectId,
  onAdded,
}: {
  config: GoogleConfig;
  projectId: string;
  onAdded: (ids: string[]) => void;
}) {
  const connected = useDriveConnected();
  const [ready, setReady] = useState<"loading" | "ok" | "fail">("loading");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; skipped: number; failed: { name: string; error: string }[] } | null>(null);
  const [progress, setProgress] = useState<{
    folder: string;
    total: number;
    done: number;
    added: string[];
    skipped: number;
    failed: { name: string; error: string }[];
    running: boolean;
  } | null>(null);
  const googleRef = useRef<PickerGlobal | null>(null);
  const [browseToken, setBrowseToken] = useState<string | null>(null);
  const browseDone = useRef<{ resolve: (f: PickedFolder | null) => void; reject: (e: unknown) => void } | null>(null);
  const latest = useRef({ projectId, onAdded });
  useEffect(() => {
    latest.current = { projectId, onAdded };
  });

  // 화면이 열리면: 구글에서 돌아왔는지 확인 + 파일 선택 창 스크립트 미리 불러오기 → 돌아온 거면 바로 피커 열기
  useEffect(() => {
    if (!config.ready) return;
    const back = readDriveReturn();
    if (back) {
      // 주소창의 #access_token=… 은 바로 지운다 (기록·공유에 남지 않게)
      history.replaceState(null, "", `${location.pathname}?tab=drive`);
      sessionStorage.removeItem(PENDING);
      if (back.token) {
        saveDriveToken({ token: back.token, exp: Date.now() + back.expiresIn * 1000 });
        sessionStorage.setItem(SCOPE_MARK, SCOPE);
      }
    }
    let alive = true;
    loadPicker()
      .then((g) => {
        if (!alive) return;
        googleRef.current = g;
        setReady("ok");
        if (back?.token) void (back.mode === "folder" ? importFolder(back.token) : pickAndSave(back.token));
        else if (back) showError(koreanOAuthError(back.error ?? "unknown"));
      })
      .catch(() => {
        if (!alive) return;
        setReady("fail");
        // 폴더 통째로 가져오기는 구글 선택 창 스크립트 없이도 된다
        if (back?.token && back.mode === "folder") void importFolder(back.token);
        else if (back)
          showError(
            back.token
              ? "파일 선택 창을 불러오지 못했어요. 광고 차단 확장 프로그램을 끄고 새로 고침해 주세요."
              : koreanOAuthError(back.error ?? "unknown")
          );
      });
    return () => {
      alive = false;
    };
    // pickAndSave·showError 는 ref·상태만 써서 다시 만들 필요가 없다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.ready]);

  function showError(message: string) {
    setBusy(null);
    setError(message);
    toast.error("구글 드라이브에서 가져오지 못했어요", { description: message });
  }

  /** 구글 로그인 화면으로 이동 (돌아오면 위 효과가 피커를 연다) */
  function goToGoogle(mode: "files" | "folder" = "files") {
    const state = crypto.randomUUID();
    sessionStorage.setItem(PENDING, JSON.stringify({ state, projectId: latest.current.projectId, mode }));
    const q = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: `${location.origin}${DRIVE_RETURN_PATH}`,
      response_type: "token",
      scope: SCOPE,
      include_granted_scopes: "true",
      state,
      prompt: "select_account",
    });
    setBusy("구글 로그인 화면으로 이동하는 중…");
    location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
  }

  /** 로그인된 뒤: 파일 선택 창 → 내려받기 → 글자 추출·저장 */
  async function pickAndSave(token: string) {
    const google = googleRef.current;
    if (!google) return;
    try {
      setBusy("파일 선택 창을 여는 중…");
      const docs = (await pick(google, config, token)).filter(
        (d) => d.mimeType === GOOGLE_DOC || DRIVE_EXT.some((e) => d.name.toLowerCase().endsWith(e))
      );
      if (!docs.length) {
        setBusy(null);
        return;
      }
      const failed: { name: string; error: string }[] = [];
      const form = new FormData();
      form.append("projectId", latest.current.projectId);
      let size = 0;
      for (const [i, d] of docs.entries()) {
        setBusy(`내려받는 중… (${i + 1}/${docs.length}) ${d.name}`);
        try {
          const file = await download(d, token);
          if (size + file.size > MAX_UPLOAD) throw new Error("온라인에서는 한 번에 4MB까지 돼요. 나눠서 골라 주세요.");
          size += file.size;
          form.append("files", file);
          form.append("origins", d.url || `https://drive.google.com/file/d/${d.id}/view`);
        } catch (e) {
          failed.push({ name: d.name, error: e instanceof Error ? e.message : String(e) });
        }
      }
      let added: string[] = [];
      let skipped: string[] = [];
      if (form.getAll("files").length) {
        setBusy("글자를 꺼내는 중…");
        const res = await fetch("/api/sources/upload", { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as {
          added?: string[];
          skipped?: string[];
          failed?: { name: string; error: string }[];
          error?: string;
        };
        if (!res.ok) throw new Error(res.status === 413 ? "파일이 너무 커요. 한 번에 4MB까지 돼요." : data.error || "저장하지 못했어요.");
        added = data.added ?? [];
        skipped = data.skipped ?? [];
        failed.push(...(data.failed ?? []));
      }
      setResult({ added: added.length, skipped: skipped.length, failed });
      setBusy(null);
      if (added.length) {
        toast.success(`드라이브 파일 ${added.length}개를 자료로 저장했어요`);
        latest.current.onAdded(added);
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  }

  /** 폴더 통째로: 메인 폴더 고르기 → 하위 폴더까지 목록 → 이미 있는 것 건너뛰고 하나씩 저장 (하위 폴더 이름 = 분류) */
  /** 폴더 고르기 창을 열고 고른 폴더를 기다린다 (취소하면 null) */
  function browseFolder(token: string) {
    return new Promise<PickedFolder | null>((resolve, reject) => {
      browseDone.current = { resolve, reject };
      setBrowseToken(token);
    });
  }
  function closeBrowser(result: PickedFolder | null, error?: unknown) {
    const done = browseDone.current;
    browseDone.current = null;
    setBrowseToken(null);
    if (error !== undefined) done?.reject(error);
    else done?.resolve(result);
  }

  async function importFolder(token: string) {
    try {
      setBusy("가져올 메인 폴더를 고르는 중…");
      let folder: PickedFolder | null;
      let files: FolderFile[];
      let skippedCards = 0;
      try {
        folder = await browseFolder(token);
        if (!folder) {
          setBusy(null);
          return;
        }
        setBusy(`‘${folder.name}’ 안의 파일 목록을 읽는 중…`);
        ({ files, skippedCards } = await listFolder(folder.id, token));
      } catch (e) {
        if (e instanceof ScopeError || e instanceof DriveScopeError) {
          // 예전(drive.file) 로그인으로는 폴더 안을 못 읽는다 → 새 권한으로 다시 로그인
          saveDriveToken(null);
          toast.info("폴더 안을 읽으려면 구글 로그인을 한 번 더 해야 해요", { description: "드라이브 읽기 권한을 새로 받아요." });
          goToGoogle("folder");
          return;
        }
        throw e;
      }
      if (!files.length) {
        setBusy(null);
        toast.info(`‘${folder.name}’ 안에 새로 가져올 PDF·Word·한글·구글 문서가 없어요`, {
          description: skippedCards ? `앱이 만든 자료 카드·00_목록 ${skippedCards}개는 건너뛰었어요.` : undefined,
        });
        return;
      }
      setBusy(`‘${folder.name}’ 프로젝트에 연결하는 중…`);
      const proj = await ensureProjectNamed(folder.name);
      if (!proj.ok) throw new Error(proj.error);
      const have = new Set(await existingDriveOrigins(files.map((f) => f.origin)));
      const todo = files.filter((f) => !have.has(f.origin));
      const p = { total: files.length, done: have.size, added: [] as string[], skipped: have.size, failed: [] as { name: string; error: string }[] };
      setProgress({ ...p, folder: folder.name, running: true });
      for (const f of todo) {
        setBusy(`가져오는 중… (${p.done + 1}/${p.total}) ${f.name}`);
        try {
          const file = await download({ id: f.id, name: f.name, mimeType: f.mimeType }, token);
          if (file.size > MAX_UPLOAD) throw new Error("4MB가 넘어 온라인에서는 가져올 수 없어요.");
          const form = new FormData();
          form.append("projectId", proj.id);
          form.append("files", file);
          form.append("origins", f.origin);
          form.append("categories", f.category);
          const res = await fetch("/api/sources/upload", { method: "POST", body: form });
          const data = (await res.json().catch(() => ({}))) as {
            added?: string[];
            skipped?: string[];
            failed?: { name: string; error: string }[];
            error?: string;
          };
          if (!res.ok) throw new Error(res.status === 413 ? "파일이 너무 커요 (4MB까지)." : data.error || "저장하지 못했어요.");
          p.added.push(...(data.added ?? []));
          p.skipped += data.skipped?.length ?? 0;
          p.failed.push(...(data.failed ?? []));
        } catch (e) {
          p.failed.push({ name: f.name, error: e instanceof Error ? e.message : String(e) });
        }
        p.done++;
        setProgress({ ...p, folder: folder.name, running: true });
      }
      setProgress({ ...p, folder: folder.name, running: false });
      setBusy(null);
      toast.success(`‘${folder.name}’ 폴더: ${p.added.length}개 저장 · ${p.skipped}개 건너뜀${p.failed.length ? ` · ${p.failed.length}개 실패` : ""}`, {
        description:
          (proj.created ? `‘${folder.name}’ 프로젝트를 새로 만들어 연결했어요.` : `‘${folder.name}’ 프로젝트에 연결했어요.`) +
          (skippedCards ? ` 앱이 만든 자료 카드·00_목록 ${skippedCards}개는 건너뛰었어요.` : ""),
      });
      if (p.added.length) latest.current.onAdded(p.added);
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  }

  function onFolderClick() {
    setError(null);
    setResult(null);
    setProgress(null);
    // 예전 권한(drive.file)으로 받은 로그인은 폴더 안을 못 읽으므로 새로 로그인
    // 폴더 고르기 창은 우리 창이라 구글 선택 창 스크립트를 기다리지 않는다
    const token = sessionStorage.getItem(SCOPE_MARK) === SCOPE ? readDriveToken()?.token : undefined;
    if (token) void importFolder(token);
    else goToGoogle("folder");
  }

  function onClick() {
    setError(null);
    setResult(null);
    const token = readDriveToken()?.token;
    if (token && ready === "ok") void pickAndSave(token);
    else if (token && ready === "loading") showError("파일 선택 창을 준비하는 중이에요. 1~2초 뒤 다시 눌러 주세요.");
    else goToGoogle();
  }

  if (!config.ready)
    return (
      <p className="rounded-md bg-gold/15 px-3 py-2 text-sm">
        구글 클라우드 설정이 아직이에요. README의 <b>‘구글 드라이브 연결’</b> 단계를 마치고 버셀 환경 변수 3개를 넣으면 이
        버튼이 생겨요.
      </p>
    );

  return (
    <div className="flex flex-col gap-3">
      {browseToken && (
        <DriveFolderBrowser
          token={browseToken}
          onPick={(f) => closeBrowser(f)}
          onCancel={() => closeBrowser(null)}
          onError={(e) => closeBrowser(null, e)}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onClick} disabled={!!busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Cloud />}
          {connected ? "드라이브에서 파일 고르기" : "구글 드라이브 연결"}
        </Button>
        <Button variant="outline" onClick={onFolderClick} disabled={!!busy}>
          <FolderDown />
          폴더 통째로 가져오기
        </Button>
        {connected && !busy && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const t = readDriveToken();
              if (t) void fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.token)}`, { method: "POST" }).catch(() => {});
              saveDriveToken(null);
            }}
          >
            <LogOut />
            연결 끊기
          </Button>
        )}
        {busy && <span className="text-sm text-muted-foreground">{busy}</span>}
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {progress && (
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-3 text-sm">
          <p className="font-medium">
            ‘{progress.folder}’ 폴더 {progress.done}/{progress.total}
            <span className="font-normal text-muted-foreground">
              {" "}
              · 저장 {progress.added.length} · 이미 있어 건너뜀 {progress.skipped} · 실패 {progress.failed.length}
            </span>
          </p>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={progress.done}
            aria-valuemin={0}
            aria-valuemax={progress.total}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
            />
          </div>
          {!progress.running &&
            progress.failed.map((f) => (
              <p key={f.name} className="text-xs text-destructive">
                {f.name}: {f.error}
              </p>
            ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        버튼을 누르면 구글 로그인 화면으로 갔다가 이 화면으로 돌아와 선택 창이 열려요. <b>폴더 통째로 가져오기</b>는 메인 폴더
        하나를 고르면(‘논문작업실’ 폴더부터 한 단계씩 들어가요) 하위 폴더까지 PDF·Word·한글(hwp·hwpx)·구글 문서를 모두 가져와요.
        하위 폴더 이름은 자료의 분류로, 메인 폴더 이름은 프로젝트로 연결되고, 이미 가져온 파일과 앱이 만든 자료 카드·00_목록은
        건너뛰어요(원문 PDF 는 가져와요). 드라이브는 읽기만 해요.
      </p>
      {result && (
        <div className="text-sm">
          <p>
            저장 {result.added}개 · 이미 있어 건너뜀 {result.skipped}개 · 실패 {result.failed.length}개
          </p>
          {result.failed.map((f) => (
            <p key={f.name} className="text-xs text-destructive">
              {f.name}: {f.error}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
