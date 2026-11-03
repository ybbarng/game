import {
  B,
  cubeTopology,
  D,
  F,
  FACE_NAMES,
  L,
  OPPOSITE_FACE,
  type PieceKind,
  R,
  U,
} from "./topology";

/**
 * 조각 묶음 이름표(일부만 섞기·가리기·배우기가 쓴다).
 * 조각 번호는 조각 "자리" 번호다. 맞춘 상태에서 그 자리에 있던 조각을 가리킨다.
 */

/** 조각 자리가 닿은 면들 */
export function pieceFaces(n: number, piece: number): number[] {
  const topo = cubeTopology(n);
  return (topo.pieces[piece]?.stickers ?? []).map(
    (s) => topo.stickers[s]?.face as number,
  );
}

const NAME_ORDER = [U, D, F, B, R, L];

/** 사람이 읽는 조각 이름: 닿은 면 이름을 U·D, F·B, R·L 차례로(예: UFR, FR, U) */
export function pieceName(n: number, piece: number): string {
  const faces = pieceFaces(n, piece);
  return NAME_ORDER.filter((f) => faces.includes(f))
    .map((f) => FACE_NAMES[f])
    .join("");
}

export function piecesOfKind(n: number, ...kinds: PieceKind[]): number[] {
  const out: number[] = [];
  cubeTopology(n).pieces.forEach((p, i) => {
    if (kinds.includes(p.kind)) out.push(i);
  });
  return out;
}

export interface CubeGroups {
  /** 십자: 바닥 면(crossFace)에 닿은 모서리(큰 큐브는 날개까지) */
  readonly cross: readonly number[];
  /** 첫 층 꼭짓점: 바닥 면에 닿은 꼭짓점 */
  readonly firstLayerCorners: readonly number[];
  /** 가운데 층 모서리: 바닥 면에도 맞은편 면에도 닿지 않는 모서리 */
  readonly middleEdges: readonly number[];
  /** 가운데 조각(정가운데와 안쪽 가운데 모두) */
  readonly centers: readonly number[];
  /** F2L: 십자 + 첫 층 꼭짓점 + 가운데 층 모서리 + 가운데 */
  readonly f2l: readonly number[];
  readonly lastLayerCorners: readonly number[];
  readonly lastLayerEdges: readonly number[];
  /** 마지막 층: 맞은편 면에 닿은 꼭짓점과 모서리 */
  readonly lastLayer: readonly number[];
  /** F2L 짝: 첫 층 꼭짓점과 그 위 가운데 층 모서리(큰 큐브는 날개 여럿) */
  readonly f2lPairs: readonly {
    readonly corner: number;
    readonly edges: readonly number[];
  }[];
}

/**
 * 층별 조각 묶음. `crossFace`는 십자를 만드는 면(기본 U = 흰색).
 * CFOP처럼 흰 십자를 아래에 두고 푸는 것은 화면이 큐브를 돌려(z2) 보여 줄 일이고,
 * 묶음은 스티커 색(맞춘 상태의 면)으로 정해진다.
 */
export function cubeGroups(n: number, crossFace: number = U): CubeGroups {
  const top = OPPOSITE_FACE[crossFace as 0] as number;
  const topo = cubeTopology(n);
  const cross: number[] = [];
  const firstLayerCorners: number[] = [];
  const middleEdges: number[] = [];
  const centers: number[] = [];
  const lastLayerCorners: number[] = [];
  const lastLayerEdges: number[] = [];
  topo.pieces.forEach((p, i) => {
    const faces = pieceFaces(n, i);
    const atBottom = faces.includes(crossFace);
    const atTop = faces.includes(top);
    if (p.kind === "center" || p.kind === "innerCenter") centers.push(i);
    else if (p.kind === "corner") {
      (atBottom ? firstLayerCorners : lastLayerCorners).push(i);
    } else if (atBottom) cross.push(i);
    else if (atTop) lastLayerEdges.push(i);
    else middleEdges.push(i);
  });
  const sides = (piece: number) =>
    pieceFaces(n, piece).filter((f) => f !== crossFace && f !== top);
  const f2lPairs = firstLayerCorners.map((corner) => {
    const s = sides(corner);
    return {
      corner,
      edges: middleEdges.filter((e) => {
        const es = sides(e);
        return s.every((f) => es.includes(f));
      }),
    };
  });
  return {
    cross,
    firstLayerCorners,
    middleEdges,
    centers,
    f2l: [...cross, ...firstLayerCorners, ...middleEdges, ...centers].sort(
      (a, b) => a - b,
    ),
    lastLayerCorners,
    lastLayerEdges,
    lastLayer: [...lastLayerCorners, ...lastLayerEdges].sort((a, b) => a - b),
    f2lPairs,
  };
}

/** 면 이름 → 면 번호(U R F D L B) */
export const FACE_INDEX: Readonly<Record<string, number>> = {
  U,
  R,
  F,
  D,
  L,
  B,
};
