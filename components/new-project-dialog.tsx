"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { createProject } from "@/app/actions";
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
import { MAX_NAME_LENGTH, validateProjectName } from "@/lib/validate";

export function NewProjectDialog({ existingNames }: { existingNames: string[] }) {
  const router = useRouter();
  // 홈의 "새 프로젝트 만들기" 버튼은 /projects?new=1 로 와서 창을 바로 연다
  const requested = useSearchParams().get("new") === "1";
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const nameError = validateProjectName(name, existingNames);
  const shownError = touched || name ? nameError : null;

  function handleOpenChange(next: boolean) {
    if (pending) return; // 만드는 중에는 창을 닫지 않는다
    setOpen(next);
    if (!next) {
      setName("");
      setDescription("");
      setTouched(false);
      setServerError(null);
      if (requested) router.replace("/projects");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (nameError || pending) return;
    setServerError(null);
    const projectName = name.trim();
    startTransition(async () => {
      const result = await createProject({ name, description });
      if (!result.ok) {
        setServerError(result.error);
        toast.error("프로젝트를 만들지 못했어요", { description: result.error });
        return;
      }
      setOpen(false);
      setName("");
      setDescription("");
      setTouched(false);
      if (requested) router.replace("/projects");
      if (result.warning)
        toast.warning(`‘${projectName}’ 프로젝트를 만들었어요`, { description: result.warning });
      else
        toast.success(`‘${projectName}’ 프로젝트를 만들었어요`, {
          description: "옵시디언과 드라이브에 폴더가 생겼어요.",
        });
    });
  }

  return (
    <Dialog open={open || requested} onOpenChange={handleOpenChange}>
      <Hint label="이름과 설명을 입력해 새 프로젝트를 만들어요">
        <DialogTrigger render={<Button />}>
          <Plus />새 프로젝트
        </DialogTrigger>
      </Hint>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>새 프로젝트 만들기</DialogTitle>
            <DialogDescription>
              만들면 옵시디언과 구글 드라이브의 &lsquo;논문작업실&rsquo; 폴더 안에
              같은 이름의 폴더가 자동으로 생겨요.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">프로젝트 이름</Label>
            <Input
              id="project-name"
              value={name}
              maxLength={MAX_NAME_LENGTH + 10}
              placeholder="예: 2026 석사논문"
              autoFocus
              disabled={pending}
              aria-invalid={!!shownError}
              onChange={(e) => {
                setName(e.target.value);
                setServerError(null);
              }}
              onBlur={() => setTouched(true)}
            />
            {shownError ? (
              <p className="text-sm text-destructive">{shownError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                폴더 이름으로 쓰여요. \ / : * ? &quot; &lt; &gt; | # ^ [ ] 는 쓸 수 없어요.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="project-description">설명 (선택)</Label>
            <Textarea
              id="project-description"
              value={description}
              maxLength={500}
              rows={3}
              disabled={pending}
              placeholder="연구 주제나 메모를 간단히 적어 주세요."
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {serverError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => handleOpenChange(false)}
            >
              취소
            </Button>
            <Button type="submit" disabled={pending || (touched && !!nameError)}>
              {pending && <Loader2 className="animate-spin" />}
              {pending ? "만드는 중…" : "만들기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
