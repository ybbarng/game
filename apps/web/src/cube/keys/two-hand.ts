// 「두 손」 배치는 실물 핑거 트릭을 키보드로 옮긴 것이다(2026-11-04 사용자 확정, docs/47 4-2).
// 규칙 한 문장: 실물에서 돌리는 손가락으로 치고, 손이 움직이는 쪽(위·아래)으로 줄을 고른다.
// 이 표는 소개(처음 안내·키 익히기)와 핑거 트릭 화면이 함께 쓰고, `two-hand.test.ts`가 실제 배치와 맞는지 본다.

export interface HandRule {
  /** 수 표기 */
  move: string;
  /** 「두 손」 배치의 키(KeyboardEvent.code) */
  code: string;
  /** 치는 손 */
  hand: "left" | "right";
  /** 실물에서 그 수를 하는 손가락·움직임(핑거 트릭 화면과 같은 말) */
  finger: string;
  /**
   * 키 줄: up = 위 줄(손이 위로 밀어 올림), down = 아래 줄(내림), home = 가운데 줄(검지·약지로 밀기).
   * 같은 무리의 짝(R·R')은 위·아래로, 시계·반시계 짝(U·U')은 두 손 같은 자리로 나뉜다
   */
  row: "up" | "home" | "down";
  /** 핑거 트릭으로 설명되지 않는 자리 */
  exception?: string;
}

export const TWO_HAND_RULES: HandRule[] = [
  {
    move: "R",
    code: "KeyI",
    hand: "right",
    row: "up",
    finger: "오른 손목을 아래에서 위로",
  },
  {
    move: "R'",
    code: "KeyK",
    hand: "right",
    row: "home",
    finger: "오른 손목을 위에서 아래로",
  },
  {
    move: "L'",
    code: "KeyE",
    hand: "left",
    row: "up",
    finger: "왼 손목을 아래에서 위로",
  },
  {
    move: "L",
    code: "KeyD",
    hand: "left",
    row: "home",
    finger: "왼 손목을 위에서 아래로",
  },
  {
    move: "U",
    code: "KeyJ",
    hand: "right",
    row: "home",
    finger: "오른 검지로 윗면을 왼쪽으로 밀기",
  },
  {
    move: "U'",
    code: "KeyF",
    hand: "left",
    row: "home",
    finger: "왼 검지로 윗면을 오른쪽으로 밀기",
  },
  {
    move: "F",
    code: "KeyH",
    hand: "right",
    row: "home",
    finger: "오른 검지로 앞면 위쪽을 오른쪽으로(검지 한 칸 안쪽)",
  },
  {
    move: "F'",
    code: "KeyG",
    hand: "left",
    row: "home",
    finger: "왼 검지로 앞면 위쪽을 왼쪽으로(검지 한 칸 안쪽)",
  },
  {
    move: "D",
    code: "KeyS",
    hand: "left",
    row: "home",
    finger: "왼 약지로 아랫면 앞쪽을 오른쪽으로",
  },
  {
    move: "D'",
    code: "KeyL",
    hand: "right",
    row: "home",
    finger: "오른 약지로 아랫면 앞쪽을 왼쪽으로",
  },
  {
    move: "B",
    code: "KeyW",
    hand: "left",
    row: "up",
    finger: "왼 약지로 뒷면 위쪽을",
    exception:
      "B는 사람마다 쓰는 손가락이 달라요. 편한 손가락으로 바꾸려면 설정의 사용자 배치에서 바꾸세요.",
  },
  {
    move: "B'",
    code: "KeyO",
    hand: "right",
    row: "up",
    finger: "오른 검지·약지로 뒷면 위쪽을",
    exception:
      "B는 사람마다 쓰는 손가락이 달라요. 편한 손가락으로 바꾸려면 설정의 사용자 배치에서 바꾸세요.",
  },
  {
    move: "Rw",
    code: "KeyU",
    hand: "right",
    row: "up",
    finger: "오른 손목으로 두 층을 위로(R 옆 칸)",
  },
  {
    move: "Rw'",
    code: "KeyM",
    hand: "right",
    row: "down",
    finger: "오른 손목으로 두 층을 아래로",
  },
  {
    move: "Lw'",
    code: "KeyR",
    hand: "left",
    row: "up",
    finger: "왼 손목으로 두 층을 위로",
  },
  {
    move: "Lw",
    code: "KeyV",
    hand: "left",
    row: "down",
    finger: "왼 손목으로 두 층을 아래로",
  },
  {
    move: "x",
    code: "KeyT",
    hand: "left",
    row: "up",
    finger: "큐브 전체를 R처럼 위로(가운데 위 줄)",
  },
  {
    move: "x'",
    code: "KeyB",
    hand: "left",
    row: "down",
    finger: "큐브 전체를 아래로(가운데 아래 줄)",
  },
  {
    move: "y",
    code: "Semicolon",
    hand: "right",
    row: "home",
    finger: "큐브 전체를 U처럼(오른 새끼 자리)",
  },
  {
    move: "y'",
    code: "KeyA",
    hand: "left",
    row: "home",
    finger: "큐브 전체를 U'처럼(왼 새끼 자리)",
  },
  {
    move: "z",
    code: "KeyP",
    hand: "right",
    row: "up",
    finger: "큐브 전체를 F처럼(오른 새끼 위)",
  },
  {
    move: "z'",
    code: "KeyQ",
    hand: "left",
    row: "up",
    finger: "큐브 전체를 F'처럼(왼 새끼 위)",
  },
  {
    move: "M",
    code: "Digit6",
    hand: "right",
    row: "up",
    finger: "약지로 가운데 줄을 밀어 올리기(숫자 줄)",
  },
  {
    move: "M'",
    code: "Period",
    hand: "right",
    row: "down",
    finger: "오른 약지로 가운데 줄 뒤쪽을 당겨 내리기",
  },
];

/** 규칙 한 문장 */
export const TWO_HAND_RULE =
  "실물에서 돌리는 손가락으로 치고, 손이 움직이는 쪽(위·아래)으로 줄을 골라요.";

/** 키 줄 번호(숫자 줄 1, 위 줄 2, 가운데 줄 3, 아래 줄 4) */
export function keyRowOf(code: string): number {
  if (code.startsWith("Digit")) return 1;
  if (/^Key[QWERTYUIOP]$/.test(code) || code.startsWith("Bracket")) return 2;
  if (/^Key[ASDFGHJKL]$/.test(code) || code === "Semicolon" || code === "Quote")
    return 3;
  return 4;
}
