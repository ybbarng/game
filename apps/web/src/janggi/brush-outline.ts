/**
 * 붓 획 윤곽: 가운데 선의 점 [x, y, 굵기] 목록을 채워 그릴 SVG 경로로 바꾼다.
 * 점 사이는 Catmull-Rom 곡선으로 잇고, 굵기도 점마다 달리해 붓처럼 굵어졌다 가늘어지게 한다.
 * 열린 획의 양 끝은 붓끝 모양(`BrushTip`)으로 닫고, 닫힌 획(고리)은 바깥·안쪽 윤곽을 반대 방향으로 만들어 가운데에 구멍을 낸다.
 * 모든 열린 획을 같은 방향으로 돌려 두어, 겹쳐도(nonzero 채우기) 구멍이 생기지 않는다.
 */

export type BrushPoint = readonly [x: number, y: number, width: number];
/**
 * 붓끝 모양. round: 둥글게 멈춤, point: 가늘게 빠짐(삐침), flat: 붓을 눌러 댄 비스듬한 각
 */
export type BrushTip = "round" | "point" | "flat";
export type BrushStroke = {
  readonly pts: readonly BrushPoint[];
  readonly closed?: boolean;
  /** 시작 끝 모양(기본 round) */
  readonly start?: BrushTip;
  /** 마지막 끝 모양(기본 round) */
  readonly end?: BrushTip;
};

/** 뾰족한 끝이 마지막 점에서 획 방향으로 더 나가는 길이(그 점 굵기에 대한 비율) */
const POINT_REACH = 0.9;
/** 각진 끝에서 한쪽 모서리를 획 방향으로 미는 길이(굵기에 대한 비율) */
const FLAT_SLANT = 0.35;

type P = [number, number];
type P3 = [number, number, number];

/** 구간마다 나누는 점 수 */
const PER = 12;
/** 끝 반원을 나누는 수 */
const CAP = 8;

function sample(pts: readonly BrushPoint[], closed: boolean): P3[] {
  const n = pts.length;
  const at = (i: number): BrushPoint =>
    closed
      ? (pts[(i + n) % n] as BrushPoint)
      : (pts[Math.max(0, Math.min(n - 1, i))] as BrushPoint);
  const out: P3[] = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < PER; s++) {
      const t = s / PER;
      const t2 = t * t;
      const t3 = t2 * t;
      const v = (k: 0 | 1 | 2) =>
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([v(0), v(1), v(2)]);
    }
  }
  if (!closed) {
    const last = pts[n - 1] as BrushPoint;
    out.push([last[0], last[1], last[2]]);
  }
  return out;
}

function normals(c: P3[], closed: boolean): P[] {
  const n = c.length;
  return c.map((_, i) => {
    const a = c[closed ? (i - 1 + n) % n : Math.max(0, i - 1)] as P3;
    const b = c[closed ? (i + 1) % n : Math.min(n - 1, i + 1)] as P3;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  });
}

/** 다각형의 부호 있는 넓이(SVG 좌표에서 양수면 시계 방향) */
export function signedArea(poly: readonly P[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i] as P;
    const [x2, y2] = poly[(i + 1) % poly.length] as P;
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

const orient = (poly: P[], sign: 1 | -1): P[] =>
  Math.sign(signedArea(poly)) === sign ? poly : poly.slice().reverse();

/** 끝을 반원으로: 가운데 p, 반지름 r, 법선 각에서 dir 방향으로 반 바퀴 */
function cap(p: P3, n: P): P[] {
  const r = p[2] / 2;
  const a0 = Math.atan2(n[1], n[0]);
  const out: P[] = [];
  for (let j = 1; j < CAP; j++) {
    const a = a0 - (Math.PI * j) / CAP;
    out.push([p[0] + r * Math.cos(a), p[1] + r * Math.sin(a)]);
  }
  return out;
}

/** 획 하나의 윤곽 다각형들(고리는 [바깥, 안쪽]) */
export function strokePolygons(stroke: BrushStroke): P[][] {
  const closed = !!stroke.closed;
  const c = sample(stroke.pts, closed);
  const nm = normals(c, closed);
  const side = (k: 1 | -1): P[] =>
    c.map((p, i) => {
      const n = nm[i] as P;
      return [p[0] + (k * n[0] * p[2]) / 2, p[1] + (k * n[1] * p[2]) / 2];
    });
  const left = side(1);
  const right = side(-1);
  if (closed) {
    const [outer, inner] =
      Math.abs(signedArea(left)) > Math.abs(signedArea(right))
        ? [left, right]
        : [right, left];
    return [orient(outer, 1), orient(inner, -1)];
  }
  const last = c.length - 1;
  const n0 = nm[0] as P;
  const nl = nm[last] as P;
  const p0 = c[0] as P3;
  const pl = c[last] as P3;
  // 획 바깥쪽 방향: 끝은 진행 방향, 시작은 그 반대
  const outEnd: P = [nl[1], -nl[0]];
  const outStart: P = [-n0[1], n0[0]];
  const tip = (p: P3, n: P, out: P, kind: BrushTip): P[] => {
    if (kind === "point")
      return [
        [
          p[0] + out[0] * p[2] * POINT_REACH,
          p[1] + out[1] * p[2] * POINT_REACH,
        ],
      ];
    if (kind === "flat") return [];
    return cap(p, n);
  };
  const L = left.slice();
  const R = right.slice();
  // 각진 끝: 한쪽 모서리를 바깥으로 조금 밀어 눌러 댄 비스듬한 자국을 낸다
  const slant = (q: P, p: P3, out: P): P => [
    q[0] + out[0] * p[2] * FLAT_SLANT,
    q[1] + out[1] * p[2] * FLAT_SLANT,
  ];
  if (stroke.start === "flat") L[0] = slant(L[0] as P, p0, outStart);
  if (stroke.end === "flat") R[last] = slant(R[last] as P, pl, outEnd);
  return [
    orient(
      [
        ...L,
        ...tip(pl, nl, outEnd, stroke.end ?? "round"),
        ...R.reverse(),
        ...tip(p0, [-n0[0], -n0[1]], outStart, stroke.start ?? "round"),
      ],
      1,
    ),
  ];
}

/** 획들을 채워 그릴 SVG 경로 하나(소수 첫째 자리까지)와 윤곽의 [x, y, 너비, 높이] */
export function brushOutline(strokes: readonly BrushStroke[]): {
  d: string;
  box: readonly [number, number, number, number];
} {
  const f = (v: number) => Math.round(v * 10) / 10;
  const polys = strokes.flatMap(strokePolygons);
  const xs = polys.flat().map((p) => p[0]);
  const ys = polys.flat().map((p) => p[1]);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  return {
    d: polys
      .map((poly) => `M${poly.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z`)
      .join(""),
    box: [f(x0), f(y0), f(Math.max(...xs) - x0), f(Math.max(...ys) - y0)],
  };
}
