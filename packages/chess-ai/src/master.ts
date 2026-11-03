/*
 * 초고수만 쓰는 평가와 끝내기 지식(docs/26 3절).
 * 탐색 틀은 고수와 같은 expert.ts를 쓰고, `MASTER_TUNING`으로 평가·가지치기·끝내기 표를 바꾼다.
 *
 * 평가는 고수 평가(evaluateExpert)에 다음을 더한다
 * - 기동력: 나이트·비숍·룩·퀸이 갈 수 있는 칸 수(상대 폰이 노리는 칸은 빼고 센다)
 * - 킹 공격: 상대 킹 둘레를 노리는 기물이 둘 이상이고 퀸이 있으면 노리는 힘만큼 덤
 * - 전초기지: 내 폰이 받치고 상대 폰이 쫓아낼 수 없는 상대 진영의 나이트·비숍
 * - 7번째 줄의 룩
 * - 끝판의 통과한 폰: 내 킹은 가까이, 상대 킹은 멀리. 상대 기물이 없고 상대 킹이 따라잡지 못하면 큰 덤
 * - 킹+폰 대 킹: 승패표(kpk.ts)로 이기는 판이면 덤, 비기는 판은 0점
 * - 비기기 쉬운 끝판(폰 없이 마이너 기물 하나 차이, 서로 다른 색 비숍) 값은 줄인다
 */
import type { Board, Kind, Position, Side } from "@game/chess-engine";

import { evaluateExpert, type SearchTuning } from "./expert";
import { kpkWins } from "./kpk";
import { VALUE } from "./search";

const KNIGHT_STEPS = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
] as const;
const DIAGONAL = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;
const ORTHOGONAL = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** 칸마다 나이트가 갈 수 있는 칸 목록(평가가 자주 불려 미리 펴 둔다) */
const KNIGHT_TARGETS: readonly number[][] = Array.from(
  { length: 64 },
  (_, at) =>
    KNIGHT_STEPS.flatMap(([dx, dy]) => {
      const x = (at % 8) + dx;
      const y = (at >> 3) + dy;
      return x >= 0 && x < 8 && y >= 0 && y < 8 ? [y * 8 + x] : [];
    }),
);
/** 칸마다, 방향마다 끝까지 이어지는 칸 목록 */
function raysOf(
  dirs: readonly (readonly [number, number])[],
): readonly number[][][] {
  return Array.from({ length: 64 }, (_, at) =>
    dirs.map(([dx, dy]) => {
      const out: number[] = [];
      let x = (at % 8) + dx;
      let y = (at >> 3) + dy;
      while (x >= 0 && x < 8 && y >= 0 && y < 8) {
        out.push(y * 8 + x);
        x += dx;
        y += dy;
      }
      return out;
    }),
  );
}
const DIAGONAL_RAYS = raysOf(DIAGONAL);
const ORTHOGONAL_RAYS = raysOf(ORTHOGONAL);
const ALL_RAYS = raysOf([...DIAGONAL, ...ORTHOGONAL]);

/**
 * 킹 둘레: 킹 칸 둘레 8칸과 킹 자리, 그리고 킹 앞(상대 쪽)으로 두 칸 떨어진 세 칸.
 * `ZONE[side][king * 64 + at]`이 1이면 그 칸이 `side` 킹 둘레다
 */
const ZONE: Record<Side, Uint8Array> = { w: zoneTable("w"), b: zoneTable("b") };
function zoneTable(side: Side): Uint8Array {
  const out = new Uint8Array(64 * 64);
  const f = side === "w" ? -1 : 1;
  for (let k = 0; k < 64; k++) {
    const kx = k % 8;
    const ky = k >> 3;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const x = kx + dx;
        const y = ky + dy;
        if (x >= 0 && x < 8 && y >= 0 && y < 8) out[k * 64 + y * 8 + x] = 1;
      }
      const x = kx + dx;
      const y = ky + 2 * f;
      if (x >= 0 && x < 8 && y >= 0 && y < 8) out[k * 64 + y * 8 + x] = 1;
    }
  }
  return out;
}

/** 기동력 덤: [칸 하나의 값(중반), (끝판), 이만큼은 보통이라 0으로 보는 칸 수] */
const MOBILITY: Record<
  "N" | "B" | "R" | "Q",
  readonly [number, number, number]
> = {
  N: [4, 4, 4],
  B: [5, 5, 7],
  R: [2, 4, 7],
  Q: [1, 2, 14],
};
/** 킹 둘레를 노리는 기물의 무게 */
const ATTACK_WEIGHT: Record<"N" | "B" | "R" | "Q", number> = {
  N: 2,
  B: 2,
  R: 3,
  Q: 5,
};

const cheb = (a: number, b: number) =>
  Math.max(Math.abs((a % 8) - (b % 8)), Math.abs((a >> 3) - (b >> 3)));

/** 킹+폰 대 킹이 이기는 판일 때 더하는 값. 퀸으로 바꾼 판(약 900)보다는 낮게 둔다 */
const KPK_WIN = 400;

const WPA = new Uint8Array(64);
const BPA = new Uint8Array(64);
const W_MAX = new Int8Array(8);
const B_MIN = new Int8Array(8);

/** 초고수가 보는 판 값(`side` 쪽에서, 폰 100). `side`는 둘 차례 편이다 */
export function evaluateMaster(board: Board, side: Side): number {
  const base = evaluateExpert(board, side);
  // 판마다 새로 만들지 않고 비워서 다시 쓴다(평가는 한 수에 수십만 번 불린다)
  const wpa = WPA.fill(0); // 백 폰이 노리는 칸
  const bpa = BPA.fill(0);
  const wMax = W_MAX.fill(-1); // 줄마다 백 폰의 가장 큰 y(가장 뒤)
  const bMin = B_MIN.fill(8); // 줄마다 흑 폰의 가장 작은 y(가장 뒤)
  let wk = -1;
  let bk = -1;
  let wOff = 0;
  let bOff = 0;
  let wPawns = 0;
  let bPawns = 0;
  let wQueen = false;
  let bQueen = false;
  let pieces = 0;
  let pawnAt = -1;
  // 비숍 색과 나이트·룩·퀸 수(서로 다른 색 비숍 끝판을 가리려고)
  let wBishopColor = -1;
  let bBishopColor = -1;
  let wBishops = 0;
  let bBishops = 0;
  let wOthers = 0;
  let bOthers = 0;
  for (let at = 0; at < 64; at++) {
    const cell = board[at];
    if (!cell) continue;
    pieces++;
    const s = cell[0];
    const k = cell[1];
    const x = at % 8;
    const y = at >> 3;
    if (k === "P") {
      pawnAt = at;
      if (s === "w") {
        wPawns++;
        if (y > (wMax[x] as number)) wMax[x] = y;
        if (y > 0) {
          if (x > 0) wpa[(y - 1) * 8 + x - 1] = 1;
          if (x < 7) wpa[(y - 1) * 8 + x + 1] = 1;
        }
      } else {
        bPawns++;
        if (y < (bMin[x] as number)) bMin[x] = y;
        if (y < 7) {
          if (x > 0) bpa[(y + 1) * 8 + x - 1] = 1;
          if (x < 7) bpa[(y + 1) * 8 + x + 1] = 1;
        }
      }
    } else if (k === "K") {
      if (s === "w") wk = at;
      else bk = at;
    } else {
      const v = VALUE[k as Kind];
      if (s === "w") wOff += v;
      else bOff += v;
      if (k === "Q") {
        if (s === "w") wQueen = true;
        else bQueen = true;
      }
      if (k === "B") {
        const color = (x + y) % 2;
        if (s === "w") {
          wBishops++;
          wBishopColor = color;
        } else {
          bBishops++;
          bBishopColor = color;
        }
      } else if (s === "w") wOthers++;
      else bOthers++;
    }
  }
  if (wk < 0 || bk < 0) return base;

  // 킹+폰 대 킹: 승패표로 안다(비기는 판은 탐색이 probeMaster로 0점을 받는다)
  if (pieces === 3 && pawnAt >= 0) {
    const strong = (board[pawnAt] as string)[0] as Side;
    if (kpkWinsFor(board, strong, side)) {
      return base + (side === strong ? KPK_WIN : -KPK_WIN);
    }
    return base;
  }

  const endgame = wOff + bOff <= 1300;
  let w = 0; // 백 쪽에서 본 덤

  // 기동력·킹 공격·전초기지·7번째 줄 룩
  let wUnits = 0;
  let bUnits = 0;
  let wAttackers = 0;
  let bAttackers = 0;
  for (let at = 0; at < 64; at++) {
    const cell = board[at];
    if (!cell) continue;
    const k = cell[1];
    if (k === "P" || k === "K") continue;
    const s = cell[0] as Side;
    const white = s === "w";
    const kind = k as "N" | "B" | "R" | "Q";
    const enemyPawnAttack = white ? bpa : wpa;
    const zone = white ? ZONE.b : ZONE.w;
    const zoneBase = (white ? bk : wk) * 64;
    const x = at % 8;
    const y = at >> 3;
    let mob = 0;
    let hits = 0;
    if (kind === "N") {
      const targets = KNIGHT_TARGETS[at] as number[];
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i] as number;
        if (zone[zoneBase + t]) hits++;
        const target = board[t];
        if ((!target || target[0] !== s) && !enemyPawnAttack[t]) mob++;
      }
    } else {
      const rays = (
        kind === "B" ? DIAGONAL_RAYS : kind === "R" ? ORTHOGONAL_RAYS : ALL_RAYS
      )[at] as number[][];
      for (let r = 0; r < rays.length; r++) {
        const ray = rays[r] as number[];
        for (let i = 0; i < ray.length; i++) {
          const t = ray[i] as number;
          if (zone[zoneBase + t]) hits++;
          const target = board[t];
          if (!target) {
            if (!enemyPawnAttack[t]) mob++;
          } else {
            if (target[0] !== s && !enemyPawnAttack[t]) mob++;
            break;
          }
        }
      }
    }
    const [mg, eg, normal] = MOBILITY[kind];
    let v = (endgame ? eg : mg) * (mob - normal);
    if (hits > 0) {
      if (white) {
        wAttackers++;
        wUnits += ATTACK_WEIGHT[kind] + hits;
      } else {
        bAttackers++;
        bUnits += ATTACK_WEIGHT[kind] + hits;
      }
    }
    // 전초기지: 상대 진영(4~6번째 줄)에서 내 폰이 받치고, 상대 폰이 쫓아낼 수 없는 칸
    if (kind === "N" || kind === "B") {
      const deep = white ? y >= 2 && y <= 4 : y >= 3 && y <= 5;
      const supported = white ? wpa[at] : bpa[at];
      if (deep && supported) {
        let safe = true;
        for (let fx = x - 1; fx <= x + 1; fx += 2) {
          if (fx < 0 || fx > 7) continue;
          if (white ? (bMin[fx] as number) < y : (wMax[fx] as number) > y)
            safe = false;
        }
        if (safe) v += kind === "N" ? 25 : 12;
      }
    }
    // 7번째 줄의 룩: 상대 킹이 끝줄에 있거나 상대 폰이 그 줄에 남았을 때
    if (kind === "R") {
      const seventh = white ? 1 : 6;
      if (y === seventh) {
        const enemyKing = white ? bk : wk;
        const backRank = white ? 0 : 7;
        let pawnsThere = false;
        const enemyPawn = white ? "bP" : "wP";
        for (let fx = 0; fx < 8 && !pawnsThere; fx++)
          if (board[seventh * 8 + fx] === enemyPawn) pawnsThere = true;
        if (enemyKing >> 3 === backRank || pawnsThere) v += 20;
      }
    }
    w += white ? v : -v;
  }
  if (!endgame) {
    if (wAttackers >= 2 && wQueen) w += Math.min(wUnits * wUnits, 900) >> 2;
    if (bAttackers >= 2 && bQueen) w -= Math.min(bUnits * bUnits, 900) >> 2;
  }

  // 끝판의 통과한 폰
  if (endgame) {
    for (let at = 0; at < 64; at++) {
      const cell = board[at];
      if (cell !== "wP" && cell !== "bP") continue;
      const white = cell === "wP";
      const x = at % 8;
      const y = at >> 3;
      let passed = true;
      for (let fx = x - 1; fx <= x + 1 && passed; fx++) {
        if (fx < 0 || fx > 7) continue;
        // 앞쪽(같은 줄과 옆 줄)에 상대 폰이 있으면 통과한 폰이 아니다
        if (white ? (bMin[fx] as number) < y : (wMax[fx] as number) > y)
          passed = false;
      }
      if (!passed) continue;
      const own = white ? wk : bk;
      const enemy = white ? bk : wk;
      const front = white ? at - 8 : at + 8;
      const advanced = white ? 6 - y : y - 1; // 0~5
      let v = ((cheb(enemy, front) * 5 - cheb(own, front) * 2) * advanced) / 3;
      // 상대에 기물이 없고, 상대 킹이 승급 칸까지 폰보다 늦으면 막을 수 없다
      const enemyOfficers = white ? bOff : wOff;
      if (enemyOfficers === 0) {
        const promo = white ? x : 56 + x;
        let steps = white ? y : 7 - y;
        if (white ? y === 6 : y === 1) steps -= 1;
        let pathClear = true;
        for (let t = front; white ? t >= 0 : t < 64; t += white ? -8 : 8)
          if (board[t]) pathClear = false;
        const enemyToMove = side !== (white ? "w" : "b");
        if (pathClear && steps < cheb(enemy, promo) - (enemyToMove ? 1 : 0))
          v += 400;
      }
      w += white ? v : -v;
    }
  }

  let total = base + (side === "w" ? w : -w);
  // 비기기 쉬운 끝판은 값을 줄인다(그쪽으로 바꾸어 이긴다고 착각하지 않게)
  const lead = wOff - bOff;
  const strongPawns = lead > 0 ? wPawns : lead < 0 ? bPawns : 1;
  if (strongPawns === 0 && Math.abs(lead) <= 350) total = Math.trunc(total / 4);
  else if (
    wBishops === 1 &&
    bBishops === 1 &&
    wOthers === 0 &&
    bOthers === 0 &&
    wBishopColor !== bBishopColor
  )
    total = Math.trunc(total / 2);
  return total;
}

/** 위아래로 뒤집은 칸(흑 폰 판을 백 폰 판으로 바꿔 승패표를 본다) */
const flip = (at: number) => (7 - (at >> 3)) * 8 + (at % 8);

/** 킹+폰 대 킹에서 폰 가진 편(`strong`)이 이기는가. `toMove`는 둘 차례 */
function kpkWinsFor(board: Board, strong: Side, toMove: Side): boolean {
  let wk = -1;
  let bk = -1;
  let p = -1;
  for (let at = 0; at < 64; at++) {
    const cell = board[at];
    if (cell === "wK") wk = at;
    else if (cell === "bK") bk = at;
    else if (cell === "wP" || cell === "bP") p = at;
  }
  if (strong === "w") return kpkWins(toMove === "w" ? 0 : 1, wk, bk, p);
  return kpkWins(toMove === "b" ? 0 : 1, flip(bk), flip(wk), flip(p));
}

/** 끝내기 표: 킹+폰 대 킹에서 비기는 판이면 0점, 그 밖에는 모른다(null) */
export function probeMaster(pos: Position): number | null {
  let pieces = 0;
  let pawn = -1;
  for (let at = 0; at < 64; at++) {
    const cell = pos.board[at];
    if (!cell) continue;
    pieces++;
    if (pieces > 3) return null;
    if (cell[1] === "P") pawn = at;
    else if (cell[1] !== "K") return null;
  }
  if (pieces !== 3 || pawn < 0) return null;
  const strong = (pos.board[pawn] as string)[0] as Side;
  return kpkWinsFor(pos.board, strong, pos.turn) ? null : 0;
}

export const MASTER_TUNING: SearchTuning = {
  evaluate: evaluateMaster,
  pruneLosingCaptures: true,
  futility: true,
  deepReduce: true,
  probe: probeMaster,
};
