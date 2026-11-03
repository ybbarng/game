// @vitest-environment node
import { badukBotFor } from "@game/baduk-ai";
import { baseballBotFor } from "@game/baseball-ai";
import { chessBotFor } from "@game/chess-ai";
import { gostopBotFor } from "@game/gostop-ai";
import { janggiBotFor } from "@game/janggi-ai";
import { minhwatuBotFor } from "@game/minhwatu-ai";
import { nyrongppongBotFor } from "@game/nyrongppong-ai";
import { omokBotFor } from "@game/omok-ai";
import { yutBotFor } from "@game/yut-ai";
import { describe, expect, it } from "vitest";

import { badukAdvisor } from "../baduk/advisor";
import { chessAdvisor } from "../chess/advisor";
import { heartsBotFor } from "../hearts/bots";
import { loadBot, registeredGames } from "./bot-registry";
import { thinkWith, workerBot } from "./bot-runner";
import { botFor } from "./bots";

describe("컴퓨터 등록부", () => {
  it("열쇠로 그 게임 kit.botFor와 같은 봇을 불러온다", async () => {
    const table: [string, (level: number) => unknown, number[]][] = [
      ["mighty", (l) => botFor(l as 0 | 1 | 2), [0, 1, 2]],
      ["hearts", (l) => heartsBotFor(l as 0 | 1 | 2), [0, 1, 2]],
      ["chess", chessBotFor, [0, 1, 2]],
      ["janggi", janggiBotFor, [0, 1, 2, 3]],
      ["omok", omokBotFor, [0, 1, 2, 3]],
      ["baduk", badukBotFor, [0, 1, 2]],
      ["baseball", baseballBotFor, [0, 1, 2]],
      ["gostop", gostopBotFor, [0, 1, 2]],
      ["minhwatu", minhwatuBotFor, [0, 1, 2]],
      ["nyrongppong", nyrongppongBotFor, [0, 1, 2]],
      ["yut", yutBotFor, [0, 1, 2]],
    ];
    expect(registeredGames().sort()).toEqual(table.map(([g]) => g).sort());
    for (const [game, make, levels] of table)
      for (const level of levels)
        expect(await loadBot({ game, level })).toBe(make(level));
  });

  it("화면용 고수도 화면과 같은 봇이다", async () => {
    expect(await loadBot({ game: "chess", name: "advisor" })).toBe(
      chessAdvisor,
    );
    expect(await loadBot({ game: "baduk", name: "advisor" })).toBe(
      badukAdvisor,
    );
    expect(await loadBot({ game: "janggi", name: "advisor" })).toBe(
      janggiBotFor(2),
    );
  });

  it("워커가 없는 곳은 runBot을 주지 않고, 모르는 게임은 거절한다", async () => {
    expect(workerBot({ game: "chess", level: 1 })).toBeUndefined();
    await expect(loadBot({ game: "nope", level: 0 })).rejects.toThrow();
  });

  it("thinkWith는 받은 난수를 바꾸지 않고 바뀐 난수를 돌려준다", async () => {
    const bot = yutBotFor(1);
    const { createMatch, viewOf, STANDARD_RULES } = await import(
      "@game/yut-engine"
    );
    const { state } = createMatch(STANDARD_RULES, 5);
    const view = viewOf(state, 0);
    const rng = { seed: 99 };
    const result = await thinkWith({ game: "yut", level: 1 }, view, rng);
    expect(rng.seed).toBe(99);
    const same = { seed: 99 };
    expect(result.action).toEqual(bot.decide(view as never, same));
    expect(result.rng.seed).toBe(same.seed);
  });
});
