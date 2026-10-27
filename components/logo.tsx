import { cn } from "@/lib/utils";

/** 펼친 책 위에 만년필 펜촉이 선 모양의 로고 그림. 책은 글자색(currentColor), 펜촉은 금색. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={cn("size-8", className)}
    >
      {/* 펼친 책: 왼쪽·오른쪽 쪽 */}
      <path
        d="M24 17.5C19.5 14 13 13 6 14.5v21c7-1.5 13.5-.5 18 3"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M24 17.5c4.5-3.5 11-4.5 18-3v21c-7-1.5-13.5-.5-18 3z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* 책장 줄 */}
      <path
        d="M10.5 20.5c3.5-.5 6.5 0 9 1.3M10.5 25.5c3.5-.5 6.5 0 9 1.3M37.5 20.5c-3.5-.5-6.5 0-9 1.3M37.5 25.5c-3.5-.5-6.5 0-9 1.3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* 만년필 펜촉 (책 가운데에 끝이 닿음) */}
      <path
        d="M24 31 18.6 19.2C18.2 13.8 20.4 8.6 24 4c3.6 4.6 5.8 9.8 5.4 15.2z"
        fill="var(--gold)"
      />
      <path d="M24 31V18.5" stroke="var(--sand)" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="24" cy="16.5" r="1.9" fill="var(--sand)" />
    </svg>
  );
}

/** 로고 그림 + "논문작업실" 글자. size="lg"는 홈 화면 맨 위용 */
export function Logo({
  size = "sm",
  className,
}: {
  size?: "sm" | "lg";
  className?: string;
}) {
  const large = size === "lg";
  return (
    <div className={cn("flex items-center", large ? "gap-4" : "gap-2.5", className)}>
      <LogoMark className={large ? "size-16 md:size-20" : "size-9"} />
      <div className="flex flex-col leading-none">
        <span
          className={cn(
            "font-serif font-bold tracking-tight",
            large ? "text-4xl md:text-5xl" : "text-lg"
          )}
        >
          논문작업실
        </span>
        <span
          className={cn(
            "font-medium tracking-[0.25em] text-gold",
            large ? "mt-3 text-sm" : "mt-1.5 text-[0.65rem]"
          )}
        >
          학위논문 작업 공간
        </span>
      </div>
    </div>
  );
}
