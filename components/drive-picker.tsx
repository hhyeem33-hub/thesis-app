"use client";

import { useState } from "react";
import { Cloud, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { readDriveToken, saveDriveToken, useDriveConnected } from "@/components/google-status";
import { Button } from "@/components/ui/button";
import { DRIVE_EXT, DRIVE_MIME, type GoogleConfig } from "@/lib/google";

// 구글 드라이브 연결 (브라우저에서): 구글 로그인 창 → 구글 파일 선택 창(Picker) → 고른 파일만 내려받아 글자 추출
// 권한은 drive.file — "내가 고른 파일만" 읽을 수 있어서 드라이브 전체를 보지 않는다.

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_DOC = "application/vnd.google-apps.document";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** 버셀 서버가 한 번에 받을 수 있는 크기 (요청 4.5MB 제한) */
const MAX_UPLOAD = 4 * 1024 * 1024;

type TokenResponse = { access_token?: string; expires_in?: number; error?: string };
type PickedDoc = { id: string; name: string; mimeType: string; url?: string; sizeBytes?: number };
type GoogleGlobal = {
  accounts: {
    oauth2: {
      initTokenClient(o: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { message?: string }) => void }): {
        requestAccessToken(o?: { prompt?: string }): void;
      };
      revoke(token: string, done: () => void): void;
    };
  };
  picker: {
    DocsView: new (viewId?: unknown) => {
      setMimeTypes(m: string): unknown;
      setIncludeFolders(b: boolean): unknown;
      setSelectFolderEnabled(b: boolean): unknown;
      setMode(m: unknown): unknown;
    };
    ViewId: { DOCS: unknown };
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
  enableFeature(f: unknown): PickerBuilder;
  setCallback(cb: (d: { action: string; docs?: PickedDoc[] }) => void): PickerBuilder;
  build(): { setVisible(v: boolean): void };
};
type Win = Window & { google?: GoogleGlobal; gapi?: { load(name: string, cb: () => void): void } };

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = Object.assign(document.createElement("script"), { src, async: true, onload: () => resolve(), onerror: () => reject(new Error("구글 스크립트를 불러오지 못했어요.")) });
    document.head.appendChild(s);
  });
}

async function loadGoogle() {
  await Promise.all([loadScript("https://accounts.google.com/gsi/client"), loadScript("https://apis.google.com/js/api.js")]);
  const w = window as Win;
  await new Promise<void>((resolve) => w.gapi!.load("picker", resolve));
  return w.google!;
}

function signIn(google: GoogleGlobal, clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (!r.access_token) return reject(new Error(r.error || "구글 로그인이 취소됐어요."));
        saveDriveToken({ token: r.access_token, exp: Date.now() + (r.expires_in ?? 3600) * 1000 });
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new Error(e.message || "구글 로그인 창이 닫혔어요.")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

function pick(google: GoogleGlobal, cfg: GoogleConfig, token: string): Promise<PickedDoc[]> {
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
    throw new Error("구글 로그인이 끝났어요. 다시 연결해 주세요.");
  }
  if (!res.ok) throw new Error(`내려받지 못했어요 (${res.status})`);
  const name = isDoc ? `${doc.name}.docx` : doc.name;
  return new File([await res.blob()], name);
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
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; skipped: number; failed: { name: string; error: string }[] } | null>(null);

  if (!config.ready)
    return (
      <p className="rounded-md bg-gold/15 px-3 py-2 text-sm">
        구글 클라우드 설정이 아직이에요. README의 <b>‘구글 드라이브 연결’</b> 단계를 마치고 버셀 환경 변수 3개를 넣으면 이
        버튼이 생겨요.
      </p>
    );

  async function run() {
    setResult(null);
    try {
      setBusy("구글에 연결하는 중…");
      const google = await loadGoogle();
      const token = readDriveToken()?.token ?? (await signIn(google, config.clientId));
      setBusy("파일 선택 창을 여는 중…");
      const docs = (await pick(google, config, token)).filter(
        (d) => d.mimeType === GOOGLE_DOC || DRIVE_EXT.some((e) => d.name.toLowerCase().endsWith(e))
      );
      if (!docs.length) return;
      const failed: { name: string; error: string }[] = [];
      const form = new FormData();
      form.append("projectId", projectId);
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
        const data = (await res.json()) as { added?: string[]; skipped?: string[]; failed?: { name: string; error: string }[]; error?: string };
        if (!res.ok) throw new Error(data.error || "저장하지 못했어요.");
        added = data.added ?? [];
        skipped = data.skipped ?? [];
        failed.push(...(data.failed ?? []));
      }
      setResult({ added: added.length, skipped: skipped.length, failed });
      if (added.length) {
        toast.success(`드라이브 파일 ${added.length}개를 자료로 저장했어요`);
        onAdded(added);
      }
    } catch (e) {
      toast.error("구글 드라이브에서 가져오지 못했어요", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={run} disabled={!!busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Cloud />}
          {connected ? "드라이브에서 파일 고르기" : "구글 드라이브 연결"}
        </Button>
        {connected && !busy && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const t = readDriveToken();
              if (t) (window as Win).google?.accounts.oauth2.revoke(t.token, () => {});
              saveDriveToken(null);
            }}
          >
            <LogOut />
            연결 끊기
          </Button>
        )}
        {busy && <span className="text-sm text-muted-foreground">{busy}</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        구글 로그인 후 열리는 창에서 PDF·Word·한글(hwp·hwpx)·구글 문서를 고르면, 고른 파일만 읽어 글자를 저장해요.
        드라이브의 다른 파일은 보지 않아요.
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
