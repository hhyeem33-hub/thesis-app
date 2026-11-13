"use client";

import { useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type TemplateInfo = { id: string; name: string; uploadedAt: string };

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** 저장한 원고를 hwpx 로 내려받기 (내 컴퓨터 전용). 성공하면 파일 이름, 실패하면 오류 문장 */
export async function downloadHwpx(projectId: string, templateId: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const res = await fetch("/api/hwpx/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, templateId: templateId || null }),
  });
  if (!res.ok) {
    const { error } = (await res.json()) as { error: string };
    return { ok: false, error };
  }
  const name =
    decodeURIComponent(res.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? "") || "논문.hwpx";
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true, name };
}

/** 한글 양식 고르기 + 내 양식(hwpx) 올리기 (내 컴퓨터 전용) */
export function HwpxTemplates({
  templates,
  templateId,
  setTemplateId,
  onTemplatesChange,
}: {
  templates: TemplateInfo[];
  templateId: string;
  setTemplateId: (id: string) => void;
  onTemplatesChange: () => void;
}) {
  const [busy, setBusy] = useState<"upload" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy("upload");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/hwpx/templates", { method: "POST", body: form });
      const data = (await res.json()) as { template?: TemplateInfo; error?: string };
      if (!res.ok || !data.template) {
        toast.error("양식을 올리지 못했어요", { description: data.error });
        return;
      }
      toast.success(`‘${data.template.name}’ 양식을 올렸어요`);
      setTemplateId(data.template.id);
      onTemplatesChange();
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(id: string) {
    await fetch(`/api/hwpx/templates?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (templateId === id) setTemplateId("");
    onTemplatesChange();
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="hwpx-template" className="font-medium">
          한글 양식
        </label>
        <select id="hwpx-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={selectClass}>
          <option value="">한국외대 학위논문 양식 (기본)</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5 rounded-lg border border-dashed p-3">
        <p className="font-medium">내 양식 올리기</p>
        <p className="text-xs text-muted-foreground">
          외대 양식(논문양식.hwpx)을 한글에서 열어 글꼴·크기·여백 같은 스타일을 바꾸고 저장한 .hwpx 파일을 올리면, 그
          양식으로 만들어요. 제목·본문·장·절·각주·참고문헌 예시 문단이 없는 다른 양식은 쓸 수 없어요.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".hwpx"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <Button variant="outline" size="sm" className="w-fit" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          {busy === "upload" ? <Loader2 className="animate-spin" /> : <Upload />}
          {busy === "upload" ? "양식 검사 중…" : "hwpx 양식 파일 고르기"}
        </Button>
        {templates.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1 text-xs">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <span className="truncate">{t.name}</span>
                <Button size="icon-xs" variant="ghost" className="ml-auto" onClick={() => remove(t.id)} aria-label="양식 지우기">
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
