import { scramble } from "@game/cube-scramble";
import { describe, expect, it } from "vitest";

import { scrambleInWorker } from "./index";

describe("큐브 워커 모듈", () => {
  // node에는 Worker가 없어 화면 스레드 대신 처리로 돈다. 표가 필요 없는 5×5로 본다
  it("워커를 못 쓰면 같은 스레드에서 같은 섞기를 낸다", async () => {
    const s = await scrambleInWorker("555", 3);
    expect(s).toEqual(scramble("555", 3));
    expect(s.text.split(" ")).toHaveLength(60);
  });
});
