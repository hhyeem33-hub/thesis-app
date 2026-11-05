import { ONLINE } from "@/lib/db";
import { addTemplate, removeTemplate } from "@/lib/hwpx";

const MAX_BYTES = 20 * 1024 * 1024;

/** hwpx 양식 올리기 (외대 양식 구조인지 검사 후 저장) */
export async function POST(req: Request) {
  if (ONLINE) return Response.json({ error: "양식 올리기는 내 컴퓨터에서만 돼요." }, { status: 400 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "파일을 골라 주세요." }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".hwpx"))
    return Response.json({ error: ".hwpx 파일만 올릴 수 있어요. (.hwp 는 한글에서 HWPX로 다시 저장해 주세요)" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "파일이 너무 커요 (20MB 이하)." }, { status: 400 });
  try {
    const info = await addTemplate(file.name.replace(/\.hwpx$/i, ""), Buffer.from(await file.arrayBuffer()));
    return Response.json({ template: info });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (ONLINE) return Response.json({ error: "내 컴퓨터에서만 돼요." }, { status: 400 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  await removeTemplate(id);
  return Response.json({ ok: true });
}
