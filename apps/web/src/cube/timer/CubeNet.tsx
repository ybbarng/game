import { DEFAULT_FACE_COLORS } from "@game/cube-engine";
import { useMemo } from "react";

import { scrambledNet } from "./net";

/** 섞인 모습 펼친 그림(SVG). 공식을 읽지 못하면 아무것도 그리지 않는다 */
export function CubeNet({ n, scramble }: { n: number; scramble: string }) {
  const stickers = useMemo(() => {
    try {
      return scrambledNet(n, scramble);
    } catch {
      return null;
    }
  }, [n, scramble]);
  if (!stickers) return null;
  // 면 사이에 스티커 0.3칸 틈을 둔다
  const gap = 0.3;
  const pos = (v: number) => v + Math.floor(v / n) * gap;
  const w = 4 * n + 3 * gap;
  const h = 3 * n + 2 * gap;
  return (
    <svg
      viewBox={`-0.1 -0.1 ${w + 0.2} ${h + 0.2}`}
      className="h-auto w-full max-w-xs sm:max-w-md"
      role="img"
      aria-label="섞인 모습 펼친 그림"
      data-cube-net
    >
      {stickers.map((s) => (
        <rect
          key={`${s.x}-${s.y}`}
          x={pos(s.x) + 0.04}
          y={pos(s.y) + 0.04}
          width={0.92}
          height={0.92}
          rx={0.12}
          fill={DEFAULT_FACE_COLORS[s.color]}
          stroke="#000"
          strokeWidth={0.04}
        />
      ))}
    </svg>
  );
}
