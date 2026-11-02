// 슈파베이스에 표를 만든다: npm run db:setup
// .env.local(버셀에서 vercel env pull 로 받은 파일)의 데이터베이스 주소를 쓴다. 키는 화면에 출력하지 않는다.
import { readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile?.(".env.local");
const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!url) {
  console.error("데이터베이스 주소가 없어요. 먼저 vercel env pull 로 .env.local 을 받아 주세요.");
  process.exit(1);
}

// sslmode 는 아래 ssl 설정으로 대신한다 (슈파베이스 인증서 체인 때문에)
const client = new pg.Client({
  connectionString: url.replace(/[?&]sslmode=[^&]*/g, ""),
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query(readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"));
  const { rows } = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' and table_name in ('projects', 'ai_drafts') order by 1"
  );
  console.log("표 준비 완료:", rows.map((r) => r.table_name).join(", "));
} finally {
  await client.end();
}
