import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeHostWhenFinished } from "./room-session";

function fakeHost() {
  let release: () => void = () => {};
  let fail: (e: Error) => void = () => {};
  const finished = new Promise<void>((resolve, reject) => {
    release = resolve;
    fail = reject;
  });
  const host = { finish: vi.fn(() => finished), close: vi.fn() };
  return { host, release, fail };
}

describe("closeHostWhenFinished", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("판 끝 기록 공개가 끝나기 전에는 몇 초가 지나도 방을 닫지 않는다", async () => {
    const { host } = fakeHost();
    closeHostWhenFinished(host);
    await vi.advanceTimersByTimeAsync(5000);
    expect(host.finish).toHaveBeenCalledTimes(1);
    expect(host.close).toHaveBeenCalledTimes(0);
  });

  it("기록 공개가 끝나면 0.5초 뒤에 한 번 닫는다", async () => {
    const { host, release } = fakeHost();
    closeHostWhenFinished(host);
    release();
    await vi.advanceTimersByTimeAsync(499);
    expect(host.close).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(host.close).toHaveBeenCalledTimes(1);
  });

  it("기록 공개가 실패해도 방은 닫는다", async () => {
    const { host, fail } = fakeHost();
    closeHostWhenFinished(host);
    fail(new Error("끊김"));
    await vi.advanceTimersByTimeAsync(500);
    expect(host.close).toHaveBeenCalledTimes(1);
  });
});
