import { ONLINE } from "@/lib/db";
import { getDoc } from "@/lib/documents";
import { buildHwpx } from "@/lib/hwpx";
import { getSources } from "@/lib/sources";
import { getProjects } from "@/lib/store";

/** 저장된 원고를 hwpx 로 만들어 내려준다 (내 컴퓨터 전용) */
export async function POST(req: Request) {
  if (ONLINE) return Response.json({ error: "HWPX 만들기는 내 컴퓨터에서 앱을 실행할 때만 돼요." }, { status: 400 });
  const { projectId, templateId } = (await req.json()) as { projectId?: string; templateId?: string | null };
  const project = (await getProjects()).find((p) => p.id === projectId);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요." }, { status: 404 });
  const doc = await getDoc(project.id);
  if (!doc) return Response.json({ error: "먼저 원고를 저장해 주세요." }, { status: 400 });
  try {
    const bytes = await buildHwpx(doc, await getSources(), templateId || null);
    const safe = (doc.title || project.name).replace(/[<>:"/\|?*\x00-\x1f]/g, " ").trim().slice(0, 50) || "논문";
    const name = `${new Date().toISOString().slice(0, 10)}_${safe}.hwpx`;
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/hwp+zip",
        "Content-Disposition": `attachment; filename="thesis.hwpx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
