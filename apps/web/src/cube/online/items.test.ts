import {
  applyMoves,
  isRotation,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import {
  COLOR_PATTERNS,
  GRAY,
  lookColors,
  lookPatterns,
  oppositeColor,
  patternShape,
  patternStyle,
} from "../item-look";
import { findMarksOf } from "./item-find";
import {
  applyLogText,
  drawItem,
  effectiveMoves,
  hitText,
  ITEM_KINDS,
  ITEM_TABLE,
  type ItemKind,
  itemCheckpoints,
  itemOdds,
  itemUseText,
  lastEffectiveMove,
  mixMoves,
  parseItemMark,
  parseItemText,
  type Standing,
  standingOf,
  swappedColors,
  trackOf,
} from "./items";
import { stateHash } from "./race-game";

/** 아이템전 순수 계산(docs/51 3-3, docs/47 9-7) */

describe("뽑기", () => {
  it("같은 입력이면 어느 기기든 같은 아이템, 받는 사람·이정표·순위 줄이 다르면 따로 뽑는다", () => {
    const rules = { n: 3, hp: true };
    const a = drawItem("seed-1", "p1", 2, "middle", rules);
    expect(drawItem("seed-1", "p1", 2, "middle", rules)).toBe(a);
    const all = new Set<ItemKind>();
    for (let k = 0; k < 40; k++)
      all.add(drawItem(`seed-${k}`, "p1", 2, "middle", rules));
    // 여러 씨앗이면 여러 아이템이 나온다(한 가지로 굳지 않는다)
    expect(all.size).toBeGreaterThan(4);
  });

  it("순위별 확률 표: 1등은 방패·시간 줍기 위주, 꼴찌는 방패가 없고 강한 방해가 잦다", () => {
    const rules = { n: 3, hp: true };
    const first = itemOdds("first", rules);
    const last = itemOdds("last", rules);
    expect((first.shield ?? 0) + (first.heal ?? 0)).toBeGreaterThan(0.6);
    expect(first.mix).toBeUndefined();
    expect(first.blind).toBeUndefined();
    expect(last.shield).toBeUndefined();
    expect((last.mix ?? 0) + (last.blind ?? 0)).toBeGreaterThan(
      (itemOdds("middle", rules).mix ?? 0) +
        (itemOdds("middle", rules).blind ?? 0),
    );
    // 흑백 화면은 색 뒤집기보다 조금 세다, 찾아 주기는 뒤처질수록 잦다
    for (const s of ["middle", "last"] as Standing[]) {
      const row = ITEM_TABLE[s];
      expect(row.gray ?? 0).toBeGreaterThan(row.swap ?? 0);
    }
    expect(itemOdds("last", rules).find ?? 0).toBeGreaterThan(
      itemOdds("first", rules).find ?? 0,
    );
    for (const s of ["first", "middle", "last"] as Standing[]) {
      const odds = Object.values(itemOdds(s, rules));
      expect(odds.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 9);
    }
  });

  it("뽑은 비율이 표를 따른다(정해진 씨앗 3,000개, 결정적)", () => {
    const rules = { n: 3, hp: true };
    for (const s of ["first", "middle", "last"] as Standing[]) {
      const count = new Map<ItemKind, number>();
      const total = 3_000;
      for (let k = 0; k < total; k++) {
        const it = drawItem(`s${k}`, "p", 1, s, rules);
        count.set(it, (count.get(it) ?? 0) + 1);
      }
      for (const [kind, p] of Object.entries(itemOdds(s, rules)))
        expect(
          Math.abs((count.get(kind as ItemKind) ?? 0) / total - p),
        ).toBeLessThan(0.035);
    }
  });

  it("고를 수 없는 아이템은 나오지 않는다(체력바가 아니면 시간 줍기, 3×3이 아니면 힌트·찾아 주기)", () => {
    for (let k = 0; k < 500; k++) {
      const plain = drawItem(`x${k}`, "p", 1, "first", { n: 3, hp: false });
      expect(plain).not.toBe("heal");
      const small = drawItem(`x${k}`, "p", 1, "last", { n: 2, hp: true });
      expect(["hint", "find"]).not.toContain(small);
    }
  });

  it("순위 줄: 1등·가운데·꼴찌", () => {
    expect(standingOf(1, 2)).toBe("first");
    expect(standingOf(2, 2)).toBe("last");
    expect(standingOf(2, 4)).toBe("middle");
    expect(standingOf(1, 1)).toBe("first");
  });
});

describe("한 수 섞기와 특별한 수", () => {
  it("넣는 수는 1~2수, 바깥 면만, 둘째 수는 다른 축이고 같은 입력이면 같다", () => {
    const lengths = new Set<number>();
    for (let k = 1; k <= 60; k++) {
      const text = mixMoves("seed", "a", k, 3);
      expect(mixMoves("seed", "a", k, 3)).toBe(text);
      const moves = parseMoves(3, text);
      lengths.add(moves.length);
      expect(moves.every((m) => !isRotation(3, m))).toBe(true);
      if (moves.length === 2) expect(moves[0]?.axis).not.toBe(moves[1]?.axis);
      // 맞은 사람이 넣는 수 글로 그대로 읽힌다
      expect(parseItemText(3, hitText("a", k, text))).toMatchObject({
        item: "hit",
        moves: text,
      });
    }
    expect([...lengths].sort()).toEqual([1, 2]);
  });

  it("모양이 틀린 특별한 수는 읽지 않는다(방패는 쓰는 수가 없다)", () => {
    expect(parseItemText(3, "!u:shield")).toBeNull();
    expect(parseItemText(3, "!u:freeze")).toBeNull();
    expect(parseItemText(3, "!hit|a|0|R")).toBeNull();
    expect(parseItemText(3, "!hit|a|1|R U F")).toBeNull();
    expect(parseItemText(3, "!hit|a|1|x")).toBeNull();
    expect(parseItemText(3, "!hit|a|1|R  U")).toBeNull();
    expect(() => applyLogText(3, solvedCube(3), "!u:shield")).toThrow();
  });

  it("되감기는 내 마지막 3수를 되돌리고, 맞은 섞기는 그 수를 넣는다. 중간 지점 이름이 쓰기·넣기 차례대로 붙는다", () => {
    const start = applyMoves(3, solvedCube(3), parseMoves(3, "R U F D"));
    let s = start;
    for (const m of ["L", "B", "U2", "R'"]) s = applyLogText(3, s, m);
    const before3 = applyMoves(3, start, parseMoves(3, "L"));
    s = applyLogText(3, s, itemUseText("rewind"));
    expect(stateHash(s)).toBe(stateHash(before3));
    expect(trackOf(s).recent).toEqual([]);
    s = applyLogText(3, s, hitText("a", 1, "R U'"));
    expect(stateHash(s)).toBe(
      stateHash(applyMoves(3, before3, parseMoves(3, "R U'"))),
    );
    expect(itemCheckpoints(s)).toEqual(["!u1:rewind", "!h1|a|1|R U'"]);
    expect(parseItemMark("!u1:rewind")).toEqual({
      kind: "use",
      k: 1,
      item: "rewind",
    });
    expect(parseItemMark("!h1|a|1|R U'")).toEqual({
      kind: "inject",
      by: "a",
      k: 1,
      moves: "R U'",
    });
    expect(parseItemMark("cross")).toBeNull();
  });

  it("수 기록을 실제로 큐브에 들어간 수로 푼다(되돌리기는 마지막에 들어간 수를 거꾸로)", () => {
    const log = [
      { m: "R" },
      { m: "U" },
      { m: itemUseText("fog") },
      { m: hitText("a", 1, "F D") },
      { m: "L" },
      { m: itemUseText("rewind") },
    ];
    expect(effectiveMoves(3, log)).toEqual([
      ["R"],
      ["U"],
      [],
      ["F", "D"],
      ["L"],
      ["L'"],
    ]);
    expect(lastEffectiveMove(3, log.slice(0, 4))).toMatchObject(
      parseMoves(3, "D")[0] as object,
    );
  });
});

describe("색 뒤집기·흑백 화면 칠하기", () => {
  const custom = [0x111111, 0x222222, 0x333333, 0x444444, 0x555555, 0x666666];

  it("색 뒤집기는 맞은편 색끼리(흰↔노, 빨↔주, 초↔파), 사용자 색 배치여도 같다", () => {
    expect(swappedColors(custom)).toEqual([
      0x444444, 0x555555, 0x666666, 0x111111, 0x222222, 0x333333,
    ]);
    expect(lookColors(custom, { swap: true })).toEqual(swappedColors(custom));
    expect(lookColors(custom, null)).toEqual(custom);
    for (let c = 0; c < 6; c++) expect(oppositeColor(oppositeColor(c))).toBe(c);
  });

  it("흑백 화면: 모든 색이 같은 밝기의 회색이고, 색 번호마다 정해진 무늬(흰 민무늬·노랑 큰 점·빨강 고리·주황 점 넷·초록 점 아홉·파랑 고리 안 점)", () => {
    const gray = lookColors(custom, { gray: true });
    expect(new Set(gray)).toEqual(new Set([GRAY]));
    expect(lookPatterns({ gray: true })).toEqual([
      "none",
      "ring",
      "dots9",
      "dot",
      "dots4",
      "ringDot",
    ]);
    expect(COLOR_PATTERNS).toEqual(lookPatterns({ gray: true }));
    // 색 뒤집기와 함께면 무늬도 색 번호를 따라 맞은편으로
    expect(lookPatterns({ gray: true, swap: true })).toEqual(
      [0, 1, 2, 3, 4, 5].map((c) => COLOR_PATTERNS[oppositeColor(c)]),
    );
    expect(lookPatterns({ swap: true })).toBeNull();
    // 무늬는 방향이 없다: 점·고리뿐이고(선 없음), CSS도 원 그라디언트만
    for (const p of COLOR_PATTERNS) {
      const s = patternShape(p);
      expect(Object.keys(s)).toEqual(["dots", "rings"]);
      expect(patternStyle(p).backgroundImage ?? "").not.toContain("linear");
    }
    expect(patternShape("dots9").dots).toHaveLength(9);
    expect(patternShape("dots4").dots).toHaveLength(4);
  });
});

describe("찾아 주기", () => {
  it("다음 이정표의 안 맞은 조각 하나(십자 → F2L 짝)와 넣을 곳을 고른다. 두 층이 다 맞았으면 없다", () => {
    const s = applyMoves(3, solvedCube(3), parseMoves(3, "R U R' F2"));
    const marks = findMarksOf(s);
    expect(marks?.found.length).toBe(2);
    expect(marks?.slot.length).toBe(2);
    // 같은 상태면 늘 같은 조각
    expect(findMarksOf(s)).toEqual(marks);
    const pair = applyMoves(3, solvedCube(3), parseMoves(3, "R D R'"));
    // 십자는 맞고 F2L 짝이 빠졌다: 짝은 코너 + 엣지(스티커 다섯)
    expect(findMarksOf(pair)?.found.length).toBe(5);
    expect(
      findMarksOf(applyMoves(3, solvedCube(3), parseMoves(3, "D"))),
    ).toBeNull();
  });
});

it("아이템 종류마다 이름이 있다", async () => {
  const { ITEM_LABELS } = await import("./items");
  for (const k of ITEM_KINDS) expect(ITEM_LABELS[k]).toBeTruthy();
});
