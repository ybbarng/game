import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { CHECK_DELAY_MS, createSettler } from "./settle";

describe("입력이 멈춘 뒤 한 번만", () => {
  it("치는 동안은 넘기지 않고, 멈추면 마지막 값만 넘긴다", () => {
    const clock = new ManualClock();
    const seen: string[] = [];
    const s = createSettler<string>(clock, CHECK_DELAY_MS, (v) => seen.push(v));
    s.push("R");
    clock.advance(CHECK_DELAY_MS - 1);
    s.push("R U");
    clock.advance(CHECK_DELAY_MS - 1);
    s.push("R U R'");
    expect(seen).toEqual([]);
    clock.advance(CHECK_DELAY_MS);
    expect(seen).toEqual(["R U R'"]);
    clock.advance(CHECK_DELAY_MS * 4);
    expect(seen).toEqual(["R U R'"]);
  });

  it("바로 넘기면 기다리던 값은 버린다. 끄면 넘기지 않는다", () => {
    const clock = new ManualClock();
    const seen: string[] = [];
    const s = createSettler<string>(clock, CHECK_DELAY_MS, (v) => seen.push(v));
    s.push("R");
    s.now("L");
    clock.advance(CHECK_DELAY_MS);
    expect(seen).toEqual(["L"]);
    s.push("F");
    s.cancel();
    clock.advance(CHECK_DELAY_MS);
    expect(seen).toEqual(["L"]);
  });
});
