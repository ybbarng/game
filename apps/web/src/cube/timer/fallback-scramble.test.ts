import { parseMoves } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { EVENT_INFO, TIMER_EVENTS } from "./events";
import {
  FALLBACK_LENGTH,
  fallbackScramble,
  fallbackScrambleText,
} from "./fallback-scramble";
import { NET_SLOTS, scrambledNet } from "./net";

const AXIS: Record<string, number> = { R: 0, L: 0, U: 1, D: 1, F: 2, B: 2 };
const faceOf = (token: string) => token.replace(/[^RLUDFB]/g, "");

describe("임시 섞기", () => {
  for (const event of TIMER_EVENTS) {
    it(`${event}: 길이가 맞고 엔진이 읽을 수 있다`, () => {
      const text = fallbackScrambleText(event, 7);
      const tokens = text.split(" ");
      expect(tokens).toHaveLength(FALLBACK_LENGTH[event]);
      expect(() => parseMoves(EVENT_INFO[event].size, text)).not.toThrow();
    });
  }

  it("같은 면을 잇달아 쓰지 않고, 같은 축이 세 번 이어지지 않는다", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const faces = fallbackScrambleText("555", seed).split(" ").map(faceOf);
      for (let i = 1; i < faces.length; i++) {
        expect(faces[i]).not.toBe(faces[i - 1]);
        if (i >= 2) {
          const axes = [faces[i - 2], faces[i - 1], faces[i]].map(
            (f) => AXIS[f as string],
          );
          expect(axes[0] === axes[1] && axes[1] === axes[2]).toBe(false);
        }
      }
    }
  });

  it("2×2는 R·U·F만, 4×4 넓은 수는 Rw·Uw·Fw만", () => {
    expect(fallbackScrambleText("222", 3)).toMatch(/^([RUF]['2]? ?)+$/);
    const wide = fallbackScrambleText("444", 3)
      .split(" ")
      .filter((m) => m.includes("w"));
    expect(wide.length).toBeGreaterThan(0);
    for (const m of wide) expect(m).toMatch(/^[RUF]w/);
  });

  it("같은 씨앗이면 같은 공식, 임시라 official은 false", async () => {
    const a = await fallbackScramble("333", 42);
    const b = await fallbackScramble("333", 42);
    expect(a).toEqual(b);
    expect(a.official).toBe(false);
  });
});

describe("펼친 그림", () => {
  it("R 한 번 뒤 U 면 오른쪽 줄은 F 색(초록), F 면 오른쪽 줄은 D 색(노랑)", () => {
    const net = scrambledNet(3, "R");
    const at = (face: number, row: number, col: number) => {
      const [sx, sy] = NET_SLOTS[face] as readonly [number, number];
      return net.find((s) => s.x === sx * 3 + col && s.y === sy * 3 + row)
        ?.color;
    };
    for (let row = 0; row < 3; row++) {
      expect(at(0, row, 2)).toBe(2);
      expect(at(0, row, 0)).toBe(0);
      expect(at(2, row, 2)).toBe(3);
    }
    expect(net).toHaveLength(54);
  });
});
