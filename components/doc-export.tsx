"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, Loader2, Save, Timer } from "lucide-react";
import { toast } from "sonner";
import { downloadHwpx, HwpxTemplates, type TemplateInfo } from "@/components/hwpx-export";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { checkPoints, exportName, outline, toDocx, toHtml, toMarkdown, type ExportDoc } from "@/lib/export-doc";
import { cn } from "@/lib/utils";

type Format = "pdf" | "hwpx" | "docx" | "html" | "md";

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** PDF: 인쇄용 창을 열고 인쇄 창을 띄운다 (대상: "PDF로 저장") */
function printPdf(html: string) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.onload = () => w.print();
  setTimeout(() => w.print(), 600);
  return true;
}

export function DocExport({
  doc,
  projectId,
  references,
  templates,
  online,
  dirty,
  saving,
  onTempSave,
  onSave,
  onTemplatesChange,
}: {
  doc: ExportDoc;
  projectId: string;
  references: string[];
  templates: TemplateInfo[];
  online: boolean;
  dirty: boolean;
  saving: boolean;
  onTempSave: () => void;
  onSave: () => void;
  onTemplatesChange: () => void;
}) {
  const [busy, setBusy] = useState<Format | null>(null);
  const [templateId, setTemplateId] = useState("");
  const check = checkPoints(doc, references);

  const formats: { id: Format; ext: string; name: string; note: string; off?: string }[] = [
    { id: "pdf", ext: "PDF", name: "PDF", note: "인쇄 창에서 ‘PDF로 저장’" },
    {
      id: "hwpx",
      ext: "HWPX",
      name: "한글",
      note: templateId ? "올린 내 양식으로" : "외대 학위논문 기본 양식",
      off: online ? "온라인에서는 안 돼요" : undefined,
    },
    { id: "docx", ext: "DOCX", name: "워드", note: "각주는 쪽 아래로" },
    { id: "html", ext: "HTML", name: "웹 문서", note: "브라우저로 바로 열기" },
    { id: "md", ext: "MD", name: "Markdown", note: "옵시디언에 붙여 넣기" },
  ];

  async function run(f: Format) {
    if (busy) return;
    const o = outline(doc, references);
    setBusy(f);
    try {
      if (f === "pdf") {
        if (!printPdf(toHtml(o, { print: true })))
          toast.error("새 창이 막혔어요", { description: "브라우저 주소창 오른쪽의 ‘팝업 차단’을 풀고 다시 눌러 주세요." });
        else toast.info("인쇄 창이 열렸어요", { description: "대상(프린터)을 ‘PDF로 저장’으로 바꾸고 저장을 누르세요." });
      } else if (f === "html") {
        saveBlob(new Blob([toHtml(o)], { type: "text/html;charset=utf-8" }), exportName(o.title, "html"));
      } else if (f === "md") {
        saveBlob(new Blob([toMarkdown(o)], { type: "text/markdown;charset=utf-8" }), exportName(o.title, "md"));
      } else if (f === "docx") {
        saveBlob(await toDocx(o), exportName(o.title, "docx"));
      } else if (f === "hwpx") {
        if (dirty) {
          toast.warning("먼저 저장해 주세요", { description: "한글 파일은 저장한 원고로 만들어요. 아래 ‘저장’이나 ‘임시저장’을 눌러 주세요." });
          return;
        }
        const r = await downloadHwpx(projectId, templateId);
        if (!r.ok) {
          toast.error("한글 파일을 만들지 못했어요", { description: r.error });
          return;
        }
        toast.success("한글(HWPX)을 내려받았어요", { description: r.name });
        return;
      }
      if (f !== "pdf") toast.success(`${formats.find((x) => x.id === f)!.name} 파일을 내려받았어요`);
    } catch (e) {
      toast.error("만들지 못했어요", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* 확인할 곳 */}
      <div className={cn("flex items-start gap-2 rounded-lg px-3 py-2", check.total ? "bg-gold/15" : "bg-success/10 text-success")}>
        {check.total ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-primary" /> : <CircleCheck className="mt-0.5 size-4 shrink-0" />}
        {check.total ? (
          <div>
            <p className="font-semibold">확인할 곳 {check.total}개</p>
            <p className="text-xs text-muted-foreground">
              [보완 필요] {check.need}개 · 출처 없는 각주 {check.noSource}개 — 그래도 내려받을 수 있어요.
            </p>
          </div>
        ) : (
          <p className="font-medium">확인할 곳이 없어요. 바로 내려받아도 돼요.</p>
        )}
      </div>

      {/* 형식: 파일 카드 */}
      <div className="grid grid-cols-2 gap-2">
        {formats.map((f) => {
          const disabled = !!f.off || (!!busy && busy !== f.id);
          const card = (
            <button
              key={f.id}
              type="button"
              disabled={disabled}
              onClick={() => run(f.id)}
              className={cn(
                "group relative flex w-full flex-col items-start gap-0.5 overflow-hidden rounded-lg border bg-card p-3 text-left transition-colors",
                "hover:border-gold hover:bg-secondary/60 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-border disabled:hover:bg-card",
                f.id === "pdf" && "col-span-2"
              )}
            >
              {/* 종이 모서리 접힘 */}
              <span aria-hidden className="absolute top-0 right-0 size-4 rounded-bl-md border-b border-l bg-secondary" />
              <span className="font-heading text-lg leading-tight font-bold tracking-wide text-primary">
                {busy === f.id ? <Loader2 className="size-5 animate-spin" /> : f.ext}
              </span>
              <span className="font-medium">{f.name}</span>
              <span className="text-xs text-muted-foreground">{f.off ?? f.note}</span>
            </button>
          );
          return f.off ? (
            <Hint key={f.id} label="한글 파일은 내 컴퓨터의 프로그램(파이썬)으로 만들어서, 내 컴퓨터에서 앱을 실행할 때만 돼요. 워드·PDF는 온라인에서도 돼요.">
              <span className="block">{card}</span>
            </Hint>
          ) : (
            card
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        지금 화면의 원고로 만들어요 (한글은 저장한 원고로). 장 제목은 <code>#</code>, 절은 <code>##</code>, 목은{" "}
        <code>###</code> 로 쓰면 1. / 1.1. / 1.1.1 번호가 붙어요.
      </p>

      {!online && (
        <details className="rounded-lg border border-dashed px-3 py-2">
          <summary className="cursor-pointer font-medium">한글 양식 고르기 · 내 양식 올리기</summary>
          <div className="mt-3">
            <HwpxTemplates templates={templates} templateId={templateId} setTemplateId={setTemplateId} onTemplatesChange={onTemplatesChange} />
          </div>
        </details>
      )}

      {/* 저장 */}
      <div className="flex flex-col gap-2 border-t pt-3">
        <p className="text-xs text-muted-foreground">
          <b>임시저장</b>은 지금 원고만 보관해서 다음에 이어 쓰게 해 줘요. <b>저장</b>은 히스토리에 버전으로 기록돼요.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={saving || !dirty} onClick={onTempSave}>
            <Timer />
            임시저장
          </Button>
          <Button className="flex-1" disabled={saving} onClick={onSave}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            저장
          </Button>
        </div>
      </div>
    </div>
  );
}
