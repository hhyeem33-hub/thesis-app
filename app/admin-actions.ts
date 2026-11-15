"use server";

import { db } from "@/lib/db";
import { isLocalAdmin, ownerEmail } from "@/lib/local-admin";

// ⚠️ 내 컴퓨터 전용: 슈파베이스 비밀 열쇠(.env.local 의 SUPABASE_SECRET_KEY)로 주인 계정 비밀번호를 메일 없이 바꾼다.
// 온라인(버셀)에서는 절대 실행되지 않는다. 내 컴퓨터에서도 localhost 주소로 열었을 때만 된다.

const MIN = 6;

export async function adminSetOwnerPassword(password: string): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  if (!(await isLocalAdmin())) return { ok: false, error: "이 기능은 내 컴퓨터(localhost)에서만 써요." };
  const email = ownerEmail();
  if (!email) return { ok: false, error: ".env.local 에 OWNER_EMAIL 이 없어요." };
  if (password.length < MIN) return { ok: false, error: `비밀번호는 ${MIN}자 이상으로 적어 주세요.` };

  try {
    const admin = db().auth.admin;
    // 이메일로 계정 찾기 (한 번에 1,000명씩)
    let id: string | null = null;
    for (let page = 1; !id; page++) {
      const { data, error } = await admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(error.message);
      id = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
      if (data.users.length < 1000) break;
    }
    if (!id) return { ok: false, error: `${email} 계정을 찾지 못했어요. 온라인 앱에서 한 번 가입·로그인한 적이 있는지 확인해 주세요.` };
    const { error } = await admin.updateUserById(id, { password, email_confirm: true });
    if (error) throw new Error(error.message);
    return { ok: true, email };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: /invalid api key|jwt|unauthorized|SENSITIVE/i.test(msg)
        ? ".env.local 의 SUPABASE_URL · SUPABASE_SECRET_KEY 가 맞지 않아요. 슈파베이스 → Project Settings → API Keys 의 secret 키인지 확인해 주세요."
        : `바꾸지 못했어요: ${msg}`,
    };
  }
}
