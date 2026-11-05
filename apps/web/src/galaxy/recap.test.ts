import {
  BANK,
  boardOfSky,
  type GameEvent,
  sellValue,
  starAt,
} from "@game/galaxy-engine";
import { describe, expect, it } from "vitest";

import { recapLine, recapOf } from "./recap";

/**
 * 사용자가 실제로 둔 판(2026-11-05)과 같은 모양: 나 2등(별빛 950, 별 11, 완성 0, 2/3 넷, 의뢰 못 이룸),
 * 컴퓨터 1등(별빛 450, 큰개 완성, 의뢰 「붉은 별 조사」 이룸 +150).
 * 사계절 하늘 칸: 페가수스 1·2·19, 안드로메다 6·7·21, 오리온 9·10·27, 큰개 14·15·29, 사자 3·17·18,
 * 목동 5·22·23, 거문고 11·25·26, 독수리 13·30·31
 */
const board = boardOfSky("seasons");
const owners = board.squares.map(() => -1);
for (const sq of [1, 2, 6, 7, 9, 10, 3, 17, 5, 11, 13]) owners[sq] = 0;
for (const sq of [14, 15, 29, 25, 26, 30, 31, 22, 23]) owners[sq] = 1;
const levels: number[] = board.squares.map((_, sq) =>
  owners[sq] === -1 ? 0 : 1,
);
levels[15] = 2;
const state = {
  board,
  owners,
  levels,
  mortgaged: board.squares.map(() => false),
  cash: [950, 450],
};
const sirius = 15;
const events: GameEvent[] = [
  { type: "pay", from: 0, to: 1, amount: 200, reason: "rent", square: sirius },
  { type: "pay", from: 0, to: 1, amount: 90, reason: "rent", square: 14 },
  { type: "pay", from: 1, to: 0, amount: 30, reason: "rent", square: 9 },
  { type: "pay", from: BANK, to: 0, amount: 120, reason: "salary" },
  { type: "pay", from: BANK, to: 1, amount: 120, reason: "salary" },
  { type: "pay", from: BANK, to: 0, amount: 100, reason: "observatory" },
  // 공문으로 받은 별빛은 지원금에 넣지 않는다
  { type: "pay", from: BANK, to: 0, amount: 50, reason: "card", card: 1 },
  { type: "requestRevealed", seat: 0, card: 1, done: false },
  { type: "requestRevealed", seat: 1, card: 3, done: true },
  { type: "pay", from: BANK, to: 1, amount: 150, reason: "request" },
];

describe("판 돌아보기 항목", () => {
  it("이용료·지원금·의뢰는 사건에서, 별·정거장·완성 보너스·남은 별빛은 끝난 판에서 센다", () => {
    const me = recapLine(events, state, 0);
    expect(me).toMatchObject({
      rentIn: 30,
      rentOut: 290,
      grants: 220,
      request: 0,
      completeBonus: 0,
      cash: 950,
      stations: 0,
    });
    const starSum = [1, 2, 6, 7, 9, 10, 3, 17, 5, 11, 13].reduce(
      (a, sq) => a + (starAt(board, sq)?.value ?? 0),
      0,
    );
    expect(me.stars).toBe(starSum);
    const cpu = recapLine(events, state, 1);
    expect(cpu).toMatchObject({
      rentIn: 290,
      rentOut: 30,
      grants: 120,
      request: 150,
      completeBonus: 100,
      cash: 450,
      stations: sellValue(board, sirius),
    });
  });
});

describe("견줄 사람과 놓친 기회", () => {
  it("2등이면 1등과 견주고, 놓친 기회를 사실로 보인다", () => {
    const r = recapOf(events, state, 0, [1, 0]);
    expect(r.rival).toBe(1);
    expect(r.missed).toEqual([
      "관측 의뢰 「1등성 밝기 측정」 못 이룸 · 이뤘으면 ✦150 더",
      "2/3에서 멈춘 별자리 4개(페가수스자리·안드로메다자리·오리온자리·사자자리) · 하나만 완성했어도 자산 ✦100 더, 이용료 2배",
      "끝날 때 쓰지 않은 별빛 ✦950",
    ]);
  });

  it("1등이면 2등과 견주고, 1등보다 적게 남긴 별빛은 놓친 기회로 보지 않는다", () => {
    const r = recapOf(events, state, 1, [1, 0]);
    expect(r.rival).toBe(0);
    expect(r.missed).toEqual([
      "2/3에서 멈춘 별자리 3개(목동자리·거문고자리·독수리자리) · 하나만 완성했어도 자산 ✦100 더, 이용료 2배",
    ]);
  });
});
