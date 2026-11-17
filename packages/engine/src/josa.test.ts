import { describe, expect, it } from "vitest";

import { copula, obj, ro, subj, topic } from "./josa";

describe("조사 고르기", () => {
  it("한글은 끝 글자 받침으로 고른다", () => {
    expect(subj("민준")).toBe("민준이");
    expect(subj("하나")).toBe("하나가");
    expect(topic("차")).toBe("차는");
    expect(obj("포")).toBe("포를");
    expect(copula("쉬기")).toBe("쉬기예요");
    expect(copula("윷")).toBe("윷이에요");
  });

  it("「나」는 「내가」로 쓴다", () => {
    expect(subj("나")).toBe("내가");
  });

  it("숫자는 읽는 소리로 고른다", () => {
    expect(subj("컴퓨터 1")).toBe("컴퓨터 1이");
    expect(subj("컴퓨터 2")).toBe("컴퓨터 2가");
    expect(copula("+30")).toBe("+30이에요");
    expect(copula("−1.5")).toBe("−1.5예요");
    expect(ro("1")).toBe("1로");
    expect(ro("3")).toBe("3으로");
    expect(ro("2")).toBe("2로");
  });

  it("로마자는 이름으로, 끝 괄호와 기호는 건너뛴다", () => {
    expect(copula("e4")).toBe("e4예요");
    expect(copula("Nf3")).toBe("Nf3이에요");
    expect(copula("Qxe7+")).toBe("Qxe7+이에요");
    expect(obj("♠K")).toBe("♠K를");
    expect(obj("D4")).toBe("D4를");
    expect(subj("차(59)")).toBe("차(59)가");
    expect(ro("걸")).toBe("걸로");
    expect(ro("도")).toBe("도로");
    expect(ro("윷")).toBe("윷으로");
  });

  it("받침을 모르면 둘 다 적는다", () => {
    expect(subj("★")).toBe("★이(가)");
  });
});
