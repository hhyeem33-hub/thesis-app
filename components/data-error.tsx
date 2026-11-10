/** 자료를 불러오지 못했을 때 (온라인에서 슈파베이스 표가 아직 없을 때 등) */
export function DataError({ error }: { error: unknown }) {
  return (
    <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
      기록을 불러오지 못했어요. 온라인이라면 슈파베이스에 표·계정 칸이 만들어졌는지 확인해 주세요
      (supabase/schema.sql, supabase/auth.sql 을 SQL Editor에서 Run).
      <br />
      <span className="text-xs">{error instanceof Error ? error.message : String(error)}</span>
    </p>
  );
}
