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
  | { kind: "command"; action: ActionId; command: Command };

/**
 * 키 누름을 수·명령으로 바꾼다(DOM 없이). 「다음 수 깊이」를 기억했다가 다음 면 수에 붙인다.
 * 크기 n에서 쓸 수 없는 동작이면 null(키를 먹지 않는다).
 */
export class KeyInterpreter {
  private depth: number | null = null;

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
    if (p.kind === "command") {
      this.depth = null;
      return { kind: "command", action, command: p.command };
    }
    const depth = this.depth;
    this.depth = null;
    const raw = depth === null ? p.notation : withDepth(p.notation, depth);
    // 기록·공식에는 가장 짧은 이름으로 적는다(3×3의 2 → J = E', 3 → I = L', 넓게 n층 = x·y·z)
    const notation = canonicalNotation(this.n, raw);
    const move = notationToMove(this.n, notation);
    if (!move) return null;
    return { kind: "move", action, notation, move };
  }
}
