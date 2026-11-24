import { describe, expect, it } from "vitest";

import { Party } from "./protocol";
import { loadRistretto255 } from "./ristretto";
import { encodeIndex } from "./sra";
import { seededTestRandom } from "./test-random";

const R255 = await loadRistretto255();
/** 마이티 덱 53장을 원소로 */
const DECK = Array.from({ length: 53 }, (_, i) => encodeIndex(R255, i));

describe("시험 난수원(씨앗)", () => {
  it("같은 씨앗·같은 이름이면 같은 수열을, 이름이 다르면 다른 수열을 준다", () => {
    const draw = (seed: string, name: string) => {
      const below = seededTestRandom(seed).stream(name);
      return Array.from({ length: 4 }, () => below(1n << 200n));
    };
    expect(draw("a", "x")).toEqual(draw("a", "x"));
    expect(draw("a", "x")).not.toEqual(draw("a", "y"));
    expect(draw("a", "x")).not.toEqual(draw("b", "x"));
  });

  it("0 이상 max 미만만 낸다", () => {
    const below = seededTestRandom("s").stream("작은 범위");
    const seen = new Set(Array.from({ length: 200 }, () => below(3n)));
    expect([...seen].sort()).toEqual([0n, 1n, 2n]);
  });

  it("비밀 값은 방의 비밀 값 꼴(영문·숫자 32글자)이고 이름마다 다르다", () => {
    const random = seededTestRandom("s");
    expect(random.secret("host/g1")).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(random.secret("host/g1")).toBe(random.secret("host/g1"));
    expect(random.secret("host/g1")).not.toBe(random.secret("host/g2"));
  });

  it("아래 경로(child)는 이름으로만 정해진다", () => {
    const a = seededTestRandom("s").child("guest0").child("g1");
    const b = seededTestRandom("s").child("guest0").child("g1");
    expect(a.path).toBe("s/guest0/g1");
    expect(a.secret("x")).toBe(b.secret("x"));
    expect(a.secret("x")).not.toBe(
      seededTestRandom("s").child("guest1").child("g1").secret("x"),
    );
  });
});

describe("Party에 시험 난수원을 넘기면", () => {
  it("같은 경로면 섞기 결과(열쇠·순서)가 같다", async () => {
    const shuffled = (path: string) =>
      new Party(1, R255, seededTestRandom(path)).lockAndShuffle(
        DECK,
        "shuffle",
      );
    expect(await shuffled("s/deal1")).toEqual(await shuffled("s/deal1"));
    expect(await shuffled("s/deal1")).not.toEqual(await shuffled("s/deal2"));
  });

  it("열쇠를 만드는 차례가 달라도 같은 열쇠·같은 섞기가 나온다", async () => {
    const random = seededTestRandom("s");
    const early = new Party(1, R255, random);
    const late = new Party(1, R255, random);
    // 한쪽은 자리 열쇠를 먼저 만든 뒤에 섞는다.
    early.relockCommitment(["shuffle"]);
    await early.relock(DECK.slice(0, 3), [7, 8, 9], ["shuffle"]);
    const a = await early.lockAndShuffle(DECK, "pool");
    const b = await late.lockAndShuffle(DECK, "pool");
    expect(a).toEqual(b);
  });

  it("넘기지 않으면(제품) 씨앗 없이 매번 다르게 섞는다", async () => {
    const a = await new Party(1, R255).lockAndShuffle(DECK, "shuffle");
    const b = await new Party(1, R255).lockAndShuffle(DECK, "shuffle");
    // 53장 순서와 열쇠(2^250 남짓)가 우연히 같을 확률은 0으로 본다.
    expect(a).not.toEqual(b);
  });
});
