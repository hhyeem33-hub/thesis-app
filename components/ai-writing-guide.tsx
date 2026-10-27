"use client";

import { useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AiWritingGuide({ projectName }: { projectName: string }) {
  const commands = [
    `${projectName} 프로젝트로 "주제를 여기에" 주제 논문 초안 써줘`,
    `/hufs-thesis-hwpx ${projectName} 프로젝트로 "주제를 여기에" 주제 논문 초안 써줘. 전공은 ○○학과, 이름은 ○○○`,
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" />
          AI 글쓰기 방법
        </CardTitle>
        <CardDescription>
          AI가 외대 학위논문 양식으로 초안을 써서 한글(hwpx) 파일로 드라이브의
          &lsquo;AI 작성글&rsquo; 폴더에 저장해요.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ol className="flex flex-col gap-1.5 text-sm">
          <li>
            <b>1.</b> 이 앱 폴더(thesis-app)에서 <b>Claude Code</b>를 열어요.
          </li>
          <li>
            <b>2.</b> 아래 명령을 복사해서 붙여넣어요. 따옴표 안의 주제는 바꿔도 돼요.
          </li>
          <li>
            <b>3.</b> 몇 분 뒤 이 화면을 새로고침하면 표의 &lsquo;AI 작성글&rsquo; 숫자가
            늘어나요. 숫자를 누르면 폴더가 열려요.
          </li>
        </ol>
        {commands.map((command) => (
          <CommandBox key={command} command={command} />
        ))}
      </CardContent>
    </Card>
  );
}

function CommandBox({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    // 클릭 직후 바로 복사한다. 클립보드 API는 권한 대기로 멈출 수 있어 예비로만 쓴다.
    const area = document.createElement("textarea");
    area.value = command;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (!ok) navigator.clipboard?.writeText(command).catch(() => {});
    setCopied(true);
    toast.success("명령을 복사했어요", { description: "Claude Code 입력창에 붙여넣어 주세요." });
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border bg-muted/50 p-3">
      <code className="flex-1 font-mono text-sm leading-relaxed break-all">{command}</code>
      <Hint label="명령을 클립보드에 복사해요">
        <Button size="sm" variant="outline" onClick={copy} aria-label="명령 복사">
          {copied ? <Check /> : <Copy />}
          {copied ? "복사됨" : "복사"}
        </Button>
      </Hint>
    </div>
  );
}
