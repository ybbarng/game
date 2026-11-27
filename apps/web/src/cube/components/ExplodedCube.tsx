"use client";

// 분해한 큐브(SVG, three.js 없음). 3D를 못 그리는 기기에서 큐브의 기초 맨 위 3D(CoreCube) 대신 보인다(docs/47 16-27·16-36).
// 3D(view/core-model.ts·core-model-sizes.ts)와 같은 짜임을 작게 줄여 그린다. 다리가 몸통 뒤에 숨지 않게 오른쪽 뒤
// 위에서 조금 내려다본다. 조각마다 검은 몸통의 옆면이 보이고 스티커는 안쪽으로 작게 붙어 「블럭」으로 보인다. 비스듬히
// 본 그림이라 전개도가 아니다.
// - 3×3: 가운데 심(여섯 축, 축 끝 나사·스프링), 센터 블럭 셋(위·오른쪽·뒤, 몸통 아래 통), 위-앞 모서리 방향의 엣지 블럭
//   하나(안쪽 덩이와 두 센터 쪽으로 넓은 발), 위-앞-오른쪽 대각선 방향의 코너 블럭 하나(안쪽 덩이·목·둥근 발).
// - 2×2·4×4·5×5: 3D와 같은 자리(view/core-layout.ts)에 같은 조각. 굽은 발·머리는 납작한 판·막대로 줄여 그린다.
import type { ReactNode } from "react";

import { hexColor } from "../settings";
import {
  AXIS_VEC,
  type FaceAxis,
  FIXED_555,
  HIDDEN_222,
  type ModelSize,
  placedOf,
} from "../view/core-layout";

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

/** 조각이 가운데에서 떨어지는 거리(닿은 바깥 면 수가 많을수록 멀리, 3×3) */
const SPREAD: Record<number, number> = { 1: 1.9, 2: 2.6, 3: 3.2 };
const HALF = 0.42;
/** 3D(조각 0.97)보다 작게 줄인 비율 */
const K = HALF / 0.485;
/** 스티커는 면의 이만큼(안쪽으로 붙임) */
const STICKER = 0.74;

/**
 * 그릴 조각(맞춘 큐브 자리, 3×3): 센터 블럭 셋(위·오른쪽·뒤, 보는 쪽에서 스티커가 보이는 셋), 엣지 블럭(위-앞),
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

/** 그릴 것을 깊이와 함께 모으고(먼 것부터 그린다) 그림 범위를 잰다 */
class Painter {
  readonly items: { depth: number; el: (key: number) => ReactNode }[] = [];
  readonly box = { x0: 0, x1: 0, y0: 0, y1: 0 };
  private readonly view = viewAxes(YAW, PITCH);

  constructor(private readonly colors: readonly number[]) {}

  get eye(): V3 {
    return this.view.eye;
  }

  project(p: V3): [number, number] {
    const x = dot(p, this.view.right);
    const y = -dot(p, this.view.up);
    this.box.x0 = Math.min(this.box.x0, x);
    this.box.x1 = Math.max(this.box.x1, x);
    this.box.y0 = Math.min(this.box.y0, y);
    this.box.y1 = Math.max(this.box.y1, y);
    return [x, y];
  }

  static quad(ps: [number, number][]): string {
    return ps.map(([a, b]) => `${a.toFixed(3)},${b.toFixed(3)}`).join(" ");
  }

  /** 굵은 막대(다리·축). 둥근 끝, 검은 테두리를 아래에 깔아 둘레가 보이게 */
  rod(a: V3, b: V3, w: number, color = BODY): void {
    const [x1, y1] = this.project(a);
    const [x2, y2] = this.project(b);
    const edge = color === BODY;
    this.items.push({
      depth: dot(add(a, b), this.eye) / 2,
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
  }

  /** 축 방향으로 감긴 스프링(지그재그, 화면에서 축에 수직으로 흔든다) */
  spring(axis: V3, r0: number, r1: number): void {
    const { right, up } = this.view;
    const eye = this.eye;
    const side = unit(
      Math.abs(dot(axis, eye)) > 0.9 ? right : add(up, axis, -dot(up, axis)),
    );
    const wiggle = Math.abs(dot(axis, up)) > 0.7 ? right : side;
    const n = 12;
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++)
      pts.push(
        this.project(
          add(
            add([0, 0, 0], axis, r0 + ((r1 - r0) * i) / n),
            wiggle,
            i % 2 ? 0.09 : -0.09,
          ),
        ),
      );
    this.items.push({
      depth: dot(axis, eye) * ((r0 + r1) / 2),
      el: (key) => (
        <polyline
          key={key}
          points={Painter.quad(pts)}
          fill="none"
          stroke={METAL}
          strokeWidth={0.035}
          strokeLinejoin="round"
        />
      ),
    });
  }

  disc(at: V3, r: number): void {
    const [x, y] = this.project(at);
    this.items.push({
      depth: dot(at, this.eye),
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
  }

  /**
   * 상자(조각 몸통, 또는 다리의 판): 눈 쪽을 보는 면만(볼록한 상자라 이 면끼리는 겹치지 않는다). `outer`가 색을
   * 주는 면에 스티커
   */
  cuboid(
    o: V3,
    half: V3,
    outer: (axis: 0 | 1 | 2, sign: number) => boolean = () => false,
  ): void {
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
        const facing = dot(nrm, this.eye);
        if (facing <= 0.01) continue;
        // 면 위 두 방향(축이 아닌 두 축)
        const ia = ((axis + 1) % 3) as 0 | 1 | 2;
        const ib = ((axis + 2) % 3) as 0 | 1 | 2;
        const ua: V3 = [0, 0, 0];
        ua[ia] = 1;
        const ub: V3 = [0, 0, 0];
        ub[ib] = 1;
        const corner = (s: number, u: number, v: number) =>
          this.project(
            add(
              add(add(o, nrm, half[axis]), ua, u * half[ia] * s),
              ub,
              v * half[ib] * s,
            ),
          );
        const ring = (s: number) => [
          corner(s, -1, -1),
          corner(s, 1, -1),
          corner(s, 1, 1),
          corner(s, -1, 1),
        ];
        const isOuter = outer(axis, sign);
        faces.push({
          pts: ring(1),
          sticker: isOuter ? ring(STICKER) : null,
          shade: 0.45 * (1 - facing),
          fill: isOuter
            ? hexColor(
                this.colors[FACE_COLOR[`${axis},${sign}`] ?? 0] as number,
              )
            : BODY,
        });
      }
    this.items.push({
      depth: dot(o, this.eye),
      el: (key) => (
        <g key={key}>
          {faces.map((f, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 한 상자의 면(바뀌지 않음)
            <g key={i}>
              <polygon
                points={Painter.quad(f.pts)}
                fill={BODY}
                stroke={BODY_EDGE}
                strokeWidth={0.05}
                strokeLinejoin="round"
              />
              {f.shade > 0 && (
                <polygon
                  points={Painter.quad(f.pts)}
                  fill="#000"
                  fillOpacity={f.shade}
                />
              )}
              {f.sticker && (
                <>
                  <polygon
                    points={Painter.quad(f.sticker)}
                    fill={f.fill}
                    stroke={BODY_EDGE}
                    strokeWidth={0.05}
                    strokeLinejoin="round"
                  />
                  {/* 스티커는 몸통보다 덜 어둡게(흰 스티커가 회색으로 보이지 않게) */}
                  <polygon
                    points={Painter.quad(f.sticker)}
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
}

/** 3×3: 심과 센터 블럭 셋, 엣지 블럭·코너 블럭 하나씩(core-model.ts와 같은 짜임) */
function paint333(p: Painter): void {
  // 심: 가운데 덩이와 여섯 축, 축 끝 나사 기둥, 센터 블럭을 그린 세 축에 나사·스프링
  const ARM = 0.78 * K;
  p.disc([0, 0, 0], 0.26 * K);
  for (const d of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [-1, 0, 0],
    [0, -1, 0],
    [0, 0, -1],
  ] as V3[]) {
    const o: V3 = [0, 0, 0];
    p.rod(o, add(o, d, ARM), 0.09);
    p.rod(add(o, d, ARM - 0.17), add(o, d, ARM), 0.17);
    if (!PIECES.some((c) => dot(c, d) === 1 && dot(c, c) === 1)) continue;
    p.rod(add(o, d, ARM - 0.1), add(o, d, 1.55 * K), 0.05, METAL);
    p.spring(d, 1.18 * K, 1.54 * K);
    p.rod(add(o, d, 1.55 * K), add(o, d, 1.6 * K), 0.15, METAL);
  }

  for (const c of PIECES) {
    const n = Math.abs(c[0]) + Math.abs(c[1]) + Math.abs(c[2]);
    const k = SPREAD[n] ?? 2;
    const o: V3 = [c[0] * k, c[1] * k, c[2] * k];
    const inward = unit([-c[0], -c[1], -c[2]]);
    // 안쪽 생김새(길이는 3D 값에 K를 곱한 것)
    if (n === 1) {
      // 센터 블럭: 몸통 아래 나사가 지나는 통
      p.rod(add(o, inward, 0.45 * K), add(o, inward, 0.8 * K), 0.3);
    } else if (n === 2) {
      // 엣지 블럭: 안쪽 모서리 덩이와 두 센터 쪽(두 바깥 면 방향의 차)으로 넓은 발
      const foot = add(o, inward, (Math.SQRT2 - 0.395) * K);
      const wide = unit([0, c[1], -c[2]]);
      p.rod(add(o, inward, 0.55 * K), foot, 0.3);
      p.rod(add(foot, wide, -0.27 * K), add(foot, wide, 0.27 * K), 0.12);
    } else {
      // 코너 블럭: 안쪽 꼭짓점 덩이, 목, 작고 둥근 발
      const foot = add(o, inward, (Math.sqrt(3) - 0.3) * K);
      p.rod(add(o, inward, 0.7 * K), add(o, inward, 1.05 * K), 0.3);
      p.rod(add(o, inward, 1.05 * K), foot, 0.13);
      p.disc(foot, 0.15);
    }
    // 몸통: 바깥 면이면 스티커
    p.cuboid(o, [HALF, HALF, HALF], (axis, sign) => c[axis] === sign);
  }
}

/** 3D 좌표(조각 한 칸 = 1, 떼어 놓은 자리)를 그림 크기로 */
const k3 = (v: readonly number[]): V3 => [
  (v[0] as number) * K,
  (v[1] as number) * K,
  (v[2] as number) * K,
];
const sum = (...vs: (readonly number[])[]): V3 =>
  vs.reduce<V3>(
    (a, v) => [
      a[0] + (v[0] as number),
      a[1] + (v[1] as number),
      a[2] + (v[2] as number),
    ],
    [0, 0, 0],
  );
const D3 = 1 / Math.sqrt(3);
const DIAG: V3 = [D3, D3, D3];
const times = (v: readonly number[], s: number): V3 => [
  (v[0] as number) * s,
  (v[1] as number) * s,
  (v[2] as number) * s,
];

/** 3D 자리의 막대·원·판을 그림 크기로 그리는 도우미 */
function sized(p: Painter) {
  return {
    rod: (a: V3, b: V3, w: number, color?: string) =>
      p.rod(k3(a), k3(b), w, color),
    disc: (at: V3, r: number) => p.disc(k3(at), r * K),
    slab: (at: V3, half: V3) => p.cuboid(k3(at), k3(half)),
    /** 떼어 놓은 조각 몸통과 스티커 */
    cubie: (at: V3, faces: FaceAxis[]) =>
      p.cuboid(k3(at), [HALF, HALF, HALF], (axis, sign) =>
        faces.some((f) => (AXIS_VEC[f][axis] as number) === sign),
      ),
  };
}

/** 축 방향 → 그 면 */
const faceOf = (a: V3): FaceAxis => {
  const i = a.findIndex((v) => v !== 0);
  return `${(a[i] as number) > 0 ? "+" : "-"}${"xyz"[i]}` as FaceAxis;
};

/** 보이는 쪽(오른쪽·위·뒤) 세 축: 3×3처럼 이 셋의 센터 블럭과 나사를 그린다 */
const SHOWN_AXES: V3[] = [
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, -1],
];

/** 2×2: 축과 나사·스프링, 숨은 센터 블럭 셋, 숨은 엣지 블럭 하나, 코너 블럭 하나(core-model-sizes.ts build222) */
function paint222(p: Painter): void {
  const s = sized(p);
  s.disc([0, 0, 0], 0.12);
  for (const a of Object.values(AXIS_VEC)) {
    s.rod([0, 0, 0], times(a, 0.24), 0.07);
    s.rod(times(a, 0.16), times(a, 0.24), 0.1);
  }
  const c = HIDDEN_222.center;
  for (const a of SHOWN_AXES) {
    const head = 0.26 + c - 0.06;
    s.rod(times(a, 0.18), times(a, head), 0.035, METAL);
    p.spring(a, (head - 0.27) * K, (head - 0.01) * K);
    s.rod(times(a, head), times(a, head + 0.03), 0.1, METAL);
    // 숨은 센터 블럭: 나사가 지나는 통과 둥근 머리(판으로)
    s.rod(times(a, 0.26 + c), times(a, 0.44 + c), 0.12);
    const half: V3 = [0.24, 0.24, 0.24];
    half[a.findIndex((v) => v !== 0)] = 0.09;
    s.slab(times(a, 0.53 + c), half);
  }
  // 숨은 엣지 블럭(위-앞): 머리와 두 센터 블럭 머리 밑 혀
  const e: V3 = [0, HIDDEN_222.edge, HIDDEN_222.edge];
  const q = 0.53 / Math.SQRT2;
  s.rod(sum(e, [-0.24, q, q]), sum(e, [0.24, q, q]), 0.22);
  s.rod(sum(e, [-0.2, 0.39, 0.16]), sum(e, [0.2, 0.39, 0.16]), 0.08);
  s.rod(sum(e, [-0.2, 0.16, 0.39]), sum(e, [0.2, 0.16, 0.39]), 0.08);
  // 코너 블럭: 큰 몸통, 받침과 혀
  const co = placedOf(2, "corner");
  s.rod(
    sum(co.offset, times(DIAG, 0.31)),
    sum(co.offset, times(DIAG, 0.53)),
    0.16,
  );
  s.disc(sum(co.offset, times(DIAG, 0.31)), 0.12);
  s.cubie(sum(co.at, co.offset), co.faces);
}

/** 4×4: 홈 난 공, 센터 블럭·날개 둘·코너 블럭(core-model-sizes.ts build444) */
function paint444(p: Painter): void {
  const s = sized(p);
  s.disc([0, 0, 0], 0.5);
  // 홈 사이 길잡이 여덟
  for (const x of [1, -1])
    for (const y of [1, -1])
      for (const z of [1, -1])
        s.disc(times([x * D3, y * D3, z * D3], 0.72), 0.17);
  const ce = placedOf(4, "center");
  s.rod(
    sum(ce.offset, [0.11, 0.6, 0.11]),
    sum(ce.offset, [0.11, 1.05, 0.11]),
    0.12,
  );
  s.slab(sum(ce.offset, [0.2, 0.57, 0.2]), [0.18, 0.05, 0.18]);
  s.cubie(sum(ce.at, ce.offset), ce.faces);
  for (const name of ["wing-right", "wing-left"]) {
    const w = placedOf(4, name);
    const sx = w.at[0] > 0 ? 1 : -1;
    s.slab(sum(w.offset, [0.42 * sx, 0.82, 0.82]), [0.3, 0.18, 0.18]);
    // 안쪽 비둘기꼬리(넓게)와 코너 쪽 받침(가늘게)
    s.rod(
      sum(w.offset, [0.08 * sx, 0.74, 0.74]),
      sum(w.offset, [0.42 * sx, 0.72, 0.72]),
      0.2,
    );
    s.rod(
      sum(w.offset, [0.5 * sx, 0.84, 0.84]),
      sum(w.offset, [0.78 * sx, 0.8, 0.8]),
      0.09,
    );
    s.cubie(sum(w.at, w.offset), w.faces);
  }
  const co = placedOf(4, "corner");
  s.rod(
    sum(co.offset, times(DIAG, 1.36)),
    sum(co.offset, times(DIAG, 1.78)),
    0.2,
  );
  s.disc(sum(co.offset, times(DIAG, 1.33)), 0.2);
  s.cubie(sum(co.at, co.offset), co.faces);
}

/** 5×5: 축과 나사, 고정 센터 블럭 셋, 십자 쪽·대각선 쪽 센터 블럭, 가운데 엣지 블럭, 날개, 코너 블럭(build555) */
function paint555(p: Painter): void {
  const s = sized(p);
  s.disc([0, 0, 0], 0.35);
  for (const a of Object.values(AXIS_VEC)) {
    s.rod([0, 0, 0], times(a, 0.85), 0.1);
    s.rod(times(a, 0.65), times(a, 0.85), 0.16);
  }
  for (const a of SHOWN_AXES) {
    const head = 0.9 + FIXED_555 - 0.08;
    s.rod(times(a, 0.73), times(a, head), 0.05, METAL);
    s.rod(times(a, head), times(a, head + 0.05), 0.14, METAL);
    s.rod(times(a, 0.9 + FIXED_555), times(a, 1.38 + FIXED_555), 0.22);
    const half: V3 = [0.5, 0.5, 0.5];
    half[a.findIndex((v) => v !== 0)] = 0.07;
    s.slab(times(a, 1.44 + FIXED_555), half);
    s.cubie(times(a, 2 + FIXED_555), [faceOf(a)]);
  }
  const cr = placedOf(5, "cross");
  s.slab(sum(cr.offset, [0.6, 1.4, 0]), [0.13, 0.13, 0.18]);
  s.slab(sum(cr.offset, [0.36, 1.27, 0]), [0.14, 0.05, 0.2]);
  s.cubie(sum(cr.at, cr.offset), cr.faces);
  const xc = placedOf(5, "x");
  s.slab(sum(xc.offset, [0.66, 1.3, 0.66]), [0.2, 0.25, 0.2]);
  s.slab(sum(xc.offset, [0.36, 1.22, 0.36]), [0.13, 0.05, 0.13]);
  s.cubie(sum(xc.at, xc.offset), xc.faces);
  const me = placedOf(5, "mid-edge");
  s.slab(sum(me.offset, [0, 1.12, 1.12]), [0.18, 0.35, 0.35]);
  s.rod(
    sum(me.offset, [-0.2, 0.8, 0.8]),
    sum(me.offset, [0.2, 0.8, 0.8]),
    0.14,
  );
  s.cubie(sum(me.at, me.offset), me.faces);
  const wi = placedOf(5, "wing");
  const wd = unit([0.55, 1, 1]);
  s.slab(sum(wi.offset, [0.55, 1.19, 1.19]), [0.15, 0.31, 0.31]);
  s.rod(sum(wi.offset, times(wd, 1.0)), sum(wi.offset, times(wd, 1.45)), 0.1);
  s.rod(
    sum(wi.offset, [0.3, 0.68, 0.68]),
    sum(wi.offset, [0.62, 0.64, 0.64]),
    0.12,
  );
  s.cubie(sum(wi.at, wi.offset), wi.faces);
  const co = placedOf(5, "corner");
  s.rod(
    sum(co.offset, times(DIAG, 0.86)),
    sum(co.offset, times(DIAG, 2.62)),
    0.2,
  );
  s.disc(sum(co.offset, times(DIAG, 0.86)), 0.18);
  s.cubie(sum(co.at, co.offset), co.faces);
}

export function ExplodedCube({
  colors,
  size = 96,
  n = 3,
}: {
  /** 면 번호(U R F D L B)별 색(설정 colors) */
  colors: readonly number[];
  /** px, 또는 "100%"(부모 폭) */
  size?: number | string;
  /** 큐브 크기(2~5) */
  n?: ModelSize;
}) {
  const p = new Painter(colors);
  if (n === 2) paint222(p);
  else if (n === 4) paint444(p);
  else if (n === 5) paint555(p);
  else paint333(p);
  const { items, box } = p;
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
      data-cube-exploded={n}
    >
      {items.map((it, i) => it.el(i))}
    </svg>
  );
}
