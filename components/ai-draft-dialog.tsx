"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { generateDraft } from "@/app/actions";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Manuscript } from "@/lib/ai";
import type { DraftResult } from "@/lib/types";

type Done = Extract<DraftResult, { ok: true }>;

/** 원고를 1. / 1.1. 번호가 붙은 읽기용 글로 바꾼다 */
function toPlainText(m: Manuscript) {
  const lines = [m.title, ""];
  m.chapters.forEach((ch, i) => {
    lines.push(`${i + 1}. ${ch.title}`, ...ch.blocks, "");
    ch.sections.forEach((sec, j) => lines.push(`${i + 1}.${j + 1}. ${sec.title}`, ...sec.blocks, ""));
  });
  lines.push("참고문헌", ...m.references);
  return lines.join("\n");
}

/** [보완 필요] 자리를 눈에 띄게 표시한다 */
function Highlighted({ text }: { text: string }) {
  return text.split(/(\[보완 필요[^\]]*\])/g).map((part, i) =>
    part.startsWith("[보완 필요") ? (
      <mark key={i} className="rounded bg-gold/25 px-0.5 font-medium text-foreground">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function ManuscriptView({ m }: { m: Manuscript }) {
  return (
    <article className="flex flex-col gap-3 text-sm leading-relaxed">
      <h3 className="font-heading text-lg font-semibold">{m.title}</h3>
      {m.chapters.map((ch, i) => (
        <section key={i} className="flex flex-col gap-2">
          <h4 className="font-heading text-base font-semibold">
            {i + 1}. {ch.title}
          </h4>
          {ch.blocks.map((b, k) => (
            <p key={k}><Highlighted text={b} /></p>
          ))}
          {ch.sections.map((sec, j) => (
            <div key={j} className="flex flex-col gap-2">
              <h5 className="font-semibold">
                {i + 1}.{j + 1}. {sec.title}
              </h5>
              {sec.blocks.map((b, k) => (
                <p key={k}><Highlighted text={b} /></p>
              ))}
            </div>
          ))}
        </section>
      ))}
      <section className="flex flex-col gap-1">
        <h4 className="font-heading text-base font-semibold">참고문헌</h4>
        {m.references.map((r, k) => (
          <p key={k} className="text-xs"><Highlighted text={r} /></p>
        ))}
      </section>
    </article>
  );
}

export function AiDraftDialog({
  projects,
  hasKey,
  onVercel,
}: {
  projects: { id: string; name: string }[];
  hasKey: boolean;
  /** 온라인(버셀)에서는 프로젝트 없이 주제만으로 쓰고 화면에만 보여 준다 */
  onVercel: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [topic, setTopic] = useState("");
  const [purpose, setPurpose] = useState("");
  const [method, setMethod] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (pending) return; // 쓰는 중에는 창을 닫지 않는다
    setOpen(next);
    if (!next) {
      setError(null);
      setDone(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const r = await generateDraft({
        projectId: onVercel ? undefined : projectId,
        topic,
        purpose,
        method,
      });
      if (!r.ok) {
        setError(r.error);
        toast.error("초안을 쓰지 못했어요", { description: r.error });
        return;
      }
      setDone(r);
      if (r.savedPath) toast.success("초안을 hwpx로 저장했어요", { description: r.savedPath });
      else toast.warning("초안을 썼어요", { description: r.saveNote });
    });
  }

  async function handleCopy() {
    if (!done) return;
    await navigator.clipboard.writeText(toPlainText(done.manuscript));
    toast.success("원고를 복사했어요");
  }

  // 버튼은 막지 않고, 창 안에서 무엇을 먼저 해야 하는지 알려 준다
  const blocker = !onVercel && !projects.length ? "project" : !hasKey ? "key" : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Hint label="주제를 적으면 AI가 외대 양식 논문 초안을 써요">
        <DialogTrigger render={<Button variant="outline" />}>
          <Sparkles />
          AI로 초안 쓰기
        </DialogTrigger>
      </Hint>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {done ? (
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>AI 초안</DialogTitle>
              <DialogDescription>
                금색 <mark className="rounded bg-gold/25 px-0.5 font-medium text-foreground">[보완 필요]</mark>는
                AI가 확실하지 않아 비워 둔 출처·통계예요. 직접 확인해서 채워 주세요.
              </DialogDescription>
            </DialogHeader>
            {done.savedPath ? (
              <p className="inline-flex items-start gap-1.5 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                <span>외대 양식 hwpx로 저장했어요: <span className="break-all">{done.savedPath}</span></span>
              </p>
            ) : (
              <p className="inline-flex items-start gap-1.5 rounded-md bg-gold/15 px-3 py-2 text-sm text-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span className="break-all">{done.saveNote}</span>
              </p>
            )}
            <div className="rounded-lg border bg-card p-4">
              <ManuscriptView m={done.manuscript} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDone(null)}>
                다시 쓰기
              </Button>
              <Button type="button" variant="outline" onClick={handleCopy}>
                <Copy />
                원고 복사
              </Button>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                닫기
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>AI로 초안 쓰기</DialogTitle>
              <DialogDescription>
                {onVercel ? (
                  <>
                    Claude가 한국외대 학위논문 양식에 맞춰 초안을 써서 화면에 보여 줘요. 온라인
                    미리보기라 주제만 적으면 되고, hwpx 파일은 저장하지 않아요. 1분쯤 걸려요.
                  </>
                ) : (
                  <>
                    Claude가 한국외대 학위논문 양식에 맞춰 초안을 써요. 내 컴퓨터에서는 드라이브의
                    &lsquo;AI 작성글&rsquo; 폴더에 hwpx로 저장돼요. 1분쯤 걸려요.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            {!onVercel && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="draft-project">프로젝트</Label>
                <select
                  id="draft-project"
                  value={projectId}
                  disabled={pending}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="draft-topic">주제</Label>
              <Input
                id="draft-topic"
                value={topic}
                maxLength={300}
                autoFocus
                disabled={pending}
                placeholder="예: 한·중 소비자의 수면 건강식품 소비 비교"
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="draft-purpose">연구 목적 (선택)</Label>
              <Textarea
                id="draft-purpose"
                value={purpose}
                maxLength={1000}
                rows={3}
                disabled={pending}
                placeholder="무엇을 밝히고 싶은지 적어 주세요. 비워 두면 AI가 제안해요."
                onChange={(e) => setPurpose(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="draft-method">연구 방법 (선택)</Label>
              <Textarea
                id="draft-method"
                value={method}
                maxLength={1000}
                rows={3}
                disabled={pending}
                placeholder="예: 설문조사, 심층 인터뷰, 내용 분석 등. 비워 두면 AI가 제안해요."
                onChange={(e) => setMethod(e.target.value)}
              />
            </div>

            {blocker && (
              <p className="rounded-md bg-gold/15 px-3 py-2 text-sm">
                {blocker === "key" ? (
                  <>
                    먼저 Claude API 키를 넣어 주세요.{" "}
                    <Link href="/settings" className="font-medium underline">
                      설정 → AI 연결로 가기
                    </Link>
                  </>
                ) : (
                  <>먼저 &lsquo;새 프로젝트&rsquo; 버튼으로 프로젝트를 만들어 주세요.</>
                )}
              </p>
            )}

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}{" "}
                {error.includes("API 키") && (
                  <Link href="/settings" className="underline">
                    설정으로 가기
                  </Link>
                )}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => handleOpenChange(false)}>
                취소
              </Button>
              <Button type="submit" disabled={pending || !topic.trim() || !!blocker}>
                {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {pending ? "AI가 쓰는 중… (1분쯤)" : "초안 쓰기"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
