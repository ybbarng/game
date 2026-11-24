import { describe, expect, it } from "vitest";

import { auditChatText } from "./audit-text";

describe("판 끝 검증 채팅 글", () => {
  it("내 기기의 실패는 실패로 적는다", () => {
    expect(
      auditChatText("나", true, false, "방장이 내 비밀 값을 바꿨어요."),
    ).toBe("나 — 실패 ⚠ 방장이 내 비밀 값을 바꿨어요.");
  });

  it("이름이 「나」인 다른 사람의 실패 알림도 그 사람의 주장으로 적는다", () => {
    expect(auditChatText("나", false, false, "지어낸 사유예요.")).toBe(
      "나의 주장 — 실패 ⚠ 지어낸 사유예요. (내 검증과 따로 봐요)",
    );
  });
});
