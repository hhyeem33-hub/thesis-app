/**
 * 온라인(버셀)이면 슈파베이스에 저장하고 로그인을 쓴다. 내 컴퓨터면 data/*.json 에 저장하고 로그인 없이 쓴다.
 * vercel env pull 이 .env.local 에 VERCEL=1 을 넣을 수 있어서, 윈도우(내 컴퓨터)는 항상 로컬로 본다.
 */
export const ONLINE = !!process.env.VERCEL && process.platform !== "win32";
