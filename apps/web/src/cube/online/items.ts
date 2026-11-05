// 파티 모드: 아이템전(docs/51 3-3, docs/47 9-7). 화면과 대결 틀을 모르는 순수 계산이다.
//
// - 이정표(체력바와 같은 사다리)를 처음 지나면 아이템을 하나 받는다. 무엇을 받는지는 판 씨앗 + 받는 사람 + 이정표 순번 + 그때 순위로
//   모든 기기가 다시 계산한다(`drawItem`). 방장도 고를 수 없다.
// - 쓰기·맞기는 그 사람의 수 기록에 특별한 수(`!`로 시작하는 글)로 싣는다. 대결 틀은 이 수도 다른 수처럼 다시 적용하고,
//   중간 지점으로 시각을 증인 하한으로 확인한다. 판정(누가 무엇을 갖고 있었나, 누구에게 맞았나)은 `party.ts` `judgeParty`가 한다.
//   - `!u:<아이템>`: 가진 아이템을 쓴다. 되감기는 이 수에서 내 마지막 3수를 되돌린다.
//   - `!hit|<쓴 사람>|<몇 번째 쓰기>|<수>`: 한 수 섞기를 맞은 사람이 그 수를 내 큐브에 넣는다(모든 기기가 같은 수를 끼워 다시 적용).
import { sha256Hex } from "@game/baseball-engine";
import {
  applyMove,
  type CubeMove,
  formatMove,
  invertMove,
  isRotation,
  parseMoves,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

export const ITEM_KINDS = [
  "mix",
  "fog",
  "blind",
  "swap",
  "gray",
  "shield",
  "rewind",
  "hint",
  "find",
  "heal",
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ITEM_LABELS: Record<ItemKind, string> = {
  mix: "한 수 섞기",
  fog: "안개",
  blind: "한 면 가리기",
  swap: "색 뒤집기",
  gray: "흑백 화면",
  shield: "방패",
  rewind: "되감기",
  hint: "힌트 한 수",
  find: "찾아 주기",
  heal: "시간 줍기",
};

/** 남에게 쓰는 방해 */
export const ATTACKS: readonly ItemKind[] = [
  "mix",
  "fog",
  "blind",
  "swap",
  "gray",
];

/** 맞은 사람 화면에서만 그리는 방해(친선용: 받는 쪽 기기가 스스로 그려야 해서 못 막는다) */
export const SCREEN_ATTACKS: readonly ItemKind[] = [
  "fog",
  "blind",
  "swap",
  "gray",
];

/** 안개·한 면 가리기가 이어지는 시간(ms) */
export const SCREEN_HIT_MS = 3_000;
/**
 * 색 뒤집기가 이어지는 시간(ms). 맞은편 색끼리 바뀐 화면을 읽고 「색이 바뀌었구나」를 알아챈 뒤 한두 수를 헷갈릴 만큼.
 * 안개(3초)보다 조금 길게 둔다: 가리지 않고 보여 주기만 하므로 덜 세다
 */
export const SWAP_MS = 4_000;
/** 흑백 화면이 이어지는 시간(ms). 색 뒤집기와 같게 둔다(무늬를 읽는 데 시간이 더 들어 그만큼 세다) */
export const GRAY_MS = 4_000;
/** 찾아 주기가 조각을 빛내는 시간(ms) */
export const FIND_MS = 5_000;

/** 색 뒤집기: 면 번호(U R F D L B)를 맞은편으로(흰↔노, 빨↔주, 초↔파) */
export const oppositeFace = (f: number): number => (f + 3) % 6;

/** 색 뒤집기 동안 칠할 색: 면 f의 칸을 맞은편 면 색으로. 사용자 색 배치여도 「맞은편끼리 바꿈」 */
export function swappedColors(colors: readonly number[]): number[] {
  return colors.map((_, f) => colors[oppositeFace(f)] as number);
}
/** 되감기가 되돌리는 수 */
export const REWIND_MOVES = 3;
/**
 * 한 수 섞기를 맞은 사람이 그 수를 넣어야 하는 기한(ms, 맞은 시각부터). 그 사람 기기는 판정이 확실해지는 대로(보통 1초 안쪽) 넣는다.
 * 기한이 지나도 넣지 않았으면 그 판에서 빠진다(「방해를 받지 않음」). 기한 안에 맞추면 넣지 않아도 된다
 */
export const MIX_GRACE_MS = 3_000;

export type Standing = "first" | "middle" | "last";

export const STANDING_LABELS: Record<Standing, string> = {
  first: "1등",
  middle: "가운데",
  last: "꼴찌",
};

/**
 * 순위별 확률(가중치). 뒤처질수록 강한 방해(한 수 섞기·한 면 가리기)가 잘 나오고, 1등은 방패·시간 줍기 위주다.
 * 고를 수 없는 아이템(체력바가 아니면 시간 줍기, 3×3이 아니면 힌트)은 빼고 나머지 비율로 뽑는다
 */
export const ITEM_TABLE: Record<Standing, Partial<Record<ItemKind, number>>> = {
  first: { shield: 40, heal: 25, hint: 10, find: 5, fog: 10, swap: 10 },
  middle: {
    mix: 18,
    shield: 15,
    fog: 10,
    blind: 10,
    swap: 10,
    gray: 12,
    rewind: 10,
    hint: 9,
    find: 9,
    heal: 9,
  },
  last: {
    mix: 25,
    blind: 18,
    swap: 10,
    gray: 13,
    fog: 8,
    rewind: 12,
    hint: 9,
    find: 10,
    heal: 8,
  },
};

export interface ItemRules {
  n: number;
  /** 체력바와 함께(시간 줍기가 나온다) */
  hp: boolean;
}

/** 이 판에서 나올 수 있는 아이템인가 */
export function itemAvailable(kind: ItemKind, rules: ItemRules): boolean {
  if (kind === "heal") return rules.hp;
  // 힌트는 배우기 힌트(초보자 해법) 계산, 찾아 주기는 조각 강조(`piece-marks.ts`)를 쓴다: 3×3만
  if (kind === "hint" || kind === "find") return rules.n === 3;
  return true;
}

/** 순위 표의 한 줄을 고를 수 있는 아이템만 남겨 비율(합 1)로 */
export function itemOdds(
  standing: Standing,
  rules: ItemRules,
): Partial<Record<ItemKind, number>> {
  const row = Object.entries(ITEM_TABLE[standing]).filter(([k]) =>
    itemAvailable(k as ItemKind, rules),
  ) as [ItemKind, number][];
  const total = row.reduce((s, [, w]) => s + w, 0);
  return Object.fromEntries(row.map(([k, w]) => [k, w / total]));
}

/** 그 자리(1부터)가 순위 표의 어느 줄인가. 혼자면 1등 */
export function standingOf(place: number, field: number): Standing {
  if (place <= 1) return "first";
  return place >= field ? "last" : "middle";
}

const hash32 = (text: string, at = 0) =>
  Number.parseInt(sha256Hex(text).slice(at * 8, at * 8 + 8), 16);

/**
 * 뽑기. 판 씨앗 + 받는 사람 + 이정표 순번(사다리에서 1부터) + 그때 순위 줄로 정한다. 같은 입력이면 모든 기기가 같은 아이템을 낸다
 */
export function drawItem(
  seed: string,
  player: string,
  milestone: number,
  standing: Standing,
  rules: ItemRules,
): ItemKind {
  const row = Object.entries(ITEM_TABLE[standing]).filter(([k]) =>
    itemAvailable(k as ItemKind, rules),
  ) as [ItemKind, number][];
  const total = row.reduce((s, [, w]) => s + w, 0);
  let r =
    hash32(`cube-item|${seed}|${player}|${milestone}|${standing}`) % total;
  for (const [kind, w] of row) {
    if (r < w) return kind;
    r -= w;
  }
  return (row.at(-1) as [ItemKind, number])[0];
}

const FACES = ["U", "R", "F", "D", "L", "B"] as const;
const SUFFIX = ["", "2", "'"] as const;

/**
 * 한 수 섞기가 넣는 수(1~2수, 바깥 면만, 둘째 수는 다른 축). 씨앗 + 쓴 사람 + 몇 번째 쓰기로 정해 모든 기기가 같다
 */
export function mixMoves(
  seed: string,
  by: string,
  k: number,
  n: number,
): string {
  const h = sha256Hex(`cube-mix|${seed}|${by}|${k}`);
  const byte = (i: number) => Number.parseInt(h.slice(i * 2, i * 2 + 2), 16);
  const count = 1 + (byte(0) % 2);
  const first = byte(1) % 6;
  const moves = [`${FACES[first]}${SUFFIX[byte(2) % 3]}`];
  if (count === 2) {
    const others = [0, 1, 2, 3, 4, 5].filter((f) => f % 3 !== first % 3);
    const second = others[byte(3) % others.length] as number;
    moves.push(`${FACES[second]}${SUFFIX[byte(4) % 3]}`);
  }
  // 표기를 엔진 글로 맞춘다(수 기록과 같은 글)
  return parseMoves(n, moves.join(" "))
    .map((m) => formatMove(n, m))
    .join(" ");
}

/** 한 면 가리기가 가리는 면(자리 기준: 0 위, 1 오른쪽, 2 앞). 보통 보이는 세 면 가운데 하나 */
export function blindFace(seed: string, by: string, k: number): 0 | 1 | 2 {
  const order = [0, 2, 1] as const;
  return order[hash32(`cube-blind|${seed}|${by}|${k}`) % 3] as 0 | 1 | 2;
}

// ---- 수 기록의 특별한 수 ----

export type ItemAct =
  | { item: "use"; kind: ItemKind; text: string }
  | { item: "hit"; by: string; k: number; moves: string; text: string };

export const isItemText = (text: string): boolean => text.startsWith("!");

export function itemUseText(kind: ItemKind): string {
  return `!u:${kind}`;
}

export function hitText(by: string, k: number, moves: string): string {
  return `!hit|${by}|${k}|${moves}`;
}

/** 넣는 수 글을 엔진 수로(1~2수, 큐브 돌리기 아님, 엔진 글과 같은 표기). 아니면 null */
function hitMovesOf(n: number, text: string): CubeMove[] | null {
  let moves: CubeMove[];
  try {
    moves = parseMoves(n, text);
  } catch {
    return null;
  }
  if (moves.length < 1 || moves.length > 2) return null;
  if (moves.some((m) => isRotation(n, m))) return null;
  if (moves.map((m) => formatMove(n, m)).join(" ") !== text) return null;
  return moves;
}

/** 특별한 수 글을 읽는다. 모양이 틀리면 null(그 수는 둘 수 없는 수) */
export function parseItemText(n: number, text: string): ItemAct | null {
  if (text.startsWith("!u:")) {
    const kind = text.slice(3) as ItemKind;
    if (!ITEM_KINDS.includes(kind) || kind === "shield") return null;
    return { item: "use", kind, text };
  }
  if (text.startsWith("!hit|")) {
    const parts = text.split("|");
    if (parts.length !== 4) return null;
    const [, by, ks, moves] = parts as [string, string, string, string];
    const k = Number(ks);
    if (!by || !Number.isInteger(k) || k < 1 || String(k) !== ks) return null;
    if (!hitMovesOf(n, moves)) return null;
    return { item: "hit", by, k, moves, text };
  }
  return null;
}

// ---- 상태에 붙이는 기록 ----

/** 아이템전 판의 상태에 붙는 기록. 대결 틀의 중간 지점 이름(`itemCheckpoints`)과 되감기에 쓴다 */
export interface ItemTrack {
  /** 쓴 아이템(차례대로) */
  readonly uses: readonly ItemKind[];
  /** 넣은 한 수 섞기(`쓴 사람|몇 번째|수`, 차례대로) */
  readonly hits: readonly string[];
  /** 되감기가 되돌릴 내 마지막 수(최대 3, 엔진 글). 맞은 수를 넣거나 되감으면 비운다 */
  readonly recent: readonly string[];
}

export type ItemState = PuzzleState & { readonly items?: ItemTrack };

const EMPTY: ItemTrack = { uses: [], hits: [], recent: [] };

export function trackOf(state: PuzzleState): ItemTrack {
  return (state as ItemState).items ?? EMPTY;
}

const withTrack = (state: PuzzleState, items: ItemTrack): ItemState => ({
  perm: state.perm,
  twist: state.twist,
  items,
});

/** 되감기가 지금 되돌릴 수(엔진 수, 둔 차례대로) */
export function rewindMoves(n: number, state: PuzzleState): CubeMove[] {
  return trackOf(state).recent.map((m) => parseMoves(n, m)[0] as CubeMove);
}

/**
 * 수 기록의 글 하나를 상태에 적용한다(보통 수와 특별한 수 모두). 둘 수 없으면 throw.
 * 대결 틀의 다시 적용(아이템전 판), 단계 칩·다시 보기가 함께 쓴다
 */
export function applyLogText(
  n: number,
  state: PuzzleState,
  text: string,
): ItemState {
  const track = trackOf(state);
  if (!isItemText(text)) {
    const moves = parseMoves(n, text);
    if (moves.length !== 1) throw new Error("수 하나가 아니다");
    const move = moves[0] as CubeMove;
    return withTrack(applyMove(n, state, move), {
      ...track,
      recent: [...track.recent, formatMove(n, move)].slice(-REWIND_MOVES),
    });
  }
  const act = parseItemText(n, text);
  if (!act) throw new RangeError("둘 수 없는 수");
  return applyItemAct(n, state, act);
}

export function applyItemAct(
  n: number,
  state: PuzzleState,
  act: ItemAct,
): ItemState {
  const track = trackOf(state);
  if (act.item === "hit") {
    const moves = hitMovesOf(n, act.moves);
    if (!moves) throw new RangeError("둘 수 없는 수");
    let next: PuzzleState = state;
    for (const m of moves) next = applyMove(n, next, m);
    return withTrack(next, {
      ...track,
      hits: [...track.hits, `${act.by}|${act.k}|${act.moves}`],
      recent: [],
    });
  }
  let next: PuzzleState = state;
  let recent = track.recent;
  if (act.kind === "rewind") {
    for (const m of [...rewindMoves(n, state)].reverse())
      next = applyMove(n, next, invertMove(m));
    recent = [];
  }
  return withTrack(next, { ...track, uses: [...track.uses, act.kind], recent });
}

/**
 * 대결 틀의 중간 지점 이름. 쓰기는 `!u<차례>:<아이템>`, 넣은 섞기는 `!h<차례>|<쓴 사람>|<몇 번째>|<수>`.
 * 처음 나타난 수에서 대결 틀이 증인 하한을 모아 그 시각을 확인한다(이정표와 같은 규칙)
 */
export function itemCheckpoints(state: PuzzleState): string[] {
  const t = trackOf(state);
  return [
    ...t.uses.map((kind, i) => `!u${i + 1}:${kind}`),
    ...t.hits.map((key, i) => `!h${i + 1}|${key}`),
  ];
}

export type ItemMark =
  | { kind: "use"; k: number; item: ItemKind }
  | { kind: "inject"; by: string; k: number; moves: string };

/** 중간 지점 이름을 읽는다(아이템 것이 아니면 null) */
export function parseItemMark(id: string): ItemMark | null {
  const use = /^!u(\d+):([a-z]+)$/.exec(id);
  if (use) {
    const item = use[2] as ItemKind;
    if (!ITEM_KINDS.includes(item)) return null;
    return { kind: "use", k: Number(use[1]), item };
  }
  const hit = /^!h\d+\|([^|]+)\|(\d+)\|(.+)$/.exec(id);
  if (hit)
    return {
      kind: "inject",
      by: hit[1] as string,
      k: Number(hit[2]),
      moves: hit[3] as string,
    };
  return null;
}

/**
 * 수 기록을 글마다 실제로 큐브에 들어간 수로 푼다(보통 수는 그대로, 맞은 섞기는 그 수, 되감기는 되돌린 수, 다른 쓰기는 없음).
 * 되돌리기(바로 앞 수 거꾸로)·다시 보기·컴퓨터 계획 확인이 쓴다
 */
export function effectiveMoves(
  n: number,
  log: readonly { m: string }[],
): string[][] {
  let recent: string[] = [];
  return log.map(({ m }) => {
    if (!isItemText(m)) {
      const move = parseMoves(n, m)[0];
      if (!move) return [];
      recent = [...recent, formatMove(n, move)].slice(-REWIND_MOVES);
      return [formatMove(n, move)];
    }
    const act = parseItemText(n, m);
    if (!act) return [];
    if (act.item === "hit") {
      recent = [];
      return act.moves.split(" ");
    }
    if (act.kind !== "rewind") return [];
    const back = [...recent]
      .reverse()
      .map((x) => formatMove(n, invertMove(parseMoves(n, x)[0] as CubeMove)));
    recent = [];
    return back;
  });
}

/** 넣은 섞기(글)를 되돌리는 수(거꾸로 차례, 엔진 수) */
export function undoMoves(n: number, text: string): CubeMove[] {
  return parseMoves(n, text).reverse().map(invertMove);
}

/** 수 기록에서 마지막으로 큐브에 들어간 수(되돌리기용). 없으면 null */
export function lastEffectiveMove(
  n: number,
  log: readonly { m: string }[],
): CubeMove | null {
  const all = effectiveMoves(n, log);
  for (let i = all.length - 1; i >= 0; i--) {
    const last = all[i]?.at(-1);
    if (last) return parseMoves(n, last)[0] as CubeMove;
  }
  return null;
}
