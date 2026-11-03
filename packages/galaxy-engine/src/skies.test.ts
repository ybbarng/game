import { beforeAll, describe, expect, it } from "vitest";

import { activeCards } from "./cards";
import { createMatch } from "./match";
import { STANDARD_RULES } from "./rules";
import {
  boardOfSky,
  DEFAULT_SKY,
  loadSky,
  OPEN_SKIES,
  SKIES,
  SKY_IDS,
} from "./skies";

describe("하늘 불러오기", () => {
  it("기본 하늘은 처음부터 있고, 다른 하늘은 불러오기 전에는 판을 만들지 않는다", async () => {
    expect(SKIES.has(DEFAULT_SKY)).toBe(true);
    expect(() => boardOfSky(DEFAULT_SKY)).not.toThrow();
    // 이 시험 파일 안에서 아직 아무도 부르지 않은 하늘
    expect(SKIES.has("south")).toBe(false);
    expect(() => boardOfSky("south")).toThrow(/불러오지 않은/);
    expect(() => boardOfSky("nowhere")).toThrow(/없는 하늘/);
    await expect(loadSky("nowhere")).rejects.toThrow(/없는 하늘/);
    const sky = await loadSky("south");
    expect(sky.id).toBe("south");
    expect(await loadSky("south")).toBe(sky);
    expect(boardOfSky("south").skyId).toBe("south");
  });
});

describe("하늘 자료로 판 만들기(docs/48 5-9)", () => {
  beforeAll(async () => {
    for (const id of SKY_IDS) await loadSky(id);
  });

  it("하늘마다 별 24개로 판이 서고, 판 값 합이 3,200~3,400이다", () => {
    for (const id of SKY_IDS) {
      const board = boardOfSky(id);
      expect(board.squares.filter((s) => s.kind === "star")).toHaveLength(24);
      expect(board.total).toBeGreaterThanOrEqual(3200);
      expect(board.total).toBeLessThanOrEqual(3400);
    }
  });

  it("사계절 하늘은 2-1 배치이고 큰개자리가 가장 비싸다", () => {
    const board = boardOfSky("seasons");
    expect(board.squares[14]?.star?.star.id).toBe("Sirius");
    const byId = Object.fromEntries(board.groups.map((g) => [g.id, g.base]));
    expect(byId.CMa).toBe(200);
    expect(byId.Peg).toBe(60);
  });

  it("공문은 해당 별이 없는 하늘에서 빠진다(가을 하늘에는 1등성이 없다)", () => {
    const autumn = activeCards(boardOfSky("autumn"));
    const seasons = activeCards(boardOfSky("seasons"));
    expect(autumn.length).toBeLessThan(seasons.length);
  });

  it("하늘 id 목록(sky-ids.ts)이 자료 파일과 같다", () => {
    expect([...SKIES.keys()].sort()).toEqual([...SKY_IDS].sort());
    for (const id of SKY_IDS) expect(SKIES.get(id)?.id).toBe(id);
    for (const id of OPEN_SKIES) expect(SKY_IDS).toContain(id);
  });

  it("처음 여는 하늘로 대국을 만들 수 있다", () => {
    for (const id of OPEN_SKIES) {
      expect(() =>
        createMatch(STANDARD_RULES, 1, boardOfSky(id)),
      ).not.toThrow();
    }
  });
});
