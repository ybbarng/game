import {
  type Board,
  indexOf,
  type Move,
  palaceOf,
  pointName,
  xyOf,
} from "@game/janggi-engine";

/*
 * 장기 끝내기 기초 「차 둘로 외통」의 방법(docs/23 「장기 끝내기 기초」).
 * 한에 궁만 남고 초에 차 둘이 남은 판에서, 차를 세로로만 움직여 한 궁을 1번 가로줄로 몰아 외통을 만든다.
 * 범위: 초 궁 95·사 85(사가 두 궁 사이를 막아 빅장이 없다), 두 차는 궁성 밖 서로 다른 세로줄(1~3·7~9번),
 * 한 궁은 한 궁성 어디든, 초가 둘 차례. rook-ladder.test.ts가 범위 안 모든 판에서 한의 모든 받는 수(쉬기 포함)를
 * 따라가 이 방법이 3수 안에 외통을 만드는지 본다(범위 안 10,935판).
 */

/** 방법의 단계: 1 장군(궁이 있는 가로줄로), 2 막기(궁 바로 아래 가로줄로) */
export type LadderStep = 1 | 2;

/** 차가 서 있는 자리들 */
const rooksOf = (board: Board) =>
  board.flatMap((cell, at) => (cell === "cR" ? [at] : []));

/** 자리의 가로줄 번호(맨 위 1번부터). 자리 이름 첫 글자와 같다(열째 줄은 0이 아니라 10) */
const rowOf = (at: number) => xyOf(at)[1] + 1;

/** 같은 세로줄에서 가로줄만 바꾼 자리 */
const toRow = (at: number, row: number) => indexOf(xyOf(at)[0], row - 1);

/**
 * 이 판에서 방법이 고르는 수들과 그 단계. 고를 수가 여럿이면 어느 것이든 된다(시험이 모두 본다).
 * 범위 밖의 판(차가 둘이 아님 등)이면 빈 목록
 */
export function ladderMoves(board: Board): { step: LadderStep; moves: Move[] } {
  const rooks = rooksOf(board);
  const king = board.indexOf("hK");
  if (rooks.length !== 2 || king < 0) return { step: 2, moves: [] };
  const row = rowOf(king);
  const below = rooks.filter((r) => rowOf(r) === row + 1);
  // 1. 궁이 3번 가로줄(궁성 맨 아래)에 있으면 어느 차든, 차 하나가 궁 바로 아래 가로줄을 막고 있으면 그 차 말고
  //    다른 차로 → 궁이 있는 가로줄에 장군
  if (row === 3 || below.length > 0) {
    const others = rooks.filter((r) => !below.includes(r));
    const movers = row === 3 || others.length === 0 ? rooks : others;
    return {
      step: 1,
      moves: movers.map((from) => ({ from, to: toRow(from, row) })),
    };
  }
  // 2. 그 밖에는 → 차 하나를 궁 바로 아래 가로줄로(장군이 아니다). 어느 차든 된다
  return {
    step: 2,
    moves: rooks.map((from) => ({ from, to: toRow(from, row + 1) })),
  };
}

/** 범위 안의 판인가: 초 궁 95·사 85, 차 둘이 궁성 밖 서로 다른 세로줄, 한은 궁만(한 궁성 안) */
export function inLadderRange(board: Board): boolean {
  const rooks = rooksOf(board);
  const king = board.indexOf("hK");
  const others = board.filter(
    (cell) => cell !== "" && cell !== "cR" && cell !== "hK",
  );
  if (rooks.length !== 2 || king < 0) return false;
  if (pointName(board.indexOf("cK")) !== "95") return false;
  if (pointName(board.indexOf("cA")) !== "85") return false;
  if (others.length !== 2) return false;
  const [kx, ky] = xyOf(king);
  if (palaceOf(kx, ky) !== "h") return false;
  const columns = rooks.map((r) => xyOf(r)[0]);
  return columns[0] !== columns[1] && columns.every((x) => x < 3 || x > 5);
}
