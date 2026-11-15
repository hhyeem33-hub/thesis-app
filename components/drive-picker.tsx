"use client";

import { useEffect, useRef, useState } from "react";
import { Cloud, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { readDriveToken, saveDriveToken, useDriveConnected } from "@/components/google-status";
import { Button } from "@/components/ui/button";
import { DRIVE_EXT, DRIVE_MIME, type GoogleConfig } from "@/lib/google";

// 구글 드라이브 연결 (브라우저에서): 구글 로그인 창 → 구글 파일 선택 창(Picker) → 고른 파일만 내려받아 글자 추출
// 권한은 drive.file — "내가 고른 파일만" 읽을 수 있어서 드라이브 전체를 보지 않는다.
//
// ⚠️ 크롬은 "버튼을 누른 바로 그 순간"에 연 창만 팝업으로 허락한다.
//    그래서 구글 스크립트는 화면이 열릴 때 미리 불러 두고, 버튼을 누르면 기다림 없이 바로 로그인 창을 연다.

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_DOC = "application/vnd.google-apps.document";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** 버셀 서버가 한 번에 받을 수 있는 크기 (요청 4.5MB 제한) */
const MAX_UPLOAD = 4 * 1024 * 1024;

type TokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string };
type TokenError = { type?: string; message?: string };
type TokenClient = { requestAccessToken(o?: { prompt?: string }): void };
type PickedDoc = { id: string; name: string; mimeType: string; url?: string; sizeBytes?: number };
type GoogleGlobal = {
  accounts: {
    oauth2: {
      initTokenClient(o: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: TokenError) => void;
      }): TokenClient;
      revoke(token: string, done: () => void): void;
    };
  };
  picker: {
    DocsView: new (viewId?: unknown) => {
      setMimeTypes(m: string): unknown;
      setIncludeFolders(b: boolean): unknown;
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
  setOrigin(o: string): PickerBuilder;
  enableFeature(f: unknown): PickerBuilder;
  setCallback(cb: (d: { action: string; docs?: PickedDoc[] }) => void): PickerBuilder;
  build(): { setVisible(v: boolean): void };
};
type Win = Window & { google?: GoogleGlobal; gapi?: { load(name: string, o: { callback: () => void; onerror: () => void }): void } };

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

/** 구글 로그인(gsi) + 파일 선택 창(gapi picker) 스크립트를 미리 불러온다 */
async function loadGoogle() {
  await Promise.all([loadScript("https://accounts.google.com/gsi/client"), loadScript("https://apis.google.com/js/api.js")]);
  const w = window as Win;
  await new Promise<void>((resolve, reject) => w.gapi!.load("picker", { callback: resolve, onerror: () => reject(new Error("picker")) }));
  if (!w.google?.accounts?.oauth2 || !w.google.picker) throw new Error("script");
  return w.google;
}

/** 구글이 돌려준 영어 오류 → 한국어 이유와 고치는 법 */
function koreanTokenError(code: string, detail?: string) {
  switch (code) {
    case "popup_failed_to_open":
      return "브라우저가 구글 로그인 창(팝업)을 막았어요. 주소창 오른쪽의 ‘팝업 차단됨’ 아이콘을 눌러 이 사이트의 팝업을 허용한 뒤 다시 눌러 주세요.";
    case "popup_closed":
      return "구글 로그인 창이 닫혔어요. 계정을 고르기 전에 창이 바로 닫혔다면, 구글 클라우드 OAuth 클라이언트의 ‘승인된 자바스크립트 원본’에 지금 주소가 있는지 확인해 주세요.";
    case "access_denied":
      return "구글 드라이브 접근을 허용하지 않았어요. 다시 눌러 ‘허용’을 골라 주세요.";
    case "invalid_client":
    case "unauthorized_client":
      return "구글 클라이언트 ID가 맞지 않아요. 버셀 환경 변수 NEXT_PUBLIC_GOOGLE_CLIENT_ID 를 확인해 주세요.";
    case "origin_mismatch":
    case "redirect_uri_mismatch":
      return `이 주소(${location.origin})가 구글 클라우드의 ‘승인된 자바스크립트 원본’에 없어요.`;
    case "admin_policy_enforced":
    case "org_internal":
      return "이 구글 계정은 쓸 수 없어요. 앱이 ‘테스트 중’이면 구글 클라우드의 테스트 사용자에 이 계정을 넣어 주세요.";
    default:
      return `구글 로그인에 실패했어요 (${code}${detail ? `: ${detail}` : ""}).`;
  }
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
  const googleRef = useRef<GoogleGlobal | null>(null);
  const clientRef = useRef<TokenClient | null>(null);
  // 최신 projectId·onAdded 를 로그인 창 콜백에서 쓰기 위해
  const latest = useRef({ projectId, onAdded });
  useEffect(() => {
    latest.current = { projectId, onAdded };
  });

  // 화면이 열리면 구글 스크립트를 미리 불러오고 로그인 도구를 만들어 둔다
  useEffect(() => {
    if (!config.ready) return;
    let alive = true;
    loadGoogle()
      .then((google) => {
        if (!alive) return;
        googleRef.current = google;
        clientRef.current = google.accounts.oauth2.initTokenClient({
          client_id: config.clientId,
          scope: SCOPE,
          callback: (r) => {
            if (!r.access_token) {
              fail(koreanTokenError(r.error ?? "unknown", r.error_description));
              return;
            }
            saveDriveToken({ token: r.access_token, exp: Date.now() + (r.expires_in ?? 3600) * 1000 });
            void pickAndSave(r.access_token);
          },
          error_callback: (e) => fail(koreanTokenError(e.type ?? "unknown", e.message)),
        });
        setReady("ok");
      })
      .catch(() => alive && setReady("fail"));
    return () => {
      alive = false;
    };
    // pickAndSave·fail 은 ref 만 읽어서 다시 만들 필요가 없다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.ready, config.clientId]);

  function fail(message: string) {
    setBusy(null);
    setError(message);
    toast.error("구글 드라이브에서 가져오지 못했어요", { description: message });
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
      fail(e instanceof Error ? e.message : String(e));
    }
  }

  /** 버튼을 누른 그 순간에 로그인 창을 연다 (await 없이) */
  function onClick() {
    setError(null);
    setResult(null);
    const token = readDriveToken()?.token;
    if (token) {
      void pickAndSave(token);
      return;
    }
    if (!clientRef.current) {
      fail(
        ready === "fail"
          ? "구글 스크립트를 불러오지 못했어요. 광고 차단 확장 프로그램을 끄거나 인터넷 연결을 확인한 뒤 새로 고침해 주세요."
          : "구글 연결을 준비하는 중이에요. 1~2초 뒤 다시 눌러 주세요."
      );
      return;
    }
    setBusy("구글 로그인 창에서 계정을 골라 주세요…");
    clientRef.current.requestAccessToken({ prompt: "" });
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
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onClick} disabled={!!busy || ready === "loading"}>
          {busy || ready === "loading" ? <Loader2 className="animate-spin" /> : <Cloud />}
          {ready === "loading" ? "구글 연결 준비 중…" : connected ? "드라이브에서 파일 고르기" : "구글 드라이브 연결"}
        </Button>
        {connected && !busy && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const t = readDriveToken();
              if (t) googleRef.current?.accounts.oauth2.revoke(t.token, () => {});
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
