"use client";

import { useEffect, useRef, useState } from "react";
import { Cloud, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { readDriveToken, saveDriveToken, useDriveConnected } from "@/components/google-status";
import { Button } from "@/components/ui/button";
import { DRIVE_EXT, DRIVE_MIME, type GoogleConfig } from "@/lib/google";

// 구글 드라이브 연결 (브라우저에서) — "화면 이동(리다이렉트)" 방식
// 버튼 → 구글 로그인 화면으로 이동 → 허용 → /sources/new 로 돌아옴(#access_token=…) → 바로 파일 선택 창(Picker)
// 팝업을 쓰지 않아서 크롬의 팝업 차단·창 격리(COOP) 때문에 로그인 창이 바로 닫히는 문제가 없다.
// 권한은 drive.file — "내가 고른 파일만" 읽을 수 있어서 드라이브 전체를 보지 않는다.

const SCOPE = "https://www.googleapis.com/auth/drive.file";
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
export function readDriveReturn(): { token?: string; expiresIn: number; error?: string; projectId?: string } | null {
  if (typeof window === "undefined" || !/[#&](access_token|error)=/.test(location.hash)) return null;
  const p = new URLSearchParams(location.hash.slice(1));
  let pending: { state?: string; projectId?: string } = {};
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING) ?? "{}");
  } catch {}
  return {
    token: p.get("state") && p.get("state") === pending.state ? (p.get("access_token") ?? undefined) : undefined,
    expiresIn: Number(p.get("expires_in")) || 3600,
    error: p.get("error") ?? (p.get("state") !== pending.state ? "state_mismatch" : undefined),
    projectId: pending.projectId,
  };
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
  const googleRef = useRef<PickerGlobal | null>(null);
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
      if (back.token) saveDriveToken({ token: back.token, exp: Date.now() + back.expiresIn * 1000 });
    }
    let alive = true;
    loadPicker()
      .then((g) => {
        if (!alive) return;
        googleRef.current = g;
        setReady("ok");
        if (back?.token) void pickAndSave(back.token);
        else if (back) showError(koreanOAuthError(back.error ?? "unknown"));
      })
      .catch(() => {
        if (!alive) return;
        setReady("fail");
        if (back)
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
  function goToGoogle() {
    const state = crypto.randomUUID();
    sessionStorage.setItem(PENDING, JSON.stringify({ state, projectId: latest.current.projectId }));
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
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onClick} disabled={!!busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Cloud />}
          {connected ? "드라이브에서 파일 고르기" : "구글 드라이브 연결"}
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
      <p className="text-xs text-muted-foreground">
        버튼을 누르면 구글 로그인 화면으로 갔다가 이 화면으로 돌아와 파일 선택 창이 열려요. PDF·Word·한글(hwp·hwpx)·구글
        문서를 고르면 고른 파일만 읽어 글자를 저장해요. 드라이브의 다른 파일은 보지 않아요.
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
