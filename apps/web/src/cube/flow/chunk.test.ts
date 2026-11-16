import { parseMoves } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import {
  type ChunkRun,
  chunkNow,
  chunkRepeat,
  EMPTY_CHUNK,
  pushChunk,
} from "./chunk";
import { EMPTY_FLOW, pushFlow } from "./strip";

/** 표기 글을 0.3초 간격으로 친다(x·y·z는 큐브 돌리기) */
function play(alg: string, run: ChunkRun = EMPTY_CHUNK, start = 0, gap = 300) {
  let r = run;
  let t = start;
  for (const m of alg.trim().split(/\s+/)) {
    t += gap;
    r = pushChunk(r, m, t, /^[xyz]/.test(m));
  }
  return { run: r, t };
}

const count = (alg: string) => chunkRepeat(play(alg).run.beats)?.count ?? 0;

describe("공식 덩어리 ×n", () => {
  it("R U R′ U′를 세 번 이어 치면 ×3", () => {
    const r = chunkRepeat(play("R U R' U' R U R' U' R U R' U'").run.beats);
    expect(r).toEqual({ block: ["R", "U", "R'", "U'"], count: 3 });
  });

  it("한 번만 친 덩어리는 세지 않는다", () => {
    expect(count("F R U R' U'")).toBe(0);
  });

  it("다음 덩어리를 치는 도중에도 첫머리가 맞으면 앞의 수를 보인다, 어긋나면 사라진다", () => {
    expect(count("R U R' U' R U R' U' R U")).toBe(2);
    expect(count("R U R' U' R U R' U' R F")).toBe(0);
  });

  it("같은 층을 이어 친 덩어리도 친 차례 그대로 센다(수네 두 번: R′ R가 띠에서는 지워진다)", () => {
    expect(count("R U R' U R U2 R' R U R' U R U2 R'")).toBe(2);
  });

  it("더 짧은 되풀이와 한 층만 쓰는 것은 덩어리가 아니다", () => {
    // R U R U R U R U는 「R U」(2수) 되풀이라 4수 덩어리로 세지 않는다
    expect(count("R U R U R U R U")).toBe(0);
    expect(count("R R R R R R")).toBe(0);
  });

  it("1초 넘게 멈추거나 큐브를 돌리면 처음부터 다시 센다", () => {
    const first = play("R U R' U' R U R' U'");
    expect(chunkNow(first.run, first.t)).toBe(2);
    // 멈춘 동안은 보이지 않는다
    expect(chunkNow(first.run, first.t + 1_001)).toBe(0);
    // 1.5초 뒤 이어 친 덩어리 하나는 새로 시작한 것
    const after = play("R U R' U'", first.run, first.t + 1_200);
    expect(chunkNow(after.run, after.t)).toBe(0);
    const turned = play("y R U R' U'", first.run, first.t);
    expect(chunkNow(turned.run, turned.t)).toBe(0);
  });

  it("수 흐름 띠가 덩어리 셈을 함께 든다", () => {
    let strip = EMPTY_FLOW;
    let t = 0;
    for (const m of parseMoves(3, "R U R' U' R U R' U'")) {
      t += 200;
      strip = pushFlow(strip, 3, m, 0, t);
    }
    expect(chunkNow(strip.chunk, t)).toBe(2);
  });
});
