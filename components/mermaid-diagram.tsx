"use client";

import { useEffect, useId, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function MermaidDiagram({ chart }: { chart: string }) {
  const id = "mermaid-" + useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          // 앱 주제 색(브라운·카멜·크림)에 맞춘 흐름도 색
          theme: "base",
          fontFamily: "inherit",
          themeVariables: {
            primaryColor: "#efe5d3",
            primaryTextColor: "#3d2f24",
            primaryBorderColor: "#8c6b4c",
            secondaryColor: "#fffdf8",
            tertiaryColor: "#fffdf8",
            lineColor: "#a7825a",
            textColor: "#3d2f24",
          },
        });
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled) setSvg(svg);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (failed)
    return (
      <p className="text-center text-sm text-muted-foreground">
        흐름도를 그리지 못했어요. 페이지를 새로고침(F5)해 보세요. 위의 사용법 3단계와 같은
        흐름이에요.
      </p>
    );
  if (!svg)
    return <Skeleton className="h-72 w-full" aria-label="흐름도 불러오는 중" />;
  return (
    <div
      className="flex justify-center overflow-x-auto [&_svg]:h-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
