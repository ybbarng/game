// 키 비용(docs/47 16-9): 공식 하나를 지금 키 배치로 칠 때 손이 얼마나 바쁜가. 공식 연습의 기본 공식을 고르는 데 쓴다.
// 실물 큐브의 핑거 트릭은 사람마다 달라 보지 않고, 키보드로 칠 때의 수고만 센다. 순수 함수라 시험으로 손 계산과 맞춰 본다.
import type { KeyChord, Keymap } from "../input/keymaps";
import { keysForMove } from "../keys/move-keys";
import { algTokens } from "../learn/notation";

/**
 * 가중치(한곳에 모아 둔다). 키 하나 누르기를 1로 두고 나머지를 그에 견준다.
 * - PRESS 1: 누르는 키 하나(R2를 같은 키 두 번으로 치면 2).
 * - SAME_KEY 0.3: 바로 앞과 같은 키. 손가락이 제자리에서 다시 누르면 되어 짧지만, 떼었다 누르는 틈이 있다.
 * - SAME_FINGER 1: 바로 앞과 다른 키를 같은 손가락으로. 손가락이 옮겨 가야 해 가장 느리다(타자 연구의 같은 손가락 연타).
 * - SAME_HAND 0.2: 바로 앞과 같은 손의 다른 손가락. 양손을 번갈아 치면 이 값이 붙지 않는다(번갈기가 가장 빠르다).
 * - MODIFIER 0.8: Shift·Alt·Ctrl 하나. 다른 손가락이 함께 눌러야 하고 틀리기 쉽다.
 * - ROTATION 1: 큐브 돌리기(x·y·z) 하나. 키는 하나지만 화면 방향이 바뀌어 다음 수를 다시 읽어야 한다.
 * - NO_KEY 10: 그 배치에 키가 없는 수. 고르지 않게 크게 둔다.
 */
export const KEY_COST = {
  PRESS: 1,
  SAME_KEY: 0.3,
  SAME_FINGER: 1,
  SAME_HAND: 0.2,
  MODIFIER: 0.8,
  ROTATION: 1,
  NO_KEY: 10,
} as const;

type Hand = "left" | "right";
interface Finger {
  hand: Hand;
  /** 손 안 손가락 번호: 0 엄지, 1 검지, 2 중지, 3 약지, 4 새끼 */
  finger: number;
}

/** 표준 타자 자리(열마다 손가락). 열 밖의 키는 새끼로 본다 */
const COLUMNS: [hand: Hand, finger: number, codes: string][] = [
  ["left", 4, "Backquote Digit1 KeyQ KeyA KeyZ Tab CapsLock"],
  ["left", 3, "Digit2 KeyW KeyS KeyX"],
  ["left", 2, "Digit3 KeyE KeyD KeyC"],
  ["left", 1, "Digit4 Digit5 KeyR KeyT KeyF KeyG KeyV KeyB"],
  ["right", 1, "Digit6 Digit7 KeyY KeyU KeyH KeyJ KeyN KeyM"],
  ["right", 2, "Digit8 KeyI KeyK Comma"],
  ["right", 3, "Digit9 KeyO KeyL Period"],
  [
    "right",
    4,
    "Digit0 Minus Equal KeyP BracketLeft BracketRight Backslash Semicolon Quote Slash Enter Backspace",
  ],
];

const FINGERS = new Map<string, Finger>(
  COLUMNS.flatMap(([hand, finger, codes]) =>
    codes.split(" ").map((code) => [code, { hand, finger }] as const),
  ),
);

/** 키 자리 → 손가락. 스페이스는 엄지, 모르는 키는 오른 새끼 */
export function fingerOf(code: string): Finger {
  if (code === "Space") return { hand: "right", finger: 0 };
  return FINGERS.get(code) ?? { hand: "right", finger: 4 };
}

const ROTATION = /^[xyz]/;

export interface KeyCostDetail {
  total: number;
  presses: number;
  sameKey: number;
  sameFinger: number;
  sameHand: number;
  modifiers: number;
  rotations: number;
  missing: number;
}

/** 공식 하나의 키 비용(작을수록 치기 쉽다) */
export function keyCostDetail(
  alg: string,
  keymap: Keymap,
  n = 3,
): KeyCostDetail {
  const d: KeyCostDetail = {
    total: 0,
    presses: 0,
    sameKey: 0,
    sameFinger: 0,
    sameHand: 0,
    modifiers: 0,
    rotations: 0,
    missing: 0,
  };
  let prev: KeyChord | null = null;
  for (const tok of algTokens(alg)) {
    if (ROTATION.test(tok)) d.rotations++;
    const keys = keysForMove(keymap, n, tok);
    if (!keys) {
      d.missing++;
      prev = null;
      continue;
    }
    for (const k of keys) {
      d.presses++;
      d.modifiers += +!!k.shift + +!!k.alt + +!!k.ctrl;
      if (prev) {
        const a = fingerOf(prev.code);
        const b = fingerOf(k.code);
        if (prev.code === k.code) d.sameKey++;
        else if (a.hand === b.hand && a.finger === b.finger) d.sameFinger++;
        else if (a.hand === b.hand) d.sameHand++;
      }
      prev = k;
    }
  }
  d.total =
    d.presses * KEY_COST.PRESS +
    d.sameKey * KEY_COST.SAME_KEY +
    d.sameFinger * KEY_COST.SAME_FINGER +
    d.sameHand * KEY_COST.SAME_HAND +
    d.modifiers * KEY_COST.MODIFIER +
    d.rotations * KEY_COST.ROTATION +
    d.missing * KEY_COST.NO_KEY;
  // 0.1 단위로 맞춰 소수 더하기 오차로 차례가 뒤바뀌지 않게
  d.total = Math.round(d.total * 10) / 10;
  return d;
}

export function keyCost(alg: string, keymap: Keymap, n = 3): number {
  return keyCostDetail(alg, keymap, n).total;
}
