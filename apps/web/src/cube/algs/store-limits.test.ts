import { beforeEach, describe, expect, it, vi } from "vitest";

import { caseById, checkAlg, MAX_ALG_LENGTH } from "./check";
import {
  type AlgBook,
  addMine,
  importAlgBook,
  MAX_IMPORT_ALGS,
  MAX_IMPORT_BYTES,
  MAX_MINE_PER_CASE,
} from "./store";

// 검사기를 몇 번, 어떻게 불렀는지 센다(무거운 검사가 상한을 넘지 않는지 시간 대신 횟수로 본다)
vi.mock("./check", async (importOriginal) => {
  const real = await importOriginal<typeof import("./check")>();
  return { ...real, checkAlg: vi.fn(real.checkAlg) };
});

const check = vi.mocked(checkAlg);
let realCheck: typeof checkAlg;

beforeEach(async () => {
  realCheck ??= (await vi.importActual<typeof import("./check")>("./check"))
    .checkAlg;
  check.mockReset();
  check.mockImplementation(realCheck);
});

const file = (cases: Record<string, { mine: string[] }>) =>
  JSON.stringify({ format: "cube-algs", version: 1, cases });

const SUNE = caseById("oll-27");
if (!SUNE) throw new Error("oll-27");
const FULL = `상황마다 ${MAX_MINE_PER_CASE}개까지`;

describe("가져오기 상한", () => {
  it("한 줄이 너무 긴 공식은 검사하지 않고 뺀다", () => {
    const long = Array(MAX_ALG_LENGTH).fill("R").join(" ");
    const r = importAlgBook({}, file({ "oll-27": { mine: [long] } }));
    expect(check).not.toHaveBeenCalled();
    expect(r.rejected.map((x) => x.message)).toEqual(["너무 김"]);
    // 뺀 목록에는 앞만 보인다
    expect((r.rejected[0]?.alg ?? "").length).toBeLessThan(80);
  });

  it("파일이 너무 크면 읽지 않는다", () => {
    expect(() => importAlgBook({}, " ".repeat(MAX_IMPORT_BYTES + 1))).toThrow(
      "파일이 너무 큼",
    );
  });

  it("공식이 너무 많으면 상한까지만 검사하고, 틀린 공식이 다른 상황을 푸는지는 찾지 않는다", () => {
    // 무거운 검사 대신 늘 틀렸다고 답하게 해 횟수만 본다
    check.mockImplementation(() => ({ ok: false, message: "틀림" }));
    const extra = 50;
    const cases: Record<string, { mine: string[] }> = {};
    for (let i = 0; i < MAX_IMPORT_ALGS + extra; i++) {
      // 상황마다 상한에 걸리지 않게 OLL 57 상황에 고루 나눈다
      const id = `oll-${(i % 57) + 1}`;
      cases[id] ??= { mine: [] };
      cases[id].mine.push(`R U R' ${"U ".repeat(i % 7)}F${i}`);
    }
    const r = importAlgBook({}, file(cases));
    expect(check).toHaveBeenCalledTimes(MAX_IMPORT_ALGS);
    for (const call of check.mock.calls)
      expect(call[2]).toMatchObject({ findOther: false });
    expect(r.rejected.filter((x) => x.message === "너무 많음")).toHaveLength(
      extra,
    );
  });
});

describe("상황마다 상한", () => {
  // 겉모양만 갖춘 내 공식으로 상황 하나를 채운다(가득 찼는지만 본다)
  const full: AlgBook = {
    "oll-27": {
      mine: Array.from({ length: MAX_MINE_PER_CASE }, (_, i) => `R${i}`),
    },
  };
  const LEFT_SUNE_BACK = "L U L' U L U2 L'";

  it("가득 찬 상황에는 맞는 공식도 더 넣지 않는다", () => {
    const r = addMine(full, SUNE, LEFT_SUNE_BACK);
    expect(r.ok).toBe(false);
    expect(r.message).toBe(FULL);
    expect(r.book).toBe(full);
  });

  it("가져올 때 가득 찬 상황의 공식은 검사하지 않고 뺀다. 이미 있는 공식은 그대로 둔다", () => {
    const r = importAlgBook(
      full,
      file({ "oll-27": { mine: [LEFT_SUNE_BACK, "R U R'", "R0", "R1"] } }),
    );
    expect(check).not.toHaveBeenCalled();
    expect(r.rejected.map((x) => x.message)).toEqual([FULL, FULL]);
    expect(r.added).toBe(0);
    expect(r.book).toBe(full);
  });
});
