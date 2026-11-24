// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardOnlineAlerts } from "./OnlineAlerts";

afterEach(cleanup);

describe("온라인 판 알림 묶음(BoardOnlineAlerts)", () => {
  it("알릴 것이 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(
      <BoardOnlineAlerts
        invalid={null}
        reconnecting={false}
        hostLeft={false}
        onExit={() => {}}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("내 기기 검증이 실패하면 사유를 단 무효 띠를 보인다", () => {
    render(
      <BoardOnlineAlerts
        invalid="나: 섞기 증명이 맞지 않아요."
        reconnecting={false}
        hostLeft={false}
        onExit={() => {}}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "⚠ 공정성 검증 실패 — 이 게임은 무효예요 (나: 섞기 증명이 맞지 않아요.)",
    );
  });

  it("방장이 나가면 「처음으로」 단추로 나가고, 다시 잇는 중 알림은 내지 않는다", () => {
    const onExit = vi.fn();
    render(
      <BoardOnlineAlerts
        invalid={null}
        reconnecting={true}
        hostLeft={true}
        onExit={onExit}
      />,
    );
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "처음으로" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
