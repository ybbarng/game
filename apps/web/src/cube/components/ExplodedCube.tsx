"use client";

// 분해한 3×3(SVG, three.js 없음). 3D를 못 그리는 기기에서 큐브의 기초 맨 위 3D(CoreCube) 대신 보인다(docs/47 16-27).
// 해법 지도 시안(2026-11-25 사용자 「분해의 느낌이 덜 나」)에서 옮겼다. 3D(view/core-model.ts)와 같은 짜임을 작게 줄여
// 그린다: 가운데 심(여섯 축, 축 끝 나사·스프링), 센터 블럭 셋(위·앞·오른쪽, 몸통 아래 통), 위-앞 모서리 방향의 엣지 블럭
// 하나(안쪽 덩이와 두 센터 쪽으로 넓은 발), 위-앞-오른쪽 대각선 방향의 코너 블럭 하나(안쪽 덩이·목·둥근 발). 다리가
// 몸통 뒤에 숨지 않게 오른쪽 옆에서 조금 내려다본다. 조각마다 검은 몸통의 옆면이 보이고 스티커는 안쪽으로 작게 붙어
// 「블럭」으로 보인다. 비스듬히 본 그림이라 전개도가 아니다.
import type { ReactNode } from "react";

import { hexColor } from "../settings";

type V3 = [number, number, number];

/** 조각 몸통과 다리(어두운 바탕에서도 블럭 모양이 보이게 조금 밝은 검정) */
const BODY = "#2c2c33";
const BODY_EDGE = "#000";
/** 나사·스프링(쇠) */
const METAL = "#a9abb2";

/** 보는 방향: 앞(+z)에서 오른쪽으로 `YAW`, 위로 `PITCH`(도) */
const YAW = 150;
const PITCH = 24;

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: V3, b: V3, s = 1): V3 => [
  a[0] + b[0] * s,
  a[1] + b[1] * s,
  a[2] + b[2] * s,
];
const unit = (v: V3): V3 => {
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
};

/** 눈 쪽 방향(멀리서 평행하게 본다), 화면 오른쪽·위 */
function viewAxes(yawDeg: number, pitchDeg: number) {
  const t = (yawDeg * Math.PI) / 180;
  const p = (pitchDeg * Math.PI) / 180;
  const eye: V3 = [
    Math.cos(p) * Math.sin(t),
    Math.sin(p),
    Math.cos(p) * Math.cos(t),
  ];
  const right: V3 = [Math.cos(t), 0, -Math.sin(t)];
  const up: V3 = [
    -Math.sin(p) * Math.sin(t),
    Math.cos(p),
    -Math.sin(p) * Math.cos(t),
  ];
  return { eye, right, up };
}

/** 조각이 가운데에서 떨어지는 거리(닿은 바깥 면 수가 많을수록 멀리) */
const SPREAD: Record<number, number> = { 1: 1.9, 2: 2.6, 3: 3.2 };
const HALF = 0.42;
/** 3D(조각 0.97)보다 작게 줄인 비율 */
const K = HALF / 0.485;
/** 스티커는 면의 이만큼(안쪽으로 붙임) */
const STICKER = 0.74;

/**
 * 그릴 조각(맞춘 큐브 자리): 센터 블럭 셋(위·오른쪽·뒤, 보는 쪽에서 스티커가 보이는 셋), 엣지 블럭(위-앞),
 * 코너 블럭(위-앞-오른쪽)
 */
const PIECES: V3[] = [
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, -1],
  [0, 1, 1],
  [1, 1, 1],
];

/** 면 축·방향 → 설정 색 번호(U R F D L B) */
const FACE_COLOR: Record<string, number> = {
  "0,1": 1,
  "1,1": 0,
  "2,1": 2,
  "0,-1": 4,
  "1,-1": 3,
  "2,-1": 5,
};

export function ExplodedCube({
  colors,
  size = 96,
}: {
  /** 면 번호(U R F D L B)별 색(설정 colors) */
  colors: readonly number[];
  /** px, 또는 "100%"(부모 폭) */
  size?: number | string;
}) {
  const { eye, right, up } = viewAxes(YAW, PITCH);
  // 그린 점들의 범위(그림을 틀 가운데에 둔다)
  const box = { x0: 0, x1: 0, y0: 0, y1: 0 };
  const project = (p: V3): [number, number] => {
    const x = dot(p, right);
    const y = -dot(p, up);
    box.x0 = Math.min(box.x0, x);
    box.x1 = Math.max(box.x1, x);
    box.y0 = Math.min(box.y0, y);
    box.y1 = Math.max(box.y1, y);
    return [x, y];
  };
  /** 그릴 것과 깊이(클수록 눈에 가깝다). 먼 것부터 그린다 */
  const items: { depth: number; el: (key: number) => ReactNode }[] = [];
  const quad = (ps: [number, number][]) =>
    ps.map(([a, b]) => `${a.toFixed(3)},${b.toFixed(3)}`).join(" ");

  /** 굵은 막대(다리·축). 둥근 끝, 검은 테두리를 아래에 깔아 둘레가 보이게 */
  const rod = (a: V3, b: V3, w: number, color = BODY) => {
    const [x1, y1] = project(a);
    const [x2, y2] = project(b);
    const edge = color === BODY;
    items.push({
      depth: dot(add(a, b), eye) / 2,
      el: (key) => (
        <g key={key}>
          {edge && (
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={BODY_EDGE}
              strokeWidth={w + 0.08}
              strokeLinecap="round"
            />
          )}
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={color}
            strokeWidth={w}
            strokeLinecap="round"
          />
        </g>
      ),
    });
  };
  /** 축 방향으로 감긴 스프링(지그재그, 화면에서 축에 수직으로 흔든다) */
  const spring = (axis: V3, r0: number, r1: number) => {
    const side = unit(
      Math.abs(dot(axis, eye)) > 0.9 ? right : add(up, axis, -dot(up, axis)),
    );
    const wiggle = Math.abs(dot(axis, up)) > 0.7 ? right : side;
    const n = 12;
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++)
      pts.push(
        project(
          add(
            add([0, 0, 0], axis, r0 + ((r1 - r0) * i) / n),
            wiggle,
            i % 2 ? 0.09 : -0.09,
          ),
        ),
      );
    items.push({
      depth: dot(axis, eye) * ((r0 + r1) / 2),
      el: (key) => (
        <polyline
          key={key}
          points={quad(pts)}
          fill="none"
          stroke={METAL}
          strokeWidth={0.035}
          strokeLinejoin="round"
        />
      ),
    });
  };
  const disc = (at: V3, r: number) => {
    const [x, y] = project(at);
    items.push({
      depth: dot(at, eye),
      el: (key) => (
        <circle
          key={key}
          cx={x}
          cy={y}
          r={r}
          fill={BODY}
          stroke={BODY_EDGE}
          strokeWidth={0.04}
        />
      ),
    });
  };

  // 심: 가운데 덩이와 여섯 축, 축 끝 나사 기둥, 센터 블럭을 그린 세 축에 나사·스프링
  const ARM = 0.78 * K;
  disc([0, 0, 0], 0.26 * K);
  for (const d of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [-1, 0, 0],
    [0, -1, 0],
    [0, 0, -1],
  ] as V3[]) {
    const o: V3 = [0, 0, 0];
    rod(o, add(o, d, ARM), 0.09);
    rod(add(o, d, ARM - 0.17), add(o, d, ARM), 0.17);
    if (!PIECES.some((p) => dot(p, d) === 1 && dot(p, p) === 1)) continue;
    rod(add(o, d, ARM - 0.1), add(o, d, 1.55 * K), 0.05, METAL);
    spring(d, 1.18 * K, 1.54 * K);
    rod(add(o, d, 1.55 * K), add(o, d, 1.6 * K), 0.15, METAL);
  }

  for (const c of PIECES) {
    const n = Math.abs(c[0]) + Math.abs(c[1]) + Math.abs(c[2]);
    const k = SPREAD[n] ?? 2;
    const o: V3 = [c[0] * k, c[1] * k, c[2] * k];
    const inward = unit([-c[0], -c[1], -c[2]]);
    // 안쪽 생김새(길이는 3D 값에 K를 곱한 것)
    if (n === 1) {
      // 센터 블럭: 몸통 아래 나사가 지나는 통
      rod(add(o, inward, 0.45 * K), add(o, inward, 0.8 * K), 0.3);
    } else if (n === 2) {
      // 엣지 블럭: 안쪽 모서리 덩이와 두 센터 쪽(두 바깥 면 방향의 차)으로 넓은 발
      const foot = add(o, inward, (Math.SQRT2 - 0.395) * K);
      const wide = unit([0, c[1], -c[2]]);
      rod(add(o, inward, 0.55 * K), foot, 0.3);
      rod(add(foot, wide, -0.27 * K), add(foot, wide, 0.27 * K), 0.12);
    } else {
      // 코너 블럭: 안쪽 꼭짓점 덩이, 목, 작고 둥근 발
      const foot = add(o, inward, (Math.sqrt(3) - 0.3) * K);
      rod(add(o, inward, 0.7 * K), add(o, inward, 1.05 * K), 0.3);
      rod(add(o, inward, 1.05 * K), foot, 0.13);
      disc(foot, 0.15);
    }
    // 몸통: 눈 쪽을 보는 면만(볼록한 상자라 이 면끼리는 겹치지 않는다), 바깥 면이면 스티커
    const faces: {
      pts: [number, number][];
      sticker: [number, number][] | null;
      shade: number;
      fill: string;
    }[] = [];
    for (const axis of [0, 1, 2] as const)
      for (const sign of [1, -1]) {
        const nrm: V3 = [0, 0, 0];
        nrm[axis] = sign;
        const facing = dot(nrm, eye);
        if (facing <= 0.01) continue;
        // 면 위 두 방향(축이 아닌 두 축)
        const ua: V3 = [0, 0, 0];
        ua[(axis + 1) % 3] = 1;
        const ub: V3 = [0, 0, 0];
        ub[(axis + 2) % 3] = 1;
        const corner = (s: number, u: number, v: number) =>
          project(
            add(add(add(o, nrm, HALF), ua, u * HALF * s), ub, v * HALF * s),
          );
        const ring = (s: number) => [
          corner(s, -1, -1),
          corner(s, 1, -1),
          corner(s, 1, 1),
          corner(s, -1, 1),
        ];
        const outer = c[axis] === sign;
        faces.push({
          pts: ring(1),
          sticker: outer ? ring(STICKER) : null,
          shade: 0.45 * (1 - facing),
          fill: outer
            ? hexColor(colors[FACE_COLOR[`${axis},${sign}`] ?? 0] as number)
            : BODY,
        });
      }
    items.push({
      depth: dot(o, eye),
      el: (key) => (
        <g key={key}>
          {faces.map((f, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 한 상자의 면(바뀌지 않음)
            <g key={i}>
              <polygon
                points={quad(f.pts)}
                fill={BODY}
                stroke={BODY_EDGE}
                strokeWidth={0.05}
                strokeLinejoin="round"
              />
              {f.shade > 0 && (
                <polygon
                  points={quad(f.pts)}
                  fill="#000"
                  fillOpacity={f.shade}
                />
              )}
              {f.sticker && (
                <>
                  <polygon
                    points={quad(f.sticker)}
                    fill={f.fill}
                    stroke={BODY_EDGE}
                    strokeWidth={0.05}
                    strokeLinejoin="round"
                  />
                  {/* 스티커는 몸통보다 덜 어둡게(흰 스티커가 회색으로 보이지 않게) */}
                  <polygon
                    points={quad(f.sticker)}
                    fill="#000"
                    fillOpacity={f.shade * 0.4}
                  />
                </>
              )}
            </g>
          ))}
        </g>
      ),
    });
  }
  items.sort((a, b) => a.depth - b.depth);
  const side = Math.max(box.x1 - box.x0, box.y1 - box.y0) + 0.8;
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const view = [cx - side / 2, cy - side / 2, side, side]
    .map((v) => v.toFixed(3))
    .join(" ");
  return (
    <svg
      viewBox={view}
      width={size}
      // 폭을 글로 받으면 높이는 viewBox 비율(정사각형)대로
      height={typeof size === "number" ? size : undefined}
      className="block"
      aria-hidden
      data-cube-exploded
    >
      {items.map((it, i) => it.el(i))}
    </svg>
  );
}
