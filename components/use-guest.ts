"use client";

import { useSyncExternalStore } from "react";

// 둘러보기 모드인지 (브라우저 쿠키 guest_view=1). 버튼을 미리 막고 안내하는 데만 쓴다.
// 실제로 막는 건 서버(lib/auth.ts 의 guestBlock·requireWriter)가 한다.

export const GUEST_NOTICE = "둘러보기 모드에서는 볼 수만 있어요. 로그인하면 내 계정으로 쓸 수 있어요.";

const read = () => /(?:^|;\s*)guest_view=1(?:;|$)/.test(document.cookie);

export function useGuest() {
  return useSyncExternalStore(
    () => () => {},
    read,
    () => false
  );
}
