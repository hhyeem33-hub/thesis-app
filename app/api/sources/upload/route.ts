import path from "path";
import { revalidatePath } from "next/cache";
import { addSources, extractText, type NewSource } from "@/lib/source-intake";
import { getProjects } from "@/lib/store";

const MAX_BYTES = 20 * 1024 * 1024;

/** 파일 올리기: PDF·Word(.docx)·txt·md 에서 글자를 꺼내 자료로 저장 */
export async function POST(req: Request) {
  const form = await req.formData();
  const projectId = String(form.get("projectId") ?? "");
  const project = (await getProjects()).find((p) => p.id === projectId) ?? null;
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return Response.json({ error: "파일을 골라 주세요." }, { status: 400 });
  const items: NewSource[] = [];
  const failed: { name: string; error: string }[] = [];
  for (const file of files.slice(0, 30)) {
    if (file.size > MAX_BYTES) {
      failed.push({ name: file.name, error: "20MB가 넘어요." });
      continue;
    }
    try {
      const { text, type } = await extractText(file.name, Buffer.from(await file.arrayBuffer()));
      items.push({
        title: path.basename(file.name, path.extname(file.name)),
        type,
        origin: `내 파일: ${file.name}`,
        content: text,
      });
    } catch (e) {
      failed.push({ name: file.name, error: e instanceof Error ? e.message : String(e) });
    }
  }
  try {
    const { added, skipped } = await addSources(items, project?.id ?? null);
    revalidatePath("/sources");
    revalidatePath("/dashboard");
    return Response.json({ added, skipped, failed });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e), failed }, { status: 500 });
  }
}
