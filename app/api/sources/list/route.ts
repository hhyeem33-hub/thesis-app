import { revalidatePath } from "next/cache";
import { addSources, parseList } from "@/lib/source-intake";
import { getProjects } from "@/lib/store";

/** 목록 가져오기 (엑셀·CSV). mode=preview 면 읽기만, import 면 저장 */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const mode = String(form.get("mode") ?? "preview");
  const projectId = String(form.get("projectId") ?? "");
  if (!(file instanceof File)) return Response.json({ error: "파일을 골라 주세요." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return Response.json({ error: "10MB 이하 파일만 돼요." }, { status: 400 });
  try {
    const { items, columns, ignored } = await parseList(file.name, Buffer.from(await file.arrayBuffer()));
    if (mode !== "import")
      return Response.json({
        total: items.length,
        columns,
        ignored,
        preview: items.slice(0, 8).map((i) => ({ title: i.title, authors: i.bib?.authors, year: i.bib?.year, origin: i.origin })),
      });
    const project = (await getProjects()).find((p) => p.id === projectId) ?? null;
    const { added, skipped } = await addSources(items.slice(0, 1000), project?.id ?? null);
    revalidatePath("/sources");
    revalidatePath("/dashboard");
    return Response.json({ added, skipped });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
