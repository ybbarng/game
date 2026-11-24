// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { Dialog } from "./Dialog";

afterEach(cleanup);

/** 「설정」 단추로 여는 대화 상자(판 중 설정과 같은 꼴) */
function Opener({ nested = false }: { nested?: boolean }) {
  const [open, setOpen] = useState(false);
  const [inner, setInner] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        설정
      </button>
      {open && (
        <Dialog label="설정" onClose={() => setOpen(false)}>
          <button type="button">첫 단추</button>
          <button type="button" onClick={() => setInner(true)}>
            용어 사전
          </button>
          {nested && inner && (
            <Dialog label="용어 사전" onClose={() => setInner(false)}>
              <button type="button">닫기</button>
            </Dialog>
          )}
        </Dialog>
      )}
    </>
  );
}

describe("공통 대화 상자", () => {
  it("이름이 붙은 모달 대화 상자로 열리고 첫 단추에 초점이 간다", () => {
    render(<Opener />);
    fireEvent.click(screen.getByRole("button", { name: "설정" }));
    const dialog = screen.getByRole("dialog", { name: "설정" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement?.textContent).toBe("첫 단추");
  });

  it("Esc로 닫히고 연 단추로 초점이 돌아간다", () => {
    render(<Opener />);
    const opener = screen.getByRole("button", { name: "설정" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("바깥을 누르면 닫히고 상자 안을 누르면 닫히지 않는다", () => {
    render(<Opener />);
    fireEvent.click(screen.getByRole("button", { name: "설정" }));
    const dialog = screen.getByRole("dialog", { name: "설정" });
    fireEvent.pointerDown(dialog);
    expect(screen.queryByRole("dialog")).not.toBeNull();
    fireEvent.pointerDown(dialog.parentElement as HTMLElement);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Tab은 상자 안에서만 돈다(마지막에서 처음으로)", () => {
    render(<Opener />);
    fireEvent.click(screen.getByRole("button", { name: "설정" }));
    screen.getByRole("button", { name: "용어 사전" }).focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement?.textContent).toBe("첫 단추");
  });

  it("겹쳐 열면 Esc는 맨 위 상자만 닫는다", () => {
    render(<Opener nested />);
    fireEvent.click(screen.getByRole("button", { name: "설정" }));
    fireEvent.click(screen.getByRole("button", { name: "용어 사전" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "용어 사전" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "설정" })).not.toBeNull();
  });
});
