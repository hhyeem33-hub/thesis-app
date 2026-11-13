"use client";

import { useEffect, useState } from "react";

// 구글 드라이브 로그인 상태는 브라우저에만 있다 (접근 토큰은 1시간짜리, 이 탭에서만 기억)
const KEY = "gdrive_token";
const EVENT = "gdrive-change";

export type DriveToken = { token: string; exp: number };

export function readDriveToken(): DriveToken | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as DriveToken | null;
    return t && t.exp > Date.now() + 30_000 ? t : null;
  } catch {
    return null;
  }
}

export function saveDriveToken(t: DriveToken | null) {
  try {
    if (t) sessionStorage.setItem(KEY, JSON.stringify(t));
    else sessionStorage.removeItem(KEY);
  } catch {
    // 저장이 막힌 브라우저는 이번 화면에서만 쓴다
  }
  window.dispatchEvent(new Event(EVENT));
}

/** 이 브라우저에서 구글 드라이브에 로그인돼 있는지 (바뀌면 다시 그림) */
export function useDriveConnected() {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const update = () => setConnected(!!readDriveToken());
    update();
    window.addEventListener(EVENT, update);
    const timer = setInterval(update, 60_000);
    return () => {
      window.removeEventListener(EVENT, update);
      clearInterval(timer);
    };
  }, []);
  return connected;
}

/** 서버가 확인한 상태 위에, 이 브라우저에서 구글에 연결돼 있으면 "연결됨"으로 바꿔 보여 준다 */
export function DriveLive({
  connected: connectedView,
  children,
}: {
  connected: React.ReactNode;
  children: React.ReactNode;
}) {
  const connected = useDriveConnected();
  return <>{connected ? connectedView : children}</>;
}
