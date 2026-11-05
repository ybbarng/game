import type { CSSProperties } from "react";
import { shipOf } from "../format";
import type { GroupArt } from "../sky-art";

/** 칸마다 다른 성운 자리(같은 칸이면 늘 같다) */
function nebulaAt(square: number) {
  const h = (n: number) => {
    const a = Math.sin(square * 91.7 + n * 37.3) * 24634.6345;
    return a - Math.floor(a);
  };
  return {
    x1: 15 + h(1) * 70,
    y1: 20 + h(2) * 60,
    x2: 15 + h(3) * 70,
    y2: 20 + h(4) * 60,
    a: 0.22 + h(5) * 0.16,
  };
}

/** 별 칸의 바탕: 별자리 색 성운 두 덩이(칸마다 자리가 다르다) */
export function nebulaStyle(square: number, color: string): CSSProperties {
  const n = nebulaAt(square);
  const hex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return {
    background: `radial-gradient(ellipse 70% 55% at ${n.x1}% ${n.y1}%, ${color}${hex(n.a)} 0%, transparent 70%), radial-gradient(ellipse 50% 65% at ${n.x2}% ${n.y2}%, ${color}${hex(n.a * 0.6)} 0%, transparent 70%)`,
  };
}

/**
 * 별 칸 안의 별자리 선 조각: 그 별자리 그림을 이 별이 칸 가운데에 오게 옮겨 흐리게 깐다(칸 밖은 잘린다).
 * 같은 별자리의 다른 판 위 별은 작은 점으로, 주인이 있으면 주인 색으로 찍는다(내 별자리가 어디까지 모였는지)
 */
export function TileSky({
  art,
  square,
  owner,
}: {
  art: GroupArt;
  square: number;
  owner: (square: number) => number;
}) {
  const p = art.stars.get(square);
  if (!p) return null;
  const H = 62;
  return (
    <svg
      aria-hidden="true"
      viewBox={`${p.x - H} ${p.y - H} ${H * 2} ${H * 2}`}
      className="pointer-events-none absolute inset-0 size-full"
    >
      {art.segments.map(([a, b], i) => (
        <line
          // biome-ignore lint/suspicious/noArrayIndexKey: 선 토막 차례는 바뀌지 않는다
          key={i}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="#c7d2fe"
          strokeOpacity={0.22}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {art.extra.map((e) => (
        <circle
          key={`${e.x}-${e.y}`}
          cx={e.x}
          cy={e.y}
          r={2.2}
          fill="#e2e8f0"
          opacity={0.35}
        />
      ))}
      {[...art.stars.entries()].map(([sq, q]) => {
        if (sq === square) return null;
        const o = owner(sq);
        return (
          <circle
            key={sq}
            cx={q.x}
            cy={q.y}
            r={o >= 0 ? 5 : 3.6}
            fill={o >= 0 ? shipOf(o).color : "#e2e8f0"}
            opacity={o >= 0 ? 0.95 : 0.55}
          />
        );
      })}
    </svg>
  );
}
