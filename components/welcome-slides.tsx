"use client";

import { useEffect, useState } from "react";
import { BookMarked, ChevronLeft, ChevronRight, FileOutput, Library, Scale, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const SLIDES = [
  { icon: Sparkles, text: "자료 수집부터 외대 양식 한글 출력까지, 한 흐름으로" },
  { icon: Library, text: "KCI·CNKI·옵시디언·구글 드라이브·유튜브, 흩어진 자료를 한곳에" },
  { icon: Scale, text: "AI는 제안하고, 결정은 연구자가 — 관련도·근거·신뢰도" },
  { icon: BookMarked, text: "문장을 고르면 각주가, 각주를 달면 참고문헌이 자동으로" },
  { icon: FileOutput, text: "버튼 하나로 한국외대 학위논문 양식 HWPX" },
];
const INTERVAL = 4500;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * 첫 화면 슬라이드 5장: 4.5초마다 자동으로 넘어가고, 양옆 화살표·아래 점(•)·키보드 ←→ 로 직접 넘길 수 있다.
 * 색감: 짙은 에스프레소 바탕 + 주황 상자 + 골드 선 + 캐러멜 빛
 */
export function WelcomeSlides() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const go = (d: number) => setI((n) => (n + d + SLIDES.length) % SLIDES.length);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setI((n) => (n + 1) % SLIDES.length), INTERVAL);
    return () => clearTimeout(t);
  }, [i, paused]);

  const arrow =
    "flex size-9 items-center justify-center rounded-full border border-gold/50 bg-espresso/60 text-ivory backdrop-blur transition-colors hover:bg-gold hover:text-espresso focus-visible:outline-2 focus-visible:outline-gold";

  return (
    <section
      aria-roledescription="슬라이드"
      aria-label="논문작업실 소개"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative grid min-h-[22rem] overflow-hidden rounded-3xl bg-espresso text-ivory shadow-xl outline-none md:min-h-[26rem] md:grid-cols-[minmax(0,1fr)_17rem]"
    >
      {/* 캐러멜 조명 번짐 */}
      <span aria-hidden className="pointer-events-none absolute -top-32 -left-24 size-96 rounded-full bg-caramel/35 blur-3xl" />

      <div className="relative flex flex-col justify-between gap-8 p-8 md:p-12">
        <div className="relative grid">
          {SLIDES.map((s, n) => (
            <div
              key={n}
              role="group"
              aria-roledescription="슬라이드"
              aria-label={`${n + 1} / ${SLIDES.length}`}
              aria-hidden={n !== i}
              className={cn(
                "col-start-1 row-start-1 flex flex-col gap-5 transition-all duration-700 motion-reduce:transition-none",
                n === i ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
              )}
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-orange text-ivory shadow-lg shadow-black/30">
                <s.icon className="size-6" />
              </span>
              <span className="h-px w-16 bg-gold" aria-hidden />
              <h2 className="max-w-xl font-heading text-2xl leading-snug font-bold tracking-tight text-balance md:text-4xl">{s.text}</h2>
            </div>
          ))}
        </div>

        <div className="relative flex items-center gap-3">
          <button type="button" className={arrow} onClick={() => go(-1)} aria-label="이전 슬라이드">
            <ChevronLeft className="size-4" />
          </button>
          <div className="flex items-center gap-2" role="tablist" aria-label="슬라이드 고르기">
            {SLIDES.map((_, n) => (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={n === i}
                aria-label={`${n + 1}번 슬라이드`}
                onClick={() => setI(n)}
                className={cn("h-2 rounded-full transition-all", n === i ? "w-8 bg-orange" : "w-2 bg-ivory/35 hover:bg-ivory/60")}
              />
            ))}
          </div>
          <button type="button" className={arrow} onClick={() => go(1)} aria-label="다음 슬라이드">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* 오른쪽: 주황 상자 (큰 번호 + 골드 선) */}
      <div className="relative hidden flex-col justify-between bg-orange p-8 text-espresso md:flex">
        <span className="h-px w-full bg-espresso/25" aria-hidden />
        <div className="flex flex-col items-center gap-2">
          <span className="font-heading text-7xl font-bold tabular-nums">{pad(i + 1)}</span>
          <span className="text-xs font-semibold tracking-[0.4em]">/ {pad(SLIDES.length)}</span>
        </div>
        <p className="text-center text-[11px] font-semibold tracking-[0.35em]">논문작업실</p>
      </div>
    </section>
  );
}
