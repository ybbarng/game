import type { CubeMove } from "../view/types";
import {
  type ActionId,
  type Command,
  canonicalNotation,
  isAvailable,
  notationToMove,
  parseAction,
  withDepth,
} from "./actions";
import { type KeyInput, type Keymap, resolveAction } from "./keymaps";

/** 키 하나를 처리한 결과 */
export type KeyResult =
  | { kind: "move"; action: ActionId; notation: string; move: CubeMove }
  | { kind: "depth"; action: ActionId; depth: number }
  /** 층 수가 바뀜(왼손 L·Lw, 오른손 R·Rw 키가 돌리는 바깥 층 수) */
  | { kind: "layers"; action: ActionId; left: number; right: number }
  | { kind: "command"; action: ActionId; command: Command };

/**
 * 키 누름을 수·명령으로 바꾼다(DOM 없이). 「다음 수 깊이」를 기억했다가 다음 면 수에 붙인다.
 * 크기 n에서 쓸 수 없는 동작이면 null(키를 먹지 않는다).
 */
export class KeyInterpreter {
  private depth: number | null = null;
  /**
   * 층 수(csTimer의 oSl·oSr): L·Lw 키, R·Rw 키가 돌리는 바깥 층 수. R 키는 바깥 right층, Rw 키·Shift+I는 right+1층을
   * 함께 돌린다. 섞기·맞춘 상태로·크기 바꾸기(새 해석기) 때 1로 돌아간다. Space로는 되돌리지 않는다(살펴보기 키)
   */
  private left = 1;
  private right = 1;

  get layers(): { left: number; right: number } {
    return { left: this.left, right: this.right };
  }

  constructor(
    readonly n: number,
    private keymap: Keymap,
  ) {}

  setKeymap(keymap: Keymap): void {
    this.keymap = keymap;
    this.depth = null;
  }

  /** 기억해 둔 다음 수 깊이(없으면 null) */
  get pendingDepth(): number | null {
    return this.depth;
  }

  handle(input: KeyInput): KeyResult | null {
    const action = resolveAction(this.keymap, input);
    if (action === null) return null;
    return this.run(action);
  }

  /** 동작 이름을 바로 처리한다(화면 단추 등) */
  run(action: ActionId): KeyResult | null {
    if (!isAvailable(this.n, action)) return null;
    const p = parseAction(action);
    if (!p) return null;
    if (p.kind === "depth") {
      this.depth = p.depth;
      return { kind: "depth", action, depth: p.depth };
    }
    if (p.kind === "layers") {
      const clamp = (v: number) => Math.max(1, Math.min(this.n - 1, v));
      if (p.side === "L") this.left = clamp(this.left + p.delta);
      else this.right = clamp(this.right + p.delta);
      return { kind: "layers", action, left: this.left, right: this.right };
    }
    if (p.kind === "command") {
      this.depth = null;
      if (p.command === "reset" || p.command === "scramble") {
        this.left = 1;
        this.right = 1;
      }
      return { kind: "command", action, command: p.command };
    }
    const depth = this.depth;
    this.depth = null;
    const raw =
      depth === null
        ? withLayers(p.notation, this.left, this.right)
        : withDepth(p.notation, depth);
    // 기록·공식에는 가장 짧은 이름으로 적는다(3×3의 2 → J = E', 3 → I = L', 넓게 n층 = x·y·z)
    const notation = canonicalNotation(this.n, raw);
    const move = notationToMove(this.n, notation);
    if (!move) return null;
    return { kind: "move", action, notation, move };
  }
}

/**
 * 층 수를 붙인다(csTimer와 같음): R·L 키는 바깥 k층, Rw·Lw(r·l, Shift)는 k+1층. 층 수가 1이면 그대로
 * (R → R, Rw → Rw). 다른 면·가운데 층·큐브 돌리기는 그대로
 */
export function withLayers(
  notation: string,
  left: number,
  right: number,
): string {
  const m =
    /^([RL])(w)?(2|')?$/.exec(notation) ?? /^([rl])()(2|')?$/.exec(notation);
  if (!m) return notation;
  const face = (m[1] as string).toUpperCase();
  const wide = m[2] === "w" || /^[rl]/.test(notation);
  const k = (face === "R" ? right : left) + (wide ? 1 : 0);
  const sfx = m[3] ?? "";
  if (k === 1) return `${face}${sfx}`;
  return k === 2 ? `${face}w${sfx}` : `${k}${face}w${sfx}`;
}
