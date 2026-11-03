// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useHint } from "./HintButton";
import { ResignButton } from "./ResignButton";

afterEach(cleanup);

describe("공통 기권 단추", () => {
  it("한 번 더 묻고, 「기권하기」에만 기권한다", () => {
    const onResign = vi.fn();
    const onAsk = vi.fn();
    render(<ResignButton resetKey={3} onResign={onResign} onAsk={onAsk} />);
    fireEvent.click(screen.getByRole("button", { name: "기권" }));
    expect(onAsk).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "계속 두기" }));
    expect(onResign).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "기권" }));
    fireEvent.click(screen.getByRole("button", { name: "기권하기" }));
    expect(onResign).toHaveBeenCalledTimes(1);
  });

  it("수가 오가면 묻기를 닫고, 무르기로 같은 수 개수에 돌아와도 다시 뜨지 않는다", () => {
    const { rerender } = render(
      <ResignButton resetKey={3} onResign={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "기권" }));
    expect(screen.getByText("정말 기권할까요?")).toBeTruthy();
    rerender(<ResignButton resetKey={4} onResign={() => {}} />);
    expect(screen.queryByText("정말 기권할까요?")).toBeNull();
    rerender(<ResignButton resetKey={3} onResign={() => {}} />);
    expect(screen.queryByText("정말 기권할까요?")).toBeNull();
  });
});

describe("공통 힌트 훅", () => {
  it("수가 오가면 지우고, 무르기로 같은 수 개수에 돌아와도 다시 뜨지 않는다", () => {
    const { result, rerender } = renderHook(({ key }) => useHint<string>(key), {
      initialProps: { key: 3 },
    });
    act(() => result.current.showHint("e2-e4"));
    expect(result.current.hint).toBe("e2-e4");
    rerender({ key: 4 });
    expect(result.current.hint).toBeNull();
    rerender({ key: 3 });
    expect(result.current.hint).toBeNull();
  });
});
