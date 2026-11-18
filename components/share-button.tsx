"use client";

import { useState, useTransition } from "react";
import { Copy, FolderUp, Link2, Link2Off, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { disableShare, enableShare, sendToDriveShare, shareStatus } from "@/app/share-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { GUEST_NOTICE, useGuest } from "@/components/use-guest";
import type { ShareKind } from "@/lib/shares";

/** 공유 버튼: "공유해도 되는 자료"로 표시 → 읽기 전용 링크 복사 / 공유 끄기 / 드라이브 공유 폴더로 보내기 */
export function ShareButton({
  kind,
  id,
  title,
  online,
  size = "sm",
}: {
  kind: ShareKind;
  id: string;
  title: string;
  online: boolean;
  size?: "sm" | "xs";
}) {
  const guest = useGuest();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();
  const what = kind === "source" ? "자료" : "프로젝트";

  function openDialog() {
    setOpen(true);
    startTransition(async () => {
      const r = await shareStatus(kind, id);
      if (r.ok) setUrl(r.url);
      setLoaded(true);
    });
  }

  const turnOn = () =>
    startTransition(async () => {
      const r = await enableShare(kind, id);
      if (!r.ok) return void toast.error("공유 링크를 만들지 못했어요", { description: r.error });
      setUrl(r.url);
      await navigator.clipboard.writeText(r.url).catch(() => {});
      toast.success("공유 링크를 만들고 복사했어요", { description: "받은 사람은 제목·출처·서지·AI 요약만 볼 수 있어요." });
    });

  const turnOff = () =>
    startTransition(async () => {
      const r = await disableShare(kind, id);
      if (!r.ok) return void toast.error("공유를 끄지 못했어요", { description: r.error });
      setUrl(null);
      toast.success("공유를 껐어요", { description: "예전 링크는 이제 열리지 않아요." });
    });

  const toDrive = () =>
    startTransition(async () => {
      const r = await sendToDriveShare(kind, id);
      if (!r.ok) return void toast.error("드라이브로 보내지 못했어요", { description: r.error });
      const s = await shareStatus(kind, id);
      if (s.ok) setUrl(s.url);
      toast.success("드라이브 ‘논문작업실/공유’ 폴더에 넣었어요", { description: r.file });
    });

  return (
    <>
      <Button size={size} variant="outline" onClick={openDialog} title={guest ? GUEST_NOTICE : `${what} 공유`} disabled={guest}>
        <Share2 />
        공유
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>공유 · {title}</DialogTitle>
            <DialogDescription>
              ‘공유해도 되는 {what}’로 표시하면 읽기 전용 링크가 생겨요. 링크를 받은 사람은 로그인 없이{" "}
              <b>제목 · 출처 · 서지 · AI 요약</b>만 볼 수 있고, 본문·메모·결정은 보이지 않아요.
            </DialogDescription>
          </DialogHeader>
          {!loaded ? (
            <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
          ) : url ? (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <Input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="공유 링크" />
                <Button
                  onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("링크를 복사했어요"))}
                  className="shrink-0"
                >
                  <Copy /> 링크 복사
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={turnOff} disabled={pending}>
                  <Link2Off /> 공유 끄기
                </Button>
                <Button variant="outline" size="sm" onClick={toDrive} disabled={pending || online} title={online ? "내 컴퓨터에서만 돼요" : undefined}>
                  <FolderUp /> 드라이브 공유 폴더로 보내기{online && " (내 컴퓨터에서만)"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={turnOn} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Link2 />}
                공유해도 되는 {what}로 표시하고 링크 만들기
              </Button>
              {!online && (
                <Button variant="outline" onClick={toDrive} disabled={pending}>
                  <FolderUp /> 드라이브 공유 폴더로 보내기
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
