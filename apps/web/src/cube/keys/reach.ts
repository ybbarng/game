import {
  type ActionId,
  actionLabel,
  isAvailable,
  notationToMove,
  parseAction,
} from "../input/actions";
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
 * 표기 한 수를 지금 배치에서 어떤 키 차례로 치는가(키 익히기·단축키 표가 함께 쓴다, docs/47 4절).
 * 키를 문장에 그대로 적지 않고 배치에서 읽어, 「두 손」·「표기」·「사용자」 모두 같은 단계가 그 배치 키로 나온다.
 *
 * - 그 수에 놓인 키가 있으면 그 키 하나
 * - `R2`처럼 두 번 돌리기는 `R` 키를 두 번
 * - `2R`·`3Rw`처럼 깊이가 붙은 수는 「다음 수 깊이」 키 뒤에 `R`·`Rw` 키
 */
export function pressesFor(
  keymap: Keymap,
  n: number,
  notation: string,
): KeyChord[][] {
  if (!isAvailable(n, notation)) return [];
  return reach(keymap, notation);
}

function reach(keymap: Keymap, notation: string): KeyChord[][] {
  const direct = chordsFor(keymap, notation)
    .slice()
    .sort((a, b) => mods(a) - mods(b))
    .map((c) => [c]);
  if (direct.length > 0) return direct;
  if (notation.endsWith("2")) {
    const base = notation.slice(0, -1);
    const once = reach(keymap, base)[0] ?? reach(keymap, `${base}'`)[0];
    return once ? [[...once, ...once]] : [];
  }
  const d = /^(\d+)(.+)$/.exec(notation);
  if (d) {
    const depthKey = chordsFor(keymap, `depth:${d[1]}`)[0];
    const rest = reach(keymap, d[2] as string)[0];
    return depthKey && rest ? [[depthKey, ...rest]] : [];
  }
  return [];
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

const mods = (c: KeyChord) => +!!c.shift + +!!c.alt + +!!c.ctrl;

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

/** 눌린 키를 사람에게: 「I: R」 / 「Q: 이 키에는 동작이 없습니다」 */
export function describeInput(
  keymap: Keymap,
  n: number,
  input: KeyInput,
): { chord: string; action: ActionId | null; text: string } {
  const chord = chordLabel({
    code: input.code,
    shift: input.shiftKey,
    alt: input.altKey,
    ctrl: input.ctrlKey,
  });
  const action = resolveAction(keymap, { ...input, repeat: false });
  if (action === null)
    return { chord, action, text: `${chord} 키에는 동작이 없습니다` };
  if (!isAvailable(n, action))
    return {
      chord,
      action,
      text: `${chord} 키는 「${actionLabel(action)}」(이 크기에서는 쓰지 않음)`,
    };
  return { chord, action, text: `${chord} 키는 「${actionLabel(action)}」` };
}
