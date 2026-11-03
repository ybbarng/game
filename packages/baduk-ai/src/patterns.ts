import type { FastBoard } from "./fast-board";

/*
 * 3×3 모양(MoGo식 플레이아웃 모양, michi의 목록을 옮김). 가운데 빈 점에 두면 "바둑다운" 수가 되는 둘레 모양이다.
 * 끝까지 둬 보기에서 상대 마지막 수 곁에 이런 자리가 있으면 무작위 수보다 먼저 두고, 나무에서는 사전 점수를 준다.
 *
 * 글자: X·O 두 색(어느 쪽이 흑이든 상관없다, 색을 바꾼 모양도 넣는다), x는 X가 아님, o는 O가 아님,
 * . 빈 점, 공백 판 밖, ? 아무거나. 가운데는 늘 둘 자리(빈 점)다. 돌리기·뒤집기 여덟 가지를 모두 넣는다.
 */
const SOURCE: readonly (readonly [string, string, string])[] = [
  // 젖히기: 둘러싸는 젖힘
  ["XOX", "...", "???"],
  // 젖히기: 끊기지 않는 젖힘
  ["XO.", "...", "?.?"],
  // 젖히기: 꼬부리기
  ["XO?", "X..", "x.?"],
  // 붙이기·어깨 짚기
  [".O.", "X..", "..."],
  // 끊기: 지켜지지 않은 끊음
  ["XO?", "O.o", "?o?"],
  // 끊기: 들여다본 끊음
  ["XO?", "O.X", "???"],
  // 나가 끊기
  ["?X?", "O.O", "ooo"],
  // 날일자 끊기
  ["OX?", "o.O", "???"],
  // 변: 쫓기
  ["X.?", "O.?", "   "],
  // 변: 끊김 막기
  ["OX?", "X.O", "   "],
  // 변: 이음 막기
  ["?X?", "x.O", "   "],
  // 변: 내려서기
  ["?XO", "x.x", "   "],
  // 변: 끊기
  ["?OX", "X.O", "   "],
];

/** `code3x3`와 같은 차례의 (dx, dy) */
const ORDER: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

function buildTable(): Uint8Array {
  const table = new Uint8Array(1 << 16);
  const allowed: Record<string, readonly number[]> = {
    ".": [0],
    X: [1],
    O: [2],
    " ": [3],
    "?": [0, 1, 2, 3],
    x: [0, 2, 3],
    o: [0, 1, 3],
  };
  const swap: Record<string, string> = { X: "O", O: "X", x: "o", o: "x" };
  for (const rows of SOURCE) {
    const grid = rows.map((r) => r.split(""));
    for (let sym = 0; sym < 16; sym++) {
      // 여덟 가지 돌리기·뒤집기 × 색 바꾸기
      const cells = ORDER.map(([dx, dy]) => {
        let x = dx;
        let y = dy;
        if (sym & 1) x = -x;
        if (sym & 2) y = -y;
        if (sym & 4) [x, y] = [y, x];
        const ch = grid[y + 1]?.[x + 1] ?? "?";
        return sym & 8 ? (swap[ch] ?? ch) : ch;
      });
      const fill = (i: number, code: number) => {
        if (i === 8) {
          table[code] = 1;
          return;
        }
        for (const v of allowed[cells[i] as string] as number[])
          fill(i + 1, code | (v << (2 * i)));
      };
      fill(0, 0);
    }
  }
  return table;
}

/** 모양 번호(`FastBoard.code3x3`) → 좋은 모양이면 1 */
const TABLE = buildTable();

/** `at`(빈 점) 둘레가 좋은 3×3 모양인가 */
export function matchesPattern(board: FastBoard, at: number): boolean {
  return TABLE[board.code3x3(at)] === 1;
}
