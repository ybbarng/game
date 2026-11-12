import {
  type ActionId,
  actionLabel,
  canonicalNotation,
  isAvailable,
  notationToMove,
  parseAction,
  withDepth,
} from "../input/actions";
import { withLayers } from "../input/interpreter";
import {
  chordLabel,
  chordsFor,
  type KeyChord,
  type KeyInput,
  type Keymap,
  resolveAction,
} from "../input/keymaps";
import type { CubeMove } from "../view/types";

/**
 * 표기 한 수를 지금 배치에서 어떤 키 차례로 치는가(키 익히기·단축키 표·배우기 키캡이 함께 쓴다, docs/47 4절).
 * 키를 문장에 그대로 적지 않고 배치에서 읽어, 「두 손」·「표기」·「사용자」 모두 같은 단계가 그 배치 키로 나온다.
 *
 * 키마다 해석기(`KeyInterpreter`)와 같은 계산으로 실제로 도는 수를 흉내 내어 고른다(2026-11-04). 그래서 동작 이름이
 * 달라도(3×3에서 「두 손」의 . 키는 `2R`, 친 수는 `M'`) 같은 돌리기면 맞는 키다.
 *
 * - 그 수를 일으키는 키 하나
 * - `R2`처럼 두 번 돌리기는 같은 층을 도는 키를 두 번
 * - 깊이가 붙은 수는 「다음 수 깊이」 키 뒤에 면 키(「표기」의 `2 → R`)
 * - 층 수 키가 있는 배치(옛 「사용자」 배치가 든 csTimer식 3·4·7·8, 큰 큐브)는 층 수를 바꾼 뒤 면 키(`3Rw` = 7 → U, `routeFor`).
 *   층 수는 그대로 남는다(csTimer와 같음)
 */

/** 큰 큐브의 층 수(왼손 L·Lw, 오른손 R·Rw 키가 함께 돌리는 바깥 층 수) */
export interface HandLayers {
  left: number;
  right: number;
}

export const HOME_LAYERS: HandLayers = { left: 1, right: 1 };

/** 키 차례 하나와 다 친 뒤의 층 수 */
export interface KeyRoute {
  presses: KeyChord[];
  layers: HandLayers;
}

const sameLayersOf = (a: CubeMove, b: CubeMove) =>
  a.axis === b.axis && a.from === b.from && a.to === b.to;

/** 동작 하나를 그 층 수·깊이에서 쳤을 때 도는 수(해석기 `run`과 같은 계산). 수가 아니거나 쓸 수 없으면 null */
export function playedMove(
  n: number,
  action: ActionId,
  layers: HandLayers,
  depth: number | null = null,
): CubeMove | null {
  if (!isAvailable(n, action)) return null;
  const p = parseAction(action);
  if (p?.kind !== "move") return null;
  const raw =
    depth === null
      ? withLayers(p.notation, layers.left, layers.right)
      : withDepth(p.notation, depth);
  return notationToMove(n, canonicalNotation(n, raw));
}

type LayerKeys = Partial<Record<"L+" | "L-" | "R+" | "R-", KeyChord>>;

/** 층 수를 바꾸는 키(그 배치에 있는 것만). 큰 큐브가 아니거나 하나도 없으면 null */
function layerKeys(keymap: Keymap, n: number): LayerKeys | null {
  if (n < 4) return null;
  const out: LayerKeys = {};
  for (const k of ["L+", "L-", "R+", "R-"] as const) {
    const c = chordsFor(keymap, `layers:${k}`)[0];
    if (c) out[k] = bare(c);
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** 층 수 from → to로 가는 키(못 가면 null). 왼손 먼저 */
function layerPath(
  keys: LayerKeys,
  from: HandLayers,
  to: HandLayers,
): KeyChord[] | null {
  const out: KeyChord[] = [];
  for (const side of ["L", "R"] as const) {
    const a = side === "L" ? from.left : from.right;
    const b = side === "L" ? to.left : to.right;
    if (a === b) continue;
    const k = keys[`${side}${b > a ? "+" : "-"}`];
    if (!k) return null;
    for (let i = 0; i < Math.abs(b - a); i++) out.push(k);
  }
  return out;
}

const mods = (c: KeyChord) => +!!c.shift + +!!c.alt + +!!c.ctrl;
const modsOf = (p: readonly KeyChord[]) => p.reduce((s, c) => s + mods(c), 0);

/** 배치의 키(동작이 붙은 모양)에서 키만 떼어 낸다 */
function bare({ code, shift, alt, ctrl }: KeyChord): KeyChord {
  return {
    code,
    ...(shift ? { shift } : {}),
    ...(alt ? { alt } : {}),
    ...(ctrl ? { ctrl } : {}),
  };
}

/** 수 이름의 글자(`3Rw'` → R, `M` → M). 공식과 같은 글자의 키를 먼저 고르는 데 쓴다 */
const letterOf = (notation: string) =>
  /[RLUDFBMESxyz]/i.exec(notation)?.[0]?.toUpperCase() ?? "";

/** 가운데 층 → 따라 도는 면(M은 L, E는 D, S는 F) */
const SLICE_FACE: Record<string, string> = { M: "L", E: "D", S: "F" };

/**
 * 층 수 하나에서 그 수를 치는 길들(층 수 키 없이): 키 하나, 없으면 같은 키 두 번, 없으면 깊이 키 + 면 키,
 * 없으면 깊이 키 + 면 키를 두 번(「두 손」 3×3의 E2 = 2 → S를 두 번).
 * 같은 무리 안에서는 공식과 같은 글자의 동작(「표기」의 2R'은 3 → L보다 2 → ⇧R), 조합 키 적은 것,
 * 시계 방향(R2는 R 두 번), 배치에 먼저 놓인 것 차례
 */
function routesAt(
  keymap: Keymap,
  n: number,
  target: CubeMove,
  letter: string,
  layers: HandLayers,
): KeyChord[][] {
  type Option = { presses: KeyChord[]; rank: number[] };
  const direct: Option[] = [];
  const double: Option[] = [];
  const deep: Option[] = [];
  const deepDouble: Option[] = [];
  // 바깥 면 한 층·큐브 전체는 깊이 길로 찾지 않는다(3×3의 R을 「3 → 반대 면 키」로 가르치지 않게)
  const outer =
    (target.from === target.to && (target.from === 1 || target.from === n)) ||
    (target.from === 1 && target.to === n);
  // 같은 깊이가 여러 키에 있으면 조합 키 없는 것만(「두 손」의 Shift+3은 Shift를 누른 채 치게 둔 같은 3)
  const allDepth = keymap.bindings.filter(
    (b) => parseAction(b.action)?.kind === "depth",
  );
  const depthKeys = outer
    ? []
    : allDepth.filter(
        (b) =>
          mods(b) === 0 ||
          !allDepth.some((o) => o.action === b.action && mods(o) === 0),
      );
  // 가운데 층은 표기 정의에서 따라 도는 면의 키를 다음으로(3×3 E = 2 → D 키, S = 2 → F 키)
  const sliceFace = SLICE_FACE[letter];
  const rank = (action: string, presses: KeyChord[], ccw = false) => [
    letterOf(action) === letter ? 0 : letterOf(action) === sliceFace ? 1 : 2,
    modsOf(presses),
    ccw ? 1 : 0,
  ];
  for (const b of keymap.bindings) {
    const m = playedMove(n, b.action, layers);
    if (m && sameLayersOf(m, target)) {
      if (m.turns === target.turns) {
        const presses = [bare(b)];
        direct.push({ presses, rank: rank(b.action, presses) });
      } else if (target.turns === 2 && m.turns !== 2) {
        const presses = [bare(b), bare(b)];
        double.push({ presses, rank: rank(b.action, presses, m.turns === 3) });
      }
    }
    for (const d of depthKeys) {
      const p = parseAction(d.action);
      if (p?.kind !== "depth") continue;
      const dm = playedMove(n, b.action, layers, p.depth);
      // 깊이를 붙여도 그대로인 키(가운데 층·큐브 돌리기)는 바로 친 길에 이미 있다
      const same = !!m && !!dm && sameLayersOf(dm, m) && dm.turns === m.turns;
      if (
        dm &&
        !same &&
        sameLayersOf(dm, target) &&
        dm.turns === target.turns
      ) {
        const presses = [bare(d), bare(b)];
        deep.push({ presses, rank: rank(b.action, presses) });
      } else if (
        dm &&
        !same &&
        sameLayersOf(dm, target) &&
        target.turns === 2 &&
        dm.turns !== 2
      ) {
        const presses = [bare(d), bare(b), bare(d), bare(b)];
        deepDouble.push({
          presses,
          // 시계 방향은 표기로 본다(E2는 E 키인 D 쪽 S를 두 번)
          rank: rank(b.action, presses, b.action.endsWith("'")),
        });
      }
    }
  }
  const byRank = (a: Option, b: Option) => {
    for (let i = 0; i < a.rank.length; i++) {
      const d = (a.rank[i] as number) - (b.rank[i] as number);
      if (d !== 0) return d;
    }
    return 0;
  };
  // 앞 무리에 길이 있으면 그것만(키 하나로 치는 수에 「3 → L」 같은 먼 길을 덧붙이지 않는다)
  const first =
    [direct, double, deep, deepDouble].find((list) => list.length > 0) ?? [];
  first.sort(byRank);
  // 공식과 같은 글자의 키가 있으면 그것만(「2 → R」에 「3 → Shift+L」을 덧붙이지 않는다)
  const best = first[0]?.rank[0];
  const sorted = first.filter((o) => o.rank[0] === best).map((o) => o.presses);
  // 반 바퀴는 어느 쪽 키든 맞지만 글로는 하나만(「I 두 번」)
  return first === double || first === deepDouble ? sorted.slice(0, 1) : sorted;
}

/** 공식 글의 수 하나 → 그 크기의 수. 쓸 수 없는 수면 null */
function targetOf(n: number, notation: string): CubeMove | null {
  if (!isAvailable(n, notation)) return null;
  return notationToMove(n, canonicalNotation(n, notation));
}

const routeCache = new WeakMap<Keymap, Map<string, KeyRoute | null>>();

/**
 * 층 수 `from`에서 그 수를 치는 가장 짧은 길(층 수 키 포함). 층 수 키를 적게 쓰는 것, 그다음 키가 적은 것,
 * 조합 키가 적은 것, 배치에 먼저 놓인 것 차례. 못 치면 null.
 * 예(층 수 키 7·8을 든 옛 사용자 배치, 4×4): `3Rw` = 7 → U(뒤에 오른손 층 수 2가 남는다), 층 수 2에서 `R` = 8 → I.
 * 지금 「두 손」은 층 수 키가 없어 `3Rw` = 3 → U(깊이 숫자)
 */
export function routeFor(
  keymap: Keymap,
  n: number,
  notation: string,
  from: HandLayers = HOME_LAYERS,
): KeyRoute | null {
  let cache = routeCache.get(keymap);
  if (!cache) {
    cache = new Map();
    routeCache.set(keymap, cache);
  }
  const id = `${n}|${notation}|${from.left},${from.right}`;
  if (cache.has(id)) return cache.get(id) ?? null;
  const found = findRoute(keymap, n, notation, from);
  cache.set(id, found);
  return found;
}

function findRoute(
  keymap: Keymap,
  n: number,
  notation: string,
  from: HandLayers,
): KeyRoute | null {
  const target = targetOf(n, notation);
  if (!target) return null;
  const here = routesAt(keymap, n, target, letterOf(notation), from)[0];
  if (here) return { presses: here, layers: from };
  const keys = layerKeys(keymap, n);
  if (!keys) return null;
  let best: { route: KeyRoute; cost: number } | null = null;
  for (let left = 1; left < n; left++)
    for (let right = 1; right < n; right++) {
      const cost = Math.abs(left - from.left) + Math.abs(right - from.right);
      if (cost === 0 || (best && cost > best.cost)) continue;
      const to = { left, right };
      const path = layerPath(keys, from, to);
      if (!path) continue;
      const tail = routesAt(keymap, n, target, letterOf(notation), to)[0];
      if (!tail) continue;
      const presses = [...path, ...tail];
      if (
        !best ||
        cost < best.cost ||
        presses.length < best.route.presses.length
      )
        best = { route: { presses, layers: to }, cost };
    }
  return best?.route ?? null;
}

/**
 * 층 수를 바꾸지 않고(층 수 1·1에서) 그 수를 치는 키 차례들. 조작 훈련·키 익히기·단축키 표가 쓴다
 * (층 수가 남아 다음 문제를 흐트러뜨리지 않게).
 */
export function pressesFor(
  keymap: Keymap,
  n: number,
  notation: string,
): KeyChord[][] {
  const target = targetOf(n, notation);
  return target
    ? routesAt(keymap, n, target, letterOf(notation), HOME_LAYERS)
    : [];
}

/** 키 차례 하나를 글로(`Shift+R`, `2 → R`, `I I`) */
export function pressLabel(presses: readonly KeyChord[]): string {
  if (presses.length === 2 && sameChord(presses[0], presses[1]))
    return `${chordLabel(presses[0] as KeyChord)} 두 번`;
  return presses.map(chordLabel).join(" → ");
}

/** 표기·명령 하나를 치는 키(여럿이면 「/」로, 조합 키 없는 것 먼저). 없으면 null */
export function keyTextFor(
  keymap: Keymap,
  n: number,
  action: ActionId,
): string | null {
  const p = parseAction(action);
  if (p && p.kind !== "move") {
    const c = chordsFor(keymap, action);
    return c.length > 0 ? c.map(chordLabel).join(" / ") : null;
  }
  const options = pressesFor(keymap, n, action);
  return options.length > 0 ? options.map(pressLabel).join(" / ") : null;
}

function sameChord(a?: KeyChord, b?: KeyChord): boolean {
  return (
    !!a &&
    !!b &&
    a.code === b.code &&
    !!a.shift === !!b.shift &&
    !!a.alt === !!b.alt &&
    !!a.ctrl === !!b.ctrl
  );
}

/** 두 수가 같은 층을 같은 만큼 돌리는지 */
export function sameMove(a: CubeMove, b: CubeMove): boolean {
  return (
    a.axis === b.axis &&
    a.from === b.from &&
    a.to === b.to &&
    a.turns === b.turns
  );
}

function sameLayers(a: CubeMove, b: CubeMove): boolean {
  return a.axis === b.axis && a.from === b.from && a.to === b.to;
}

export type MatchResult = "hit" | "partial" | "miss";

/**
 * 표기 한 수와 친 수를 맞춰 본다. 반 바퀴(`R2`)는 같은 층을 두 번(어느 쪽으로든) 돌려도 맞다.
 * 한 번만 돌린 사이는 "partial", 다른 층·다른 방향이면 "miss"(맞춰 보기를 처음부터).
 */
export class MoveMatcher {
  private readonly target: CubeMove | null;
  private pending = 0;

  constructor(
    readonly n: number,
    readonly notation: string,
  ) {
    this.target = notationToMove(n, notation);
  }

  feed(move: CubeMove): MatchResult {
    const t = this.target;
    if (!t || !sameLayers(t, move)) {
      this.pending = 0;
      return "miss";
    }
    if (t.turns !== 2) {
      this.pending = 0;
      return move.turns === t.turns ? "hit" : "miss";
    }
    const sum = (this.pending + move.turns) % 4;
    if (sum === 2) {
      this.pending = 0;
      return "hit";
    }
    if (this.pending === 0 && move.turns !== 2) {
      this.pending = move.turns;
      return "partial";
    }
    this.pending = 0;
    return "miss";
  }

  reset(): void {
    this.pending = 0;
  }
}

/**
 * 눌린 키를 사람에게 완결된 문장으로: 「K 키는 「R'」 동작이에요.」 / 「Q 키에는 동작이 없어요.」.
 * `played`(실제로 돌아간 수, 깊이 키 뒤의 `2R` 등)가 키의 동작과 다르면 「실제로 돈 수는 「2R」 수예요.」를 잇는다.
 */
export function describeInput(
  keymap: Keymap,
  n: number,
  input: KeyInput,
  played?: string,
): { chord: string; action: ActionId | null; text: string } {
  const chord = chordLabel({
    code: input.code,
    shift: input.shiftKey,
    alt: input.altKey,
    ctrl: input.ctrlKey,
  });
  const action = resolveAction(keymap, { ...input, repeat: false });
  if (action === null)
    return { chord, action, text: `${chord} 키에는 동작이 없어요.` };
  const said = isAvailable(n, action)
    ? `${chord} 키는 「${actionLabel(action)}」 동작이에요.`
    : `${chord} 키는 「${actionLabel(action)}」 동작이지만 이 크기에서는 쓰지 않아요.`;
  const tail =
    played !== undefined && played !== action
      ? ` 실제로 돈 수는 「${played}」 수예요.`
      : "";
  return { chord, action, text: said + tail };
}

/** 틀렸을 때 덧붙이는 맞는 키 꼬리표: 「맞는 키: I」 */
export function rightKeyTag(keys: string): string {
  return `맞는 키: ${keys}`;
}
