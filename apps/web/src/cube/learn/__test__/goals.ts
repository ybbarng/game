// 시험 전용: 단원 「직접 해보기」의 목표(GOALS)를 3×3 시뮬레이터로 판정한다.
// 엔진이 만들 판정과 같은 뜻으로, 가운데 색을 기준으로 본다(흰 면이 위든 아래든 같다).
// 2×2 목표는 꼭짓점만 3×3 위에서 보고, 가운데 대신 큐브 전체 방향 24가지를 모두 맞춰 본다(goalMet 주석).
import type { GoalName } from "../types";
import { apply, type Cube, colorMap, key, solved } from "./sim";

const WHITE = 0;
const YELLOW = 3;

const ROTATIONS = ["", "x", "x2", "x'", "z", "z'"].flatMap((a) =>
  ["", "y", "y2", "y'"].map((b) => `${a} ${b}`.trim()),
);

/** 가운데 여섯이 맞춘 상태와 같아지게 큐브 전체를 돌린다 */
export function alignByCenters(c: Cube): Cube {
  const ref = colorMap(solved(3));
  for (const r of ROTATIONS) {
    const t = apply(c, r);
    const ok = t.stickers.every(
      (s) =>
        s.pos.filter((v) => v !== 0).length !== 1 ||
        ref.get(key(s.pos, s.normal)) === s.color,
    );
    if (ok) return t;
  }
  throw new Error("가운데가 맞지 않는다");
}

type Piece = { pos: string; stickers: { normal: string; color: number }[] };

function pieces(c: Cube): Piece[] {
  const m = new Map<string, Piece>();
  for (const s of c.stickers) {
    const pk = s.pos.join(",");
    const p = m.get(pk) ?? { pos: pk, stickers: [] };
    p.stickers.push({ normal: s.normal.join(","), color: s.color });
    m.set(pk, p);
  }
  return [...m.values()];
}

const REF = colorMap(solved(3));
const pieceSolved = (p: Piece) =>
  p.stickers.every((s) => REF.get(`${p.pos}|${s.normal}`) === s.color);
const colorsOf = (p: Piece) => p.stickers.map((s) => s.color);
const isEdge = (p: Piece) => p.stickers.length === 2;
const isCorner = (p: Piece) => p.stickers.length === 3;

// 맞춘 상태에서 그 조각이 가진 색으로 고른다(지금 자리와 상관없이)
const homeHas = (p: Piece, color: number) => colorsOf(p).includes(color);

function check(
  c: Cube,
  want: (p: Piece) => boolean,
  ok: (p: Piece) => boolean,
): boolean {
  return pieces(c).filter(want).every(ok);
}

const whiteCross = (c: Cube) =>
  check(c, (p) => isEdge(p) && homeHas(p, WHITE), pieceSolved);
const firstLayer = (c: Cube) => check(c, (p) => homeHas(p, WHITE), pieceSolved);
const secondLayer = (c: Cube) =>
  firstLayer(c) &&
  check(
    c,
    (p) => isEdge(p) && !homeHas(p, WHITE) && !homeHas(p, YELLOW),
    pieceSolved,
  );
// 노란 스티커가 노란 면(아래, 가운데 맞춘 뒤)을 보나
const yellowFacing = (p: Piece) =>
  p.stickers.every((s) => s.color !== YELLOW || s.normal === "0,-1,0");
const yellowCross = (c: Cube) =>
  secondLayer(c) &&
  check(c, (p) => isEdge(p) && homeHas(p, YELLOW), yellowFacing);
const oll = (c: Cube) =>
  secondLayer(c) && check(c, (p) => homeHas(p, YELLOW), yellowFacing);
const D_TURNS = ["", "D", "D2", "D'"];
const yellowCorners = (c: Cube) =>
  oll(c) &&
  D_TURNS.some((d) =>
    check(apply(c, d), (p) => isCorner(p) && homeHas(p, YELLOW), pieceSolved),
  );
const llDone = (c: Cube) =>
  D_TURNS.some((d) => check(apply(c, d), () => true, pieceSolved));

// 2×2: 꼭짓점만 본다(큐브 전체 방향은 goalMet에서 맞춘다)
const corners2 = (
  c: Cube,
  want: (p: Piece) => boolean,
  ok: (p: Piece) => boolean,
) => check(c, (p) => isCorner(p) && want(p), ok);

/** 지금 들고 있는 방향 그대로, 앞-오른쪽 칸(아래층)이 그 자리 가운데 색과 맞나 */
function pairInPlace(raw: Cube, slot: "FR" | "FL" | "BR" | "BL"): boolean {
  const x = slot.includes("R") ? 2 : -2;
  const z = slot.includes("F") ? 2 : -2;
  const centerColor = new Map<string, number>();
  for (const s of raw.stickers) {
    if (s.pos.filter((v) => v !== 0).length === 1)
      centerColor.set(s.normal.join(","), s.color);
  }
  return raw.stickers
    .filter((s) => s.pos[0] === x && s.pos[2] === z && s.pos[1] <= 0)
    .every((s) => centerColor.get(s.normal.join(",")) === s.color);
}

/**
 * size 2면 꼭짓점만 본다. 2×2에는 기준 가운데가 없으니 큐브 전체 방향(24가지)만 봐주고,
 * 층 돌리기(U·D 하나 남음)는 봐주지 않는다. 엔진 isSolved(면마다 한 색)와 같은 기준이다.
 */
export function goalMet(goal: GoalName, raw: Cube, size: 2 | 3 = 3): boolean {
  if (size === 2) {
    const anyRotation = (f: (x: Cube) => boolean) =>
      ROTATIONS.some((r) => f(apply(raw, r)));
    switch (goal) {
      case "solved":
        return anyRotation((x) => corners2(x, () => true, pieceSolved));
      case "2x2-first-layer":
        return anyRotation((x) =>
          corners2(x, (p) => homeHas(p, WHITE), pieceSolved),
        );
      case "2x2-top-face":
        return anyRotation(
          (x) =>
            corners2(x, (p) => homeHas(p, WHITE), pieceSolved) &&
            corners2(x, (p) => homeHas(p, YELLOW), yellowFacing),
        );
      case "2x2-first-face":
        return anyRotation((x) =>
          corners2(
            x,
            (p) => homeHas(p, WHITE),
            (p) =>
              p.stickers.every(
                (s) => s.color !== WHITE || s.normal === "0,1,0",
              ),
          ),
        );
      case "2x2-both-faces":
        return anyRotation((x) =>
          corners2(
            x,
            () => true,
            (p) =>
              p.stickers.every(
                (s) =>
                  (s.color !== WHITE || s.normal === "0,1,0") &&
                  (s.color !== YELLOW || s.normal === "0,-1,0"),
              ),
          ),
        );
      default:
        throw new Error(`2×2에서 보지 않는 목표: ${goal}`);
    }
  }
  const c = alignByCenters(raw);
  switch (goal) {
    case "solved":
      return check(c, () => true, pieceSolved);
    case "white-cross":
    case "cross":
      return whiteCross(c);
    case "first-layer":
      return firstLayer(c);
    case "second-layer":
    case "f2l":
      return secondLayer(c);
    case "f2l-pair:FR":
    case "f2l-pair:FL":
    case "f2l-pair:BR":
    case "f2l-pair:BL":
      return whiteCross(c) && pairInPlace(raw, goal.slice(-2) as "FR");
    case "yellow-cross":
      return yellowCross(c);
    case "oll":
      return oll(c);
    case "yellow-corners":
      return yellowCorners(c);
    case "ll":
      return llDone(c);
    default:
      throw new Error(`3×3에서 보지 않는 목표: ${goal}`);
  }
}
