// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { adviseWith } from "./bot-runner";

describe("화면용 한 수 계산(adviseWith)", () => {
  it("계산이 실패하면 fallback으로 화면 스레드에서 이어서 센다(문제 화면이 멈추지 않게)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // 등록부에 없는 게임이라 봇을 불러오지 못한다(새 배포 뒤 옛 봇 파일 404와 같은 실패)
    const answer = await adviseWith<string>(
      { game: "없는-게임", name: "advisor" },
      {},
      7,
      () => "화면 스레드의 답",
    );
    expect(answer).toBe("화면 스레드의 답");
  });

  it("fallback이 없으면 실패를 그대로 돌려준다", async () => {
    await expect(
      adviseWith({ game: "없는-게임", name: "advisor" }, {}, 7),
    ).rejects.toThrow("모르는 게임");
  });
});
