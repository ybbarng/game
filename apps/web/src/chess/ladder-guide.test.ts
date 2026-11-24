/*
 * 룩 둘 사다리 메이트 방법(ladder-guide.ts)이 흑이 어떤 수로 받아도 정해진 수 안에 메이트하는지 본다.
 * 흑의 받는 수를 모두 끝까지 따라가(같은 판은 한 번만 센다) 가장 긴 수를 잰다. 고를 칸이 여럿이면 앞·뒤를 모두 본다.
 * 2026-11-17에 시작 판 8만여 개(앞 고르기 101판마다 하나, 뒤 고르기 103판마다 하나)를 같은 방법으로 돌려
 * 모두 18수 안에 메이트, 스테일메이트·룩 내줌·맴돌기 0을 확인했다(한 벌 8초 남짓이라 시험은 작은 표본으로 본다).
 */

import {
  type KrrkBoard,
  krrkBlackMoves,
  krrkBlackPlayed,
  krrkCheck,
  krrkWhitePlayed,
} from "@game/chess-ai";
import { describe, expect, it } from "vitest";

import {
  blackReply,
  drillBoard,
  drillGuide,
  drillPlayed,
  ENDGAME_LIMIT,
  ENDGAME_SETS,
  judgeDrill,
} from "./endgame";
import type { Frame, Tie } from "./endgame-guide";
import { ladderMove } from "./ladder-guide";

const LIMIT = ENDGAME_LIMIT.RR;
const name = (at: number) => `${"abcdefgh"[at & 7]}${8 - (at >> 3)}`;
const near = (a: number, b: number) =>
  Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 3) - (b >> 3))) <= 1;

/** 끝까지 따라간 결과: 메이트까지 가장 긴 수, 아니면 실패한 까닭 */
// 「draw」(비기는 판)는 폰 연습에만 나오지만 판정 결과의 종류는 같은 타입이다
type Worst = number | "stalemate" | "lost" | "draw" | "stuck" | "loop";

/**
 * 흑이 어떤 수로 받아도 방법대로 두면 몇 수 안에 메이트하나(백 차례 판, 가장 긴 갈래).
 * 같은 판(미는 쪽 포함)은 `memo`로 한 번만 센다. 판정은 연습 화면과 같은 `judgeDrill`(수 상한은 넉넉히)
 */
function worstCase(tie: Tie) {
  const memo = new Map<string, Worst>();
  const onPath = new Set<string>();
  const key = (b: KrrkBoard, f: Frame | null) =>
    `${b.wk},${b.bk},${Math.min(b.p, b.q)},${Math.max(b.p, b.q)},${f}`;
  const worse = (a: Worst, b: Worst): Worst =>
    typeof a === "string" ? a : typeof b === "string" ? b : Math.max(a, b);
  const walk = (b: KrrkBoard, f: Frame | null): Worst => {
    const k = key(b, f);
    const known = memo.get(k);
    if (known !== undefined) return known;
    if (onPath.has(k)) return "loop";
    onPath.add(k);
    let out: Worst;
    const m = ladderMove(b, tie, f);
    if (!m) out = "stuck";
    else {
      const verdict = judgeDrill("RR", b, m, 0);
      if (verdict.verdict === "solved") out = 1;
      else if (verdict.verdict === "wrong")
        out = verdict.miss === "limit" ? "stuck" : verdict.miss;
      else {
        const a = krrkWhitePlayed(b, m);
        out = 0;
        for (const r of krrkBlackMoves(a)) {
          const next = walk(krrkBlackPlayed(a, r.to), m.frame);
          out = worse(out, typeof next === "number" ? next + 1 : next);
          if (typeof out === "string") break;
        }
      }
    }
    onPath.delete(k);
    memo.set(k, out);
    return out;
  };
  return (b: KrrkBoard) => walk(b, null);
}

/** 놓일 수 있는 백 차례 판 가운데 `every`판마다 하나(늘 같은 판) */
function sample(every: number): KrrkBoard[] {
  const out: KrrkBoard[] = [];
  let i = 0;
  for (let wk = 0; wk < 64; wk++)
    for (let bk = 0; bk < 64; bk++) {
      if (bk === wk || near(wk, bk)) continue;
      for (let p = 0; p < 64; p++)
        for (let q = p + 1; q < 64; q++) {
          if (p === wk || p === bk || q === wk || q === bk) continue;
          const b = { wk, bk, p, q };
          if (krrkCheck(b)) continue;
          if (i++ % every === 0) out.push(b);
        }
    }
  return out;
}

const set = ENDGAME_SETS.find((s) => s.piece === "RR");
const drills = set?.drills ?? [];
const starts = drills.map(
  (d) => [d.id, drillBoard("RR", d.fen) as KrrkBoard] as const,
);

describe(`룩 둘: 흑이 어떤 수로 받아도 방법대로 두면 ${LIMIT}수 안에 메이트한다`, () => {
  it("연습 시작 판은 셋이고, 모두 백 차례에 흑 킹이 체크가 아니다", () => {
    expect(drills).toHaveLength(3);
    for (const [, b] of starts) {
      expect([b.wk, b.bk, b.p, b.q].every((at) => at >= 0)).toBe(true);
      expect(krrkCheck(b)).toBe(false);
    }
  });

  it.each(["first", "last"] as const)(
    "연습 시작 판: 고를 칸을 %s로 골라도 흑의 모든 받는 수에서 정해진 수 안에 메이트",
    (tie) => {
      const worst = worstCase(tie);
      for (const [id, b] of starts) {
        const w = worst(b);
        expect({ id, w }).toEqual({ id, w: expect.any(Number) });
        expect(w as number).toBeLessThanOrEqual(LIMIT);
      }
    },
  );

  it.each([
    ["first", 19_997],
    ["last", 20_011],
  ] as const)(
    "시작 판 표본(%s 고르기, %i판마다 하나): 흑의 모든 받는 수에서 정해진 수 안에 메이트, 스테일메이트·룩 내줌·맴돌기 없음",
    (tie, every) => {
      const worst = worstCase(tie);
      const failed: string[] = [];
      let longest = 0;
      const boards = sample(every);
      for (const b of boards) {
        const w = worst(b);
        if (typeof w === "string" || w > LIMIT)
          failed.push(
            `${name(b.wk)} ${name(b.bk)} ${name(b.p)} ${name(b.q)}: ${w}`,
          );
        else longest = Math.max(longest, w);
      }
      expect(boards.length).toBeGreaterThan(200);
      expect(failed).toEqual([]);
      expect(longest).toBeLessThanOrEqual(LIMIT);
    },
  );
});

describe("룩 둘 연습 흐름: 「수 보기」대로 두면 흑 킹(컴퓨터)이 버텨도 메이트", () => {
  it.each(drills.map((d) => [d.id, d] as const))("%s", (_id, d) => {
    let b = drillBoard("RR", d.fen);
    for (let step = 0; step < LIMIT; step++) {
      const move = drillGuide("RR", b);
      if (!move) throw new Error("방법이 둘 수를 못 찾았다");
      const verdict = judgeDrill("RR", b, move, step);
      if (verdict.verdict === "solved") return;
      expect(verdict.verdict).toBe("next");
      const reply = blackReply("RR", drillPlayed("RR", b, move));
      if (!reply) throw new Error("흑이 둘 수가 없다");
      b = reply.board;
    }
    throw new Error(`${LIMIT}수 안에 메이트하지 못했다`);
  });

  it("미는 쪽은 판에 적혀 다음 판으로 이어진다(흑이 받은 뒤에도 같은 쪽)", () => {
    const b = drillBoard("RR", drills[0]?.fen ?? "");
    const move = drillGuide("RR", b);
    if (!move) throw new Error("둘 수가 없다");
    const after = drillPlayed("RR", b, move);
    expect(after.frame).not.toBeNull();
    const reply = blackReply("RR", after);
    expect(reply?.board.frame).toBe(after.frame);
  });
});
