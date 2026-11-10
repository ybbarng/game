import { describe, expect, it } from "vitest";
import { importAlgsInWorker } from "./import-in-worker";

describe("내 공식 가져오기 워커", () => {
  // node에는 Worker가 없어 화면 스레드에서 한다(결과는 워커와 같다)
  it("워커를 못 쓰면 같은 스레드에서 한다", async () => {
    const text = JSON.stringify({
      format: "cube-algs",
      version: 1,
      cases: { "oll-27": { mine: ["L U L' U L U2 L'", "R U R'"] } },
    });
    const r = await importAlgsInWorker({}, text);
    expect(r.added).toBe(1);
    expect(r.rejected.map((x) => x.message)).toEqual(["F2L이 깨짐"]);
    await expect(importAlgsInWorker({}, "{")).rejects.toThrow(
      "JSON을 읽지 못함",
    );
  });
});
