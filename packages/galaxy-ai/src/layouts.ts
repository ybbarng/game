import {
  type BoardSquare,
  type BoardStar,
  type GalaxyBoard,
  STAR_SQUARES,
} from "@game/galaxy-engine";

/**
 * 별 자리 섞기 시험용 판 배치(docs/48 15-3, 2026-11-05). 엔진은 바꾸지 않고 bench만 쓴다.
 * - grouped: 지금 판(별자리 셋이 붙어 있다)
 * - spread(가 완전히 섞기): 별자리마다 별 셋을 판에 고르게 흩는다. 별 칸 차례 k = 별 번호 × 별자리 수 + 별자리 번호라
 *   같은 별자리 별은 별 칸 8개(판 칸 약 10~11개)씩 떨어진다. 한 변(별 칸 6)에 서로 다른 별자리 6개가 선다
 * - split(나 반쯤 섞기): 별자리마다 별 둘은 제 계절 변에 붙여 두고 남은 하나를 맞은편 변 가운데(공문 양옆)에 둔다.
 *   변 하나 = [제 별자리 A 둘, 맞은편 별자리 C 하나, 공문, 맞은편 별자리 D 하나, 제 별자리 B 둘]
 * 값·이름·밝기는 그대로이고 칸만 옮긴다. 별자리의 칸 목록은 판 차례로 다시 맞춘다.
 */
export type LayoutKind = "grouped" | "spread" | "split";

export const LAYOUT_NAMES: Record<LayoutKind, string> = {
  grouped: "지금(셋 붙임)",
  spread: "(가) 완전히 섞기",
  split: "(나) 반쯤 섞기(둘 + 맞은편 하나)",
};

/** 배치 kind의 별 칸 차례대로 (별자리 번호, 별자리 안 별 번호) */
export function layoutOrder(
  groups: number,
  size: number,
  kind: LayoutKind,
): [number, number][] {
  const order: [number, number][] = [];
  if (kind === "grouped") {
    for (let g = 0; g < groups; g++)
      for (let i = 0; i < size; i++) order.push([g, i]);
    return order;
  }
  if (kind === "spread") {
    for (let i = 0; i < size; i++)
      for (let g = 0; g < groups; g++) order.push([g, i]);
    return order;
  }
  // split: 별자리 여덟·별 셋(사계절 하늘)만. 변 s의 별자리는 2s·2s+1, 맞은편은 2((s+2)%4)·…+1
  if (groups !== 8 || size !== 3)
    throw new Error("반쯤 섞기는 별자리 8 × 별 3 하늘만");
  for (let s = 0; s < 4; s++) {
    const a = 2 * s;
    const b = a + 1;
    const o = 2 * ((s + 2) % 4);
    order.push([a, 0], [a, 1], [o, 2], [o + 1, 2], [b, 0], [b, 1]);
  }
  return order;
}

/** 판의 별을 배치 kind로 옮긴 새 판 */
export function layoutBoard(board: GalaxyBoard, kind: LayoutKind): GalaxyBoard {
  if (kind === "grouped") return board;
  const size = board.groups[0]?.squares.length ?? 0;
  const byGroup = board.groups.map((g) =>
    g.squares.map((sq) => board.squares[sq]?.star as BoardStar),
  );
  const order = layoutOrder(board.groups.length, size, kind);
  const squares: BoardSquare[] = board.squares.map((s) => ({
    ...s,
    star: null,
  }));
  const groupSquares: number[][] = board.groups.map(() => []);
  order.forEach(([g, i], k) => {
    const square = STAR_SQUARES[k] as number;
    const star = byGroup[g]?.[i] as BoardStar;
    (squares[square] as BoardSquare).star = { ...star, square };
    groupSquares[g]?.push(square);
  });
  return {
    ...board,
    squares,
    groups: board.groups.map((g, i) => ({
      ...g,
      squares: [...(groupSquares[i] as number[])].sort((x, y) => x - y),
    })),
  };
}
