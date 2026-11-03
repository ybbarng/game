import {
  createBadukScenario,
  pointAt,
  STANDARD_RULES,
  step,
  viewOf,
} from "@game/baduk-engine";
import { createRng } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import { badukBeginnerBot, boardOfView, createBadukMasterBot } from "./bots";
import { FastBoard } from "./fast-board";
import { masterSearch } from "./master";
import { matchesPattern } from "./patterns";
import { playGame } from "./simulate";
import { atariMoves } from "./tactics";

/*
 * 초고수 시험. 둬 볼 판 수만 줄여(판 수와 상관없는 성질만 본다) 파일 하나가 2초 안쪽에 끝나게 한다.
 * 세기 비교는 `master.strength.ts`(bench)가 맡는다.
 */
const at = (name: string) => pointAt(name, 9);
const column = (c: string) =>
  Array.from({ length: 9 }, (_, i) => `${c}${i + 1}`);
/** 장면 시험용 초고수(판 수만 줄였다) */
const bot = createBadukMasterBot(1500);

function boardOf(black: string[], white: string[], toPlay: 1 | 2 = 1) {
  const s = createBadukScenario({ black, white, me: toPlay });
  return new FastBoard(9, s.board, toPlay);
}

describe("초고수의 바둑 지식", () => {
  it("3×3 모양: 젖히기 자리를 알아본다", () => {
    // 흑 D5, 백 E5 붙음 → D6·E6·D4·E4 근처가 젖힘 모양. 빈 판 한가운데는 모양이 아니다
    const b = boardOf(["D5"], ["E5"]);
    expect(matchesPattern(b, at("E6"))).toBe(true);
    expect(matchesPattern(new FastBoard(9), at("E5"))).toBe(false);
  });

  it("축 읽기: 축이 되면 단수로 몰아 잡고, 축머리가 있으면 잡지 못한다", () => {
    // 백 E5를 흑 D5·E6·F4가 감쌌다(활로 F5·E4). 흑 E4로 단수 치면 백은 F5로 달아나도 활로 둘이라
    // 오른쪽 위로 축에 몰려 판 끝에서 잡힌다
    const ladder = boardOf(["D5", "E6", "F4"], ["E5"]);
    const moves: number[] = [];
    atariMoves(ladder, at("E5"), true, moves);
    expect(moves).toEqual([at("E4")]);
    // 축이 가는 길(오른쪽 위)에 백 돌(축머리)이 있으면 그 축으로는 잡지 못한다
    const breaker = boardOf(["D5", "E6", "F4"], ["E5", "H8"]);
    const none: number[] = [];
    atariMoves(breaker, at("E5"), true, none);
    expect(none).not.toContain(at("E4"));
    // 받는 쪽(백 차례)은 축에 걸린 달아나기를 고르지 않는다
    const defend = boardOf(["D5", "E6", "F4", "E4"], ["E5"], 2);
    const escapes: number[] = [];
    atariMoves(defend, at("E5"), true, escapes);
    expect(escapes).toEqual([]);
  });
});

describe("초고수", () => {
  it("판 끝까지 규칙에 맞는 수만 둔다", () => {
    const end = playGame(
      [createBadukMasterBot(150), badukBeginnerBot],
      STANDARD_RULES,
      3,
    );
    expect(end.phase).toBe("gameOver");
    expect(end.result?.kind).toBe("score");
  });

  it("단수에 걸린 석 점을 따낸다", () => {
    const state = createBadukScenario({
      black: ["D6", "E6", "F6", "D4", "E4", "F4", "C5"],
      white: ["D5", "E5", "F5"],
    });
    expect(bot.decide(viewOf(state, 0), createRng(5))).toEqual({
      type: "place",
      at: at("G5"),
    });
  });

  it("크게 이기고 있어도 늦추지 않는다: 안전 여유를 두고 단수에 걸린 큰 무리를 살린다", () => {
    // 흑은 3줄 벽, 백은 8줄 벽. 흑 넉 점(D5~G5)이 단수(활로 H5). 덤을 흑에게 크게 줘(−22.5) 어느 수를 둬도
    // 이기는 판이다. 승률만 보면 수가 갈리지 않지만, 초고수는 여유 집을 목표에 더해 넉 점을 살린다
    const row = (r: number) => "ABCDEFGHJ".split("").map((c) => `${c}${r}`);
    const state = createBadukScenario({
      black: [...row(3), "D5", "E5", "F5", "G5", "J4"],
      white: [...row(8), "D6", "E6", "F6", "G6", "D4", "E4", "F4", "G4", "C5"],
    });
    const view = viewOf(state, 0);
    const r = masterSearch(boardOfView(view), -22.5, 1500, createRng(3), {
      allowed: view.legal,
    });
    expect(r.mode).toBe("ahead");
    expect(r.shift).toBeGreaterThan(0);
    expect(r.move).toBe(at("H5"));
  });

  /** 백이 쉰 뒤 흑 차례인 판 */
  function afterWhitePass(black: string[], white: string[]) {
    const state = createBadukScenario({ black, white, me: 2 });
    const r = step(state, 0, { type: "pass" });
    if (!r.ok) throw new Error(r.error);
    return viewOf(r.state, 1);
  }

  it("상대가 쉬었고 지금 세면 이기면 따라 쉰다", () => {
    const view = afterWhitePass(column("E"), column("G"));
    expect(bot.decide(view, createRng(1))).toEqual({ type: "pass" });
  });

  it("상대가 쉬었어도 지금 세면 지면 쉬지 않고 더 둔다", () => {
    const view = afterWhitePass(column("C"), column("E"));
    expect(bot.decide(view, createRng(1)).type).toBe("place");
  });

  it("판세를 센다: 이기면 안전 여유를 두고, 크게 지면 따라잡을 목표를, 조금 지면 진짜 승리를 노린다", () => {
    // 흑 D줄 벽, 백 F줄 벽. 집은 36 : 36이고 덤 7.5로 백이 이긴다(E줄 9점은 나눠 갖는다)
    const black = column("D");
    const white = column("F");
    const blackBoard = () =>
      boardOfView(viewOf(createBadukScenario({ black, white, me: 1 }), 0));
    const close = masterSearch(blackBoard(), 7.5, 600, createRng(1));
    expect(close.mode).toBe("behind");
    // 7.5집 차이: 목표를 낮추면 "조금 지는 것"을 이긴 것으로 세어 조용히 진다. 그대로 둔다
    expect(close.shift).toBe(0);
    // 덤을 25.5로 키워 크게 지는 판: 따라잡을 목표(덤을 덜 갚아도 되는 것으로 센다)
    const far = masterSearch(blackBoard(), 25.5, 600, createRng(1));
    expect(far.mode).toBe("behind");
    expect(far.shift).toBeLessThan(0);
    const winning = masterSearch(
      boardOfView(viewOf(createBadukScenario({ black, white, me: 2 }), 0)),
      7.5,
      600,
      createRng(1),
    );
    expect(winning.mode).toBe("ahead");
    expect(winning.shift).toBeGreaterThan(0);
  });

  it("같은 판·같은 시드면 같은 수를 둔다(사이에 다른 판을 읽거나 봇을 새로 만들어도)", () => {
    // 모듈 안에 되풀이해 쓰는 판(축 읽기용)이 있어도 결과는 입력만으로 정해져야 한다(웹 워커에서 새로 띄워도 같다)
    const state = createBadukScenario({
      black: ["E5", "D5", "E6", "F4"],
      white: ["D4", "E4"],
    });
    const first = createBadukMasterBot(400).decide(
      viewOf(state, 0),
      createRng(7),
    );
    // 사이에 다른 판(축이 있는 판, 13줄 판)을 읽힌다
    createBadukMasterBot(200).decide(
      viewOf(
        createBadukScenario({ black: ["D5", "E6", "F4"], white: ["E5"] }),
        0,
      ),
      createRng(1),
    );
    createBadukMasterBot(200).decide(
      viewOf(
        createBadukScenario({
          rules: { ...STANDARD_RULES, size: 13 },
          black: ["D4"],
          white: ["K10"],
        }),
        0,
      ),
      createRng(2),
    );
    expect(
      createBadukMasterBot(400).decide(viewOf(state, 0), createRng(7)),
    ).toEqual(first);
  });

  it("큰 판 첫 수는 귀(3·4선)에 둔다", () => {
    const rules = { ...STANDARD_RULES, size: 19 as const };
    const state = createBadukScenario({ rules, black: [], white: [] });
    const action = createBadukMasterBot(600).decide(
      viewOf(state, 0),
      createRng(2),
    );
    if (action.type !== "place") throw new Error("둬야 한다");
    const x = action.at % 19;
    const y = Math.floor(action.at / 19);
    const lx = Math.min(x, 18 - x);
    const ly = Math.min(y, 18 - y);
    expect([lx, ly].every((l) => l === 2 || l === 3)).toBe(true);
  });
});
