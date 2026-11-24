import { createHash } from "node:crypto";

import { STANDARD_RULES as BADUK_RULES } from "@game/baduk-engine";
import { STANDARD_RULES as BASEBALL_RULES } from "@game/baseball-engine";
import { STANDARD_RULES as CHESS_RULES } from "@game/chess-engine";
import { STANDARD_RULES as GALAXY_RULES } from "@game/galaxy-engine";
import { MATGO_RULES } from "@game/gostop-engine";
import { WINDOWS_RULES } from "@game/hearts-engine";
import { STANDARD_RULES as JANGGI_RULES } from "@game/janggi-engine";
import { createRng, presetRules } from "@game/mighty-engine";
import { STANDARD_RULES as MINHWATU_RULES } from "@game/minhwatu-engine";
import { STANDARD_RULES as NYRONGPPONG_RULES } from "@game/nyrongppong-engine";
import { STANDARD_RULES as OMOK_RULES } from "@game/omok-engine";
import { STANDARD_ONECARD_RULES } from "@game/onecard-engine";
import { STANDARD_RULES as YUT_RULES } from "@game/yut-engine";
import { expect } from "vitest";

import { badukKit } from "../baduk/kit";
import { baseballKit } from "../baseball/kit";
import { chessKit } from "../chess/kit";
import { galaxyKit } from "../galaxy/kit";
import { gostopKit } from "../gostop/kit";
import { heartsKit } from "../hearts/kit";
import { janggiKit } from "../janggi/kit";
import { minhwatuKit } from "../minhwatu/kit";
import { nyrongppongKit } from "../nyrongppong/kit";
import { omokKit } from "../omok/kit";
import { onecardKit } from "../onecard/kit";
import { yutKit } from "../yut/kit";
import { botPlanOf, type GameKit } from "./kit";
import { mightyKit } from "./mighty-kit";

/**
 * 컴퓨터 계획 판 번호(`GameKit.botPlan`)를 올리는 것을 잊지 않게 하는 지문(docs/07 「컴퓨터 계획 판 번호」).
 *
 * 정해진 씨앗으로 판을 두어 가며 걸음마다 온라인 방이 쓰는 단계 컴퓨터들이 그 자리에서 둘 수를 모아 해시한다.
 * 컴퓨터 판단이 바뀌면 지문이 바뀌고, 그 게임의 지금 번호에 남긴 지문과 달라 시험이 실패한다. 그때는
 * ① 그 게임 `botPlan`을 하나 올리고 ② 아래 `PRINTS`에 새 번호와 새 지문을 **한 줄 더한다**(옛 줄은 고치지 않는다).
 * 컴퓨터 판단은 그대로인데 지문만 바뀌었다면(이 파일의 씨앗·걸음 수를 바꾼 경우) 모든 줄을 새로 잰다.
 *
 * 표본이라 드문 국면만 바꾸는 고침은 지문이 그대로일 수 있다. 컴퓨터를 고친 PR은 지문이 바뀌는지 보고, 그대로면
 * 그 국면이 나오도록 `steps`를 늘린다. 판 수만 쓰는 컴퓨터만 둔다(시계를 보는 컴퓨터는 온라인 방에서 쓰지 않는다)
 */
export const PRINTS: Readonly<
  Record<string, Readonly<Record<number, string>>>
> = {
  // 2: 조커콜 가리기(PR #321, 2026-11-17)
  mighty: { 1: "0dac799a1d6e1907", 2: "b95fc6345c0bdcd9" },
  hearts: { 1: "ec73feddd42ca178" },
  chess: { 1: "e92c3bbdf283ff79" },
  janggi: { 1: "11865a0ffd88dfbd" },
  omok: { 1: "e2719c82992f851d" },
  baduk: { 1: "86daaeceb8991321" },
  baseball: { 1: "d3ab961bcf234a58" },
  gostop: { 1: "99a869877fba3225" },
  minhwatu: { 1: "717685201ecc148f" },
  nyrongppong: { 1: "6dca13589bca4733" },
  yut: { 1: "b9685dfb22fcb9c5" },
  galaxy: { 1: "0f1c70be791ff78d" },
  onecard: { 1: "b6c7e2fa78cad443" },
};

// biome-ignore lint/suspicious/noExplicitAny: 게임마다 모양이 다르다
type AnyKit = GameKit<any, any, any, any, any, any>;

export interface PlanCase {
  kit: AnyKit;
  rules: unknown;
  /** 온라인 방이 쓰는 단계(판 끝에 다시 계산하는 컴퓨터). 첫 단계가 판을 이끈다 */
  levels: number[];
  /** 첫 단계 밖의 단계를 몇 걸음째마다 물어볼까(생각이 긴 컴퓨터는 듬성듬성, 없으면 걸음마다) */
  every?: Record<number, number>;
  /** 모두 몇 걸음 둘까(게임이 끝나면 다음 씨앗으로 새 게임, 없으면 600) */
  steps?: number;
}

/** 카드 게임(온라인 방이 고른 단계를 쓰는 마이티·하트는 세 단계 모두) */
export const CARD_CASES: PlanCase[] = [
  {
    kit: mightyKit,
    rules: presetRules("standard5"),
    levels: [0, 1, 2],
    every: { 2: 150 },
    steps: 3000,
  },
  {
    kit: heartsKit,
    rules: WINDOWS_RULES,
    levels: [0, 1, 2],
    every: { 2: 40 },
    steps: 1000,
  },
  { kit: gostopKit, rules: MATGO_RULES, levels: [1] },
  { kit: minhwatuKit, rules: MINHWATU_RULES, levels: [1] },
  { kit: nyrongppongKit, rules: NYRONGPPONG_RULES, levels: [1] },
  { kit: onecardKit, rules: STANDARD_ONECARD_RULES, levels: [1] },
];

/** 판 게임(온라인 방은 중수 하나, `RoomScreen`의 `boardRoom`) */
export const BOARD_CASES: PlanCase[] = [
  { kit: chessKit, rules: CHESS_RULES, levels: [1], steps: 40 },
  { kit: janggiKit, rules: JANGGI_RULES, levels: [1], steps: 30 },
  { kit: omokKit, rules: OMOK_RULES, levels: [1], steps: 120 },
  { kit: badukKit, rules: BADUK_RULES, levels: [1], steps: 4 },
  { kit: baseballKit, rules: BASEBALL_RULES, levels: [1] },
  { kit: yutKit, rules: YUT_RULES, levels: [1] },
  { kit: galaxyKit, rules: GALAXY_RULES, levels: [1] },
];

/**
 * 판 게임 지문은 무거워서(바둑 한 수 약 0.1초 등) 시험 파일 둘로 나눠 동시에 돈다. 묶음마다 게임 id.
 * `bot-plan-board.test.ts`가 첫 묶음, `bot-plan-board-b.test.ts`가 둘째 묶음을 보고, 모든 판 게임이
 * 한 묶음에만 드는지는 `bot-plan-board.test.ts` 「판 게임은 모두 한 시험 파일에서만 지문을 잰다」가 본다
 */
export const BOARD_GROUPS: readonly (readonly string[])[] = [
  ["chess", "janggi", "omok"],
  ["baduk", "baseball", "yut", "galaxy"],
];

/** 묶음 하나의 판 게임 경우들(묶음 차례대로) */
export function boardGroup(index: number): PlanCase[] {
  const ids = BOARD_GROUPS[index] ?? [];
  return BOARD_CASES.filter((c) => ids.includes(c.kit.id));
}

/** 지문 하나(16자리) */
export function fingerprint({
  kit,
  rules,
  levels,
  every = {},
  steps = 600,
}: PlanCase): string {
  const bots = levels.map((l) => kit.botFor?.(l));
  if (bots.some((b) => !b)) throw new Error(`${kit.id}: 컴퓨터가 없다`);
  const hash = createHash("sha256");
  let seed = 20261117;
  let { state } = kit.createMatch(rules, seed);
  let moved = false;
  const next = () => {
    if (!moved) throw new Error(`${kit.id}: 한 수도 두지 못하고 끝났다`);
    seed++;
    state = kit.createMatch(rules, seed).state;
    moved = false;
  };
  for (let i = 0; i < steps; i++) {
    let seat = kit.pendingSeats(state)[0];
    let action: unknown;
    if (seat === undefined) {
      const auto = kit.autoAction?.(state, i);
      if (!auto) {
        next();
        continue;
      }
      seat = auto.seat;
      action = auto.action;
    } else {
      const view = kit.viewOf(state, seat);
      if (kit.isOver(view)) {
        next();
        continue;
      }
      // 첫 단계는 걸음마다 묻고 그 수로 둔다. 생각이 긴 단계는 `every` 걸음마다
      for (const [b, bot] of bots.entries()) {
        if (b > 0 && i % (every[levels[b] as number] ?? 1) !== 0) continue;
        const decided = bot?.decide(view, createRng(i));
        if (b === 0) action = decided;
        hash.update(`${i}:${levels[b]}:${JSON.stringify(decided)}\n`);
      }
    }
    const result = kit.step(state, seat, action);
    if (!result.ok)
      throw new Error(`${kit.id}: ${i}번째 수를 엔진이 받지 않았다`);
    state = result.state;
    moved = true;
  }
  return hash.digest("hex").slice(0, 16);
}

/** 그 게임의 지금 번호에 남긴 지문과 맞는가 */
export function expectPlanPrint(c: PlanCase): void {
  const plan = botPlanOf(c.kit);
  const print = fingerprint(c);
  const known = PRINTS[c.kit.id]?.[plan];
  const hint =
    known === undefined
      ? `PRINTS의 ${c.kit.id}에 ${plan}: "${print}"를 더한다`
      : `컴퓨터 판단을 바꿨으면 botPlan을 ${plan + 1}(으)로 올리고 PRINTS에 ${plan + 1}: "${print}"를 더한다`;
  expect(
    { plan, print },
    `${c.kit.id} 컴퓨터 지문이 번호 ${plan}에 남긴 것과 다르다. ${hint}(bot-plan-fixture.ts 설명)`,
  ).toEqual({ plan, print: known });
}
