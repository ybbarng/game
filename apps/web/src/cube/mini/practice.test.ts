import { type CubeMove, parseMoves } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { twoHandKeymap } from "../input/keymaps";
import { PracticeSession, SOLVED_PAUSE_MS } from "../practice/session";
import { PRACTICE_STAGES, stageById } from "../practice/stages";
import { PRACTICE_KEY } from "../practice/store";
import { parseFromApp } from "./app-bridge";
import {
  MENU_STAGES,
  miniPracticeStorage,
  practiceBubbleLines,
} from "./practice";

const keymap = twoHandKeymap();
const mv = (t: string): CubeMove => parseMoves(3, t)[0] as CubeMove;

function memory() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

function session(mode: "follow" | "see" = "follow") {
  const clock = new ManualClock();
  const base = memory();
  const s = new PracticeSession({
    stage: stageById("beginner-second") as never,
    mode,
    keymap,
    clock,
    seed: () => 3,
    storage: miniPracticeStorage(base),
  });
  return { s, clock, base };
}

const KEYS = { again: "Enter" };

describe("Cubie 공식 연습 기록 자리", () => {
  it("사이트 연습 기록 꼴 그대로 cube.mini. 아래에 둔다(사이트 기록·맞추기 기록과 섞이지 않는다)", () => {
    const { s, clock, base } = session();
    for (const t of s.tokens) {
      clock.advance(100);
      s.input(mv(t));
    }
    expect([...base.m.keys()]).toEqual(["cube.mini.practice.v1"]);
    expect(base.m.has(PRACTICE_KEY)).toBe(false);
    expect(base.m.has("cube.mini.v1")).toBe(false);
  });
});

describe("앱 메뉴에 넘길 단계", () => {
  it("사이트 연습 단계 그대로, 초보자 묶음 → CFOP 묶음 → ZZ 묶음", () => {
    expect(MENU_STAGES.map((s) => s.id)).toEqual(
      PRACTICE_STAGES.map((s) => s.id),
    );
    expect([...new Set(MENU_STAGES.map((s) => s.group))]).toEqual([
      "초보자",
      "CFOP",
      "ZZ",
    ]);
    expect(MENU_STAGES[0]).toEqual({
      id: "beginner-cross",
      title: "십자",
      group: "초보자",
    });
  });
});

describe("작은 창의 말풍선 줄", () => {
  it("따라 치기: 공식 글자만 보이고 키는 숨긴다. 친 낱말은 done, 지금 칠 낱말은 now", () => {
    const { s, clock } = session();
    clock.advance(100);
    s.input(mv(s.tokens[0] as string));
    const lines = practiceBubbleLines(s, keymap, KEYS);
    expect(lines[0]).toEqual({ text: "2층 1/10 · 콤보 0", style: "title" });
    const alg = lines.find((l) => l.style === "alg");
    expect(alg?.text).toBe(s.tokens.join(" "));
    const words = alg?.spans?.filter((x) => x.text !== " ");
    expect(words?.map((x) => x.style)).toEqual(
      s.tokens.map((_, i) => (i === 0 ? "done" : i === 1 ? "now" : "next")),
    );
    expect(lines.some((l) => l.style === "keys")).toBe(false);
  });

  it("틀리면 그 한 수의 키만 보인다(두 손 배치 키캡)", () => {
    const { s } = session();
    const want = s.tokens[0] as string;
    s.input(mv(want.startsWith("D") ? "B" : "D"));
    const lines = practiceBubbleLines(s, keymap, KEYS);
    const keys = lines.filter((l) => l.style === "keys");
    expect(keys).toHaveLength(1);
    expect(keys[0]?.text.startsWith(`${want}  `)).toBe(true);
    expect(
      lines.find((l) => l.style === "alg")?.spans?.find((x) => x.text === want)
        ?.style,
    ).toBe("wrong");
  });

  it("맞추면 맞춤 줄, 판이 끝나면 결과와 한 판 더 키", () => {
    const { s, clock } = session();
    for (let k = 0; k < 10; k++) {
      for (const t of s.tokens.slice(s.at)) {
        clock.advance(200);
        s.input(mv(t));
      }
      if (k === 0)
        expect(practiceBubbleLines(s, keymap, KEYS).at(-1)).toEqual({
          text: "맞춤",
          style: "ok",
        });
      clock.advance(SOLVED_PAUSE_MS);
    }
    const lines = practiceBubbleLines(s, keymap, KEYS);
    const sum = s.summary;
    if (!sum) throw new Error("판이 끝나지 않았다");
    const slowName = s.caseOf(sum.slow[0]?.caseId as string)?.name;
    expect(lines.map((l) => l.text)).toEqual(
      expect.arrayContaining([
        "2층 한 판 끝",
        expect.stringMatching(/^정확도 100% · 평균 \d+\.\d\d초$/),
        `1분에 ${Math.round(sum.perMinute)}수 · 가장 긴 콤보 10`,
        "느렸던 공식",
        expect.stringMatching(new RegExp(`^${slowName}  \\d+\\.\\d\\d초$`)),
        "Enter 한 판 더 · Esc 연습 끝내기",
      ]),
    );
  });

  it("보고 치기: 펼치기 전에는 공식이 없다", () => {
    const { s } = session("see");
    expect(
      practiceBubbleLines(s, keymap, KEYS).some((l) => l.style === "alg"),
    ).toBe(false);
    s.peek();
    expect(
      practiceBubbleLines(s, keymap, KEYS).some((l) => l.style === "alg"),
    ).toBe(true);
  });
});

describe("다리: practice 메시지", () => {
  it("단계 시작·끝내기·방식을 읽고, 틀린 꼴은 버린다", () => {
    expect(parseFromApp({ type: "practice", stage: "f2l" })).toEqual({
      type: "practice",
      stage: "f2l",
    });
    expect(
      parseFromApp({ type: "practice", stage: "oll", mode: "see" }),
    ).toEqual({ type: "practice", stage: "oll", mode: "see" });
    expect(parseFromApp({ type: "practice", stage: null })).toEqual({
      type: "practice",
      stage: null,
    });
    expect(parseFromApp({ type: "practice", stage: 3 })).toBeNull();
    expect(parseFromApp({ type: "practice", stage: "f2l", mode: "x" })).toEqual(
      { type: "practice", stage: "f2l" },
    );
  });
});
