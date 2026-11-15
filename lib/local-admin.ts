import { headers } from "next/headers";
import { ONLINE } from "./online";

// 내 컴퓨터 전용 관리자 기능의 문지기: 온라인(버셀)이면 무조건 false, 내 컴퓨터도 localhost 주소로 열었을 때만 true

export async function isLocalAdmin() {
  if (ONLINE || process.env.VERCEL_ENV) return false;
  const host = ((await headers()).get("host") ?? "").toLowerCase();
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
}

/** 비밀번호를 바꿀 주인 계정 (.env.local 의 OWNER_EMAIL) */
export function ownerEmail() {
  return process.env.OWNER_EMAIL?.trim().toLowerCase() ?? "";
}
