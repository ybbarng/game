import { describe, expect, it } from "vitest";

import { planText } from "./plan-text";

describe("초고수의 노림 문구", () => {
  it("궁성 공격의 왼·오른은 마주 앉은 내 쪽에서 본 방향으로 뒤집는다", () => {
    expect(planText("attack-left")).toBe("내 궁성 오른쪽 공격");
    expect(planText("attack-right")).toBe("내 궁성 왼쪽 공격");
    expect(planText("attack-center")).toBe("내 궁성 가운데 공격");
  });

  it("방향이 없는 노림은 계획 이름 그대로", () => {
    expect(planText("mate")).toBe("외통 몰기");
    expect(planText("develop")).toBe("찻길 열기·기물 전개");
  });
});
