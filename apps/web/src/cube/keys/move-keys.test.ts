import { describe, expect, test } from "vitest";

import { notationToMove } from "../input/actions";
import { KeyInterpreter } from "../input/interpreter";
import { bind, type KeyChord, presetKeymap, unbind } from "../input/keymaps";
import {
  keycapLabel,
  keysForMove,
  normalizeMove,
  splitMoveText,
} from "./move-keys";

const twoHand = presetKeymap("twoHand");
const notation = presetKeymap("notation");
const caps = (keys: KeyChord[] | null) =>
  keys ? keys.map(keycapLabel).join(" ") : null;

describe("수 → 키(배우기·튜토리얼이 보이는 키)", () => {
  test("「두 손」: 면·반대·반 바퀴·넓게·큐브 돌리기", () => {
    expect(caps(keysForMove(twoHand, 3, "R"))).toBe("I");
    expect(caps(keysForMove(twoHand, 3, "R'"))).toBe("K");
    expect(caps(keysForMove(twoHand, 3, "R2"))).toBe("I I");
    expect(caps(keysForMove(twoHand, 3, "U'"))).toBe("F");
    expect(caps(keysForMove(twoHand, 3, "Rw"))).toBe("U");
    expect(caps(keysForMove(twoHand, 3, "r"))).toBe("U");
    expect(caps(keysForMove(twoHand, 3, "r'"))).toBe("M");
    // x는 T·Y 두 키에 놓였다. 키 익히기와 같이 앞의 것(T)
    expect(caps(keysForMove(twoHand, 3, "x"))).toBe("T");
    expect(caps(keysForMove(twoHand, 3, "M'"))).toBe("X");
  });

  test("「두 손」: 안쪽 한 층은 csTimer의 가운데 줄 키 하나(수 하나라 중간 모양이 없다)", () => {
    expect(caps(keysForMove(twoHand, 4, "2R"))).toBe(".");
    expect(caps(keysForMove(twoHand, 4, "2R'"))).toBe("6");
    expect(caps(keysForMove(twoHand, 4, "2L"))).toBe("5");
    expect(caps(keysForMove(twoHand, 4, "2L'"))).toBe("X");
    expect(caps(keysForMove(twoHand, 4, "2R2"))).toBe(". .");
    expect(caps(keysForMove(twoHand, 4, "Rw"))).toBe("U");
  });

  test("「두 손」: 층 수 키를 포함한 차례(3Rw = 7 → U), 지금 층 수에서 시작", () => {
    expect(caps(keysForMove(twoHand, 5, "3Rw"))).toBe("7 U");
    expect(caps(keysForMove(twoHand, 5, "3Lw'"))).toBe("4 R");
    expect(caps(keysForMove(twoHand, 5, "M"))).toBe("7 6");
    expect(caps(keysForMove(twoHand, 6, "3R"))).toBe("7 .");
    expect(caps(keysForMove(twoHand, 7, "4Rw"))).toBe("7 7 U");
    // 오른손 층 수 2를 잡고 있으면: R은 8로 되돌린 뒤 I, Rw(2층)는 그대로 I, 3Rw는 U
    const two = { left: 1, right: 2 };
    expect(caps(keysForMove(twoHand, 5, "R", two))).toBe("8 I");
    expect(caps(keysForMove(twoHand, 5, "Rw", two))).toBe("I");
    expect(caps(keysForMove(twoHand, 5, "3Rw", two))).toBe("U");
    // 층 수를 따르지 않는 면은 그대로
    expect(caps(keysForMove(twoHand, 5, "U", two))).toBe("J");
    // U·D·F·B 쪽 깊은 넓게는 csTimer에도 키가 없다
    expect(keysForMove(twoHand, 5, "3Uw")).toBeNull();
    // 3×3에는 층 수 키가 없다
    expect(keysForMove(twoHand, 3, "3Rw")).toBeNull();
  });

  test("키 차례를 해석기로 치면 그 수 하나만 돈다", () => {
    for (const [n, nota] of [
      [4, "2R"],
      [5, "3Rw"],
      [5, "M"],
      [6, "3R'"],
      [7, "3Lw"],
      [4, "R2"],
    ] as const) {
      const keys = keysForMove(twoHand, n, nota);
      expect(keys).not.toBeNull();
      const it = new KeyInterpreter(n, twoHand);
      const moves = (keys ?? [])
        .map((k) =>
          it.handle({
            code: k.code,
            shiftKey: !!k.shift,
            altKey: !!k.alt,
            ctrlKey: false,
            metaKey: false,
            repeat: false,
          }),
        )
        .filter((r) => r?.kind === "move");
      const want = notationToMove(n, nota);
      if (nota.endsWith("2")) expect(moves).toHaveLength(2);
      else {
        expect(moves).toHaveLength(1);
        expect(moves[0]).toMatchObject({ move: want });
      }
    }
  });

  test("「두 손」: E·S는 csTimer 숫자 키", () => {
    expect(caps(keysForMove(twoHand, 3, "E"))).toBe("2");
    expect(caps(keysForMove(twoHand, 3, "S'"))).toBe("1");
    expect(caps(keysForMove(twoHand, 5, "E'"))).toBe("9");
  });

  test("「표기」: 글자 그대로, Shift는 반대, Alt는 넓게", () => {
    expect(caps(keysForMove(notation, 3, "R"))).toBe("R");
    expect(caps(keysForMove(notation, 3, "R'"))).toBe("⇧R");
    expect(caps(keysForMove(notation, 3, "F2"))).toBe("F F");
    expect(caps(keysForMove(notation, 3, "Rw'"))).toBe("Alt+⇧R");
    expect(caps(keysForMove(notation, 3, "E"))).toBe("E");
    expect(caps(keysForMove(notation, 3, "y'"))).toBe("⇧Y");
    expect(caps(keysForMove(notation, 4, "2R"))).toBe("2 R");
    expect(caps(keysForMove(notation, 4, "2R'"))).toBe("2 ⇧R");
  });

  test("크기에 없는 수는 키 없음(2×2의 M·Rw, 3×3의 3R)", () => {
    expect(keysForMove(notation, 2, "M")).toBeNull();
    expect(keysForMove(notation, 2, "Rw")).toBeNull();
    expect(keysForMove(notation, 3, "3R")).toBeNull();
    expect(caps(keysForMove(notation, 2, "R2"))).toBe("R R");
  });

  test("사용자 배치: 바꾼 키를 따르고, 지운 수는 키 없음", () => {
    let custom = bind(twoHand, { code: "KeyQ" }, "R");
    custom = unbind(custom, { code: "KeyI" });
    expect(caps(keysForMove(custom, 3, "R"))).toBe("Q");
    expect(caps(keysForMove(custom, 3, "R2"))).toBe("Q Q");
    custom = unbind(custom, { code: "KeyQ" });
    // R이 없어도 R'이 있으면 R2는 R'을 두 번
    expect(caps(keysForMove(custom, 3, "R2"))).toBe("K K");
    custom = unbind(custom, { code: "KeyK" });
    expect(keysForMove(custom, 3, "R")).toBeNull();
    expect(keysForMove(custom, 3, "R2")).toBeNull();
  });

  test("공식 글 정리: 소문자 넓게, R2'", () => {
    expect(normalizeMove("r2")).toBe("Rw2");
    expect(normalizeMove("l'")).toBe("Lw'");
    expect(normalizeMove("R2'")).toBe("R2");
    expect(normalizeMove("x")).toBe("x");
  });
});

const moves = (text: string, letters = false) =>
  splitMoveText(text, { letters })
    .filter((p) => p.kind === "move")
    .map((p) => p.text);

describe("본문 속 수 찾기", () => {
  test("한국어 조사가 붙은 수, 공식 줄, 괄호 속", () => {
    expect(moves("다고 생각하며 L을 쳐 보세요.")).toEqual(["L"]);
    expect(moves("수네(R U R' U R U2 R')를 해요.")).toEqual([
      "R",
      "U",
      "R'",
      "U",
      "R",
      "U2",
      "R'",
    ]);
    expect(moves("x·y·z는 큐브 전체를")).toEqual(["x", "y", "z"]);
    expect(moves("안쪽 층(2R 등)과 Rw, r, M2")).toEqual([
      "2R",
      "Rw",
      "r",
      "M2",
    ]);
  });

  test("영어 약어·낱말은 건드리지 않는다", () => {
    for (const t of [
      "OLL과 PLL",
      "F2L 41 상황",
      "CFOP",
      "EO라인",
      "EOline",
      "CMLL",
      "LSE",
      "ZBLL·COLL",
      "Ua 퍼뮤",
      "T퍼뮤",
      "Roux",
      "WCA",
      "4c",
      "2×2와 3×3",
    ])
      expect(moves(t), t).toEqual([]);
  });

  test("키 이름·모양 이름은 수가 아니다(R 키, U자)", () => {
    expect(moves("R 키를 누르면")).toEqual([]);
    expect(moves("U자 모양")).toEqual([]);
    expect(moves("F 퍼뮤테이션")).toEqual([]);
  });

  test("글자 범위(A~D)는 수가 아니다", () => {
    expect(moves("위 A~D, 왼쪽 E~H, 앞 I~L")).toEqual([]);
  });

  test("글자 단원: 홑 글자는 이어진 공식일 때만", () => {
    expect(moves("버퍼 B와 D를 맞바꿔요", true)).toEqual([]);
    expect(moves("글자 둘(C, U)을", true)).toEqual([]);
    expect(moves("준비 l2 D L2 → T퍼뮤", true)).toEqual(["l2", "D", "L2"]);
    expect(moves("준비 수는 L'.", true)).toEqual(["L'"]);
  });

  test("나눈 조각을 이으면 원래 글", () => {
    const text = "앞면을 돌린 뒤(D') F2를 쳐 보세요. OLL은 나중에.";
    expect(
      splitMoveText(text)
        .map((p) => p.text)
        .join(""),
    ).toBe(text);
  });
});
