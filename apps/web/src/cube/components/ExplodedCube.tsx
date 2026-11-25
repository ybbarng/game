"use client";

// 분해한 3×3(SVG, three.js 없음). 3D를 못 그리는 기기에서 큐브의 기초 맨 위 3D(CoreCube) 대신 보인다(docs/47 16-27).
// 해법 지도 시안(2026-11-25 사용자 「분해의 느낌이 덜 나」)에서 옮겼다. 가운데 심(센터 블럭 셋으로 뻗은 뼈대), 센터 블럭
// 셋(위·앞·오른쪽), 위-앞 모서리 방향의 엣지 블럭 하나, 위-앞-오른쪽 대각선 방향의 코너 블럭 하나. 조각마다 검은 몸통의
// 옆면이 보이고 스티커는 안쪽으로 작게 붙어 「블럭」으로 보인다. 비스듬히 본 그림이라 전개도가 아니다.
import { hexColor } from "../settings";

type V3 = [number, number, number];

/** 조각 몸통(어두운 바탕에서도 블럭 모양이 보이게 조금 밝은 검정) */
const BODY = "#2c2c33";
const BODY_EDGE = "#000";

/** 비스듬히 본 좌표(위-앞-오른쪽에서 내려다봄) */
function project([x, y, z]: V3): [number, number] {
  const c = Math.cos(Math.PI / 6);
  return [(x - z) * c, -y + (x + z) * 0.5];
}

/** 조각이 가운데에서 떨어지는 거리(닿은 바깥 면 수가 많을수록 멀리) */
const SPREAD: Record<number, number> = { 1: 1.9, 2: 2.6, 3: 3.2 };
const HALF = 0.42;
/** 스티커는 면의 이만큼(안쪽으로 붙임) */
const STICKER = 0.74;

/** 그릴 조각(맞춘 큐브 자리): 센터 블럭 셋(위·앞·오른쪽), 엣지 블럭(위-앞), 코너 블럭(위-앞-오른쪽) */
const PIECES: V3[] = [
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 0],
  [0, 1, 1],
  [1, 1, 1],
];

export function ExplodedCube({
  colors,
  size = 96,
}: {
  /** 면 번호(U R F D L B)별 색(설정 colors) */
  colors: readonly number[];
  /** px, 또는 "100%"(부모 폭) */
  size?: number | string;
}) {
  const place = (c: V3): V3 => {
    const k = SPREAD[Math.abs(c[0]) + Math.abs(c[1]) + Math.abs(c[2])] ?? 2;
    return [c[0] * k, c[1] * k, c[2] * k];
  };
  // 먼 것부터 그린다(보는 눈은 +x·+y·+z 쪽)
  const order = [...PIECES].sort(
    (a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]),
  );
  // 바깥 면(맞춘 큐브의 면)에만 스티커: +x 오른쪽 빨강(R=1), +y 위 흰(U=0), +z 앞 초록(F=2)
  const sticker = (c: V3, axis: 0 | 1 | 2) =>
    c[axis] === 1
      ? hexColor(colors[axis === 0 ? 1 : axis === 1 ? 0 : 2] as number)
      : null;
  const shapes: { points: string; fill: string; shade: number }[] = [];
  const quad = (ps: [number, number][]) =>
    ps.map(([a, b]) => `${a.toFixed(3)},${b.toFixed(3)}`).join(" ");
  for (const c of order) {
    const o = place(c);
    const at = (dx: number, dy: number, dz: number, s = 1) =>
      project([
        o[0] + dx * HALF * s,
        o[1] + dy * HALF * s,
        o[2] + dz * HALF * s,
      ]);
    // 보이는 면 셋(위·앞·오른쪽): 바깥 방향 축, 나머지 두 축의 ±1
    const faces: {
      axis: 0 | 1 | 2;
      shade: number;
      pts: (s: number) => [number, number][];
    }[] = [
      {
        axis: 1,
        shade: 0,
        pts: (s) => [at(-s, 1, -s), at(s, 1, -s), at(s, 1, s), at(-s, 1, s)],
      },
      {
        axis: 2,
        shade: 0.18,
        pts: (s) => [at(-s, s, 1), at(s, s, 1), at(s, -s, 1), at(-s, -s, 1)],
      },
      {
        axis: 0,
        shade: 0.36,
        pts: (s) => [at(1, s, s), at(1, s, -s), at(1, -s, -s), at(1, -s, s)],
      },
    ];
    for (const f of faces) {
      shapes.push({ points: quad(f.pts(1)), fill: BODY, shade: f.shade * 0.6 });
      const col = sticker(c, f.axis);
      if (col)
        shapes.push({
          points: quad(f.pts(STICKER)),
          fill: col,
          shade: f.shade,
        });
    }
  }
  // 심: 가운데에서 센터 블럭으로 뻗은 뼈대(조각보다 먼저 그린다)
  const reach = SPREAD[1] as number;
  const rods: [[number, number], [number, number]][] = (
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ] as V3[]
  ).map((d) => [
    project([-d[0] * reach, -d[1] * reach, -d[2] * reach]),
    project([d[0] * reach, d[1] * reach, d[2] * reach]),
  ]);
  const r = 3.6;
  return (
    <svg
      viewBox={`${-r} ${-r} ${r * 2} ${r * 2}`}
      width={size}
      // 폭을 글로 받으면 높이는 viewBox 비율(정사각형)대로
      height={typeof size === "number" ? size : undefined}
      className="block"
      aria-hidden
      data-cube-exploded
    >
      {rods.map(([a, b], i) => (
        <line
          // biome-ignore lint/suspicious/noArrayIndexKey: 축 셋(바뀌지 않음)
          key={i}
          x1={a[0]}
          y1={a[1]}
          x2={b[0]}
          y2={b[1]}
          stroke="#55555c"
          strokeWidth={0.22}
          strokeLinecap="round"
        />
      ))}
      <circle cx={0} cy={0} r={0.34} fill="#55555c" />
      {shapes.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 그리는 차례가 곧 열쇠다(바뀌지 않음)
        <g key={i}>
          <polygon
            points={p.points}
            fill={p.fill}
            stroke={BODY_EDGE}
            strokeWidth={0.05}
            strokeLinejoin="round"
          />
          {p.shade > 0 && (
            <polygon points={p.points} fill="#000" fillOpacity={p.shade} />
          )}
        </g>
      ))}
    </svg>
  );
}
