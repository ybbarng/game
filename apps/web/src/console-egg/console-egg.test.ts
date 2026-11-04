import { describe, expect, it } from "vitest";

import { GAMES } from "@/games/registry";

import { EGGS, type EggKey } from "./eggs";
import { createConsoleEgg, type EggConsole, eggKeyFor } from "./print";

/** 쓰라고 한 것만 받는 콘솔 대역. `error`·`warn`을 부르면 바로 실패한다 */
function fakeConsole() {
  const calls: { method: string; args: unknown[] }[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
    };
  const out: EggConsole = {
    log: record("log"),
    group: record("group"),
    groupEnd: record("groupEnd"),
    table: record("table"),
  };
  const strict = new Proxy(out, {
    get(target, prop) {
      if (prop in target) return target[prop as keyof EggConsole];
      throw new Error(`console.${String(prop)}는 쓰지 않는다`);
    },
  });
  return { out: strict, calls };
}

const ORIGIN = "https://game.byb.kr";

/** 고정폭에서의 폭: 한글·한자 같은 넓은 글자는 2 */
function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    width += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿＀-｠]/u.test(ch) ? 2 : 1;
  }
  return width;
}

describe("콘솔 인사 표", () => {
  it("홈과 등록부의 모든 게임에 인사가 있다", () => {
    const keys = Object.keys(EGGS);
    expect(keys).toContain("home");
    for (const game of GAMES) expect(keys).toContain(game.id);
  });

  it("그림은 영문·기호만, 한 줄 60자 안쪽이다", () => {
    for (const [key, egg] of Object.entries(EGGS)) {
      expect(egg.art.length, key).toBeGreaterThan(0);
      for (const row of egg.art) {
        expect(row, key).toMatch(/^[\x20-\x7e♠♥◆♣]*$/u);
        expect(displayWidth(row), `${key}: ${row}`).toBeLessThanOrEqual(60);
      }
    }
  });

  it("글은 마침표로 끝난다", () => {
    for (const [key, egg] of Object.entries(EGGS)) {
      for (const line of [...egg.lines, egg.table?.caption ?? "."]) {
        expect(line.endsWith("."), `${key}: ${line}`).toBe(true);
      }
    }
  });

  it("부정을 부추기는 말, 화면 시험이 오류로 세는 낱말을 쓰지 않는다", () => {
    for (const [key, egg] of Object.entries(EGGS)) {
      const text = [egg.title, ...egg.lines, ...egg.art].join("\n");
      expect(text, key).not.toMatch(/치트|해킹|조작해|cheat|hack/iu);
      // e2e/fair-multi가 이 낱말이 든 콘솔 글을 오류로 센다
      expect(text, key).not.toContain("멘탈 포커");
      expect(text, key).not.toMatch(/^\[fair\]/u);
    }
  });

  it("별 따기 인사는 이야기 말(docs/41)을 쓴다", () => {
    const text = EGGS.stardraw.lines.join("\n");
    expect(text).not.toMatch(/추첨|응모|당첨|적중|drand|해시|서버|난수/u);
    expect(text).toContain("관측");
  });

  it("바깥 이미지를 부르지 않는다", () => {
    const { out, calls } = fakeConsole();
    for (const key of Object.keys(EGGS) as EggKey[]) {
      createConsoleEgg(out, ORIGIN)(key === "home" ? "/" : `/${key}`);
    }
    const styles = calls.flatMap((call) => call.args).join("\n");
    expect(styles).not.toMatch(/url\(/iu);
  });
});

describe("주소 → 인사", () => {
  it("첫 마디로 고른다", () => {
    expect(eggKeyFor("/")).toBe("home");
    expect(eggKeyFor("")).toBe("home");
    expect(eggKeyFor("/omok")).toBe("omok");
    expect(eggKeyFor("/omok/")).toBe("omok");
    expect(eggKeyFor("/cube/learn")).toBe("cube");
    expect(eggKeyFor("/stardraw/verify/")).toBe("stardraw");
    expect(eggKeyFor("/security")).toBe("security");
    expect(eggKeyFor("/learn")).toBe("learn");
  });

  it("등록부의 모든 게임 주소가 그 게임 인사로 간다", () => {
    for (const game of GAMES) expect(eggKeyFor(game.path)).toBe(game.id);
  });

  it("인사가 없는 페이지는 null", () => {
    expect(eggKeyFor("/profile")).toBeNull();
    expect(eggKeyFor("/no-such-page")).toBeNull();
  });
});

describe("찍기", () => {
  it("같은 게임 안에서 옮겨 다니면 다시 찍지 않고, 게임이 바뀌면 찍는다", () => {
    const { out, calls } = fakeConsole();
    const show = createConsoleEgg(out, ORIGIN);
    expect(show("/cube")).toBe(true);
    expect(show("/cube/learn")).toBe(false);
    expect(show("/cube/timer")).toBe(false);
    expect(show("/profile")).toBe(false);
    expect(show("/cube")).toBe(false);
    expect(show("/omok")).toBe(true);
    expect(show("/")).toBe(true);
    const groups = calls.filter((call) => call.method === "group");
    expect(groups.map((call) => call.args[0])).toEqual([
      `%c ${EGGS.cube.title} `,
      `%c ${EGGS.omok.title} `,
      `%c ${EGGS.home.title} `,
    ]);
  });

  it("묶음을 열고 닫으며, 사이트 안 링크에는 사이트 주소를 붙인다", () => {
    const { out, calls } = fakeConsole();
    createConsoleEgg(out, ORIGIN)("/stardraw");
    expect(calls[0]?.method).toBe("group");
    expect(calls.at(-1)?.method).toBe("groupEnd");
    const text = calls.flatMap((call) => call.args).join("\n");
    expect(text).toContain("https://game.byb.kr/stardraw/verify");
    expect(text).toContain("https://github.com/ybbarng/game");
  });

  it("표가 있는 게임은 console.table로 찍는다", () => {
    const { out, calls } = fakeConsole();
    createConsoleEgg(out, ORIGIN)("/baseball");
    const table = calls.find((call) => call.method === "table");
    expect(table?.args[0]).toEqual(EGGS.baseball.table?.rows);
  });
});
