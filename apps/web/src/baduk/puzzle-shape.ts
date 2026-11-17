/*
 * 문제 모양 가리기(docs/23 바둑): 같은 모양을 판 대칭으로 돌린 문제는 같은 열쇠가 나온다.
 * 기준 자리 둘레(거리 `radius` 안, 가로·세로 중 먼 쪽)의 흑·백·빈 점·판 밖을 기준 자리에 대한 상대 자리로 읽고,
 * 판 대칭 여덟 가지(돌리기 넷 × 뒤집기 둘)로 돌린 글 가운데 가장 앞서는 것을 열쇠로 쓴다.
 * 묶음마다 서로 다른 모양이 몇 개인지 시험(net-blocked.test.ts·endgame.test.ts)이 센다
 */
import { type Board, xyOf } from "@game/baduk-engine";

const TRANSFORMS: readonly ((dx: number, dy: number) => [number, number])[] = [
  (x, y) => [x, y],
  (x, y) => [-y, x],
  (x, y) => [-x, -y],
  (x, y) => [y, -x],
  (x, y) => [-x, y],
  (x, y) => [x, -y],
  (x, y) => [y, x],
  (x, y) => [-y, -x],
];

/** `center` 둘레 모양의 열쇠. 판 대칭으로 돌린 같은 모양은 같은 열쇠다 */
export function shapeKey(
  board: Board,
  size: number,
  center: number,
  radius = 2,
): string {
  const [cx, cy] = xyOf(center, size);
  const cell = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return "#";
    return ".BW"[board[y * size + x] as number] as string;
  };
  const keys = TRANSFORMS.map((t) => {
    let s = "";
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        // 돌린 판의 (dx, dy) 자리에 오는 원래 판의 자리
        const [ox, oy] = t(dx, dy);
        s += cell(cx + ox, cy + oy);
      }
    return s;
  });
  return keys.sort()[0] as string;
}
