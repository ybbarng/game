// @vitest-environment node
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import {
  type SignalTrust,
  type StallWhy,
  signalTrust,
  WATCH_MS,
  watchCall,
} from "./passkey-watch";

/** 끝나지 않는 패스키 호출(시험이 손으로 끝낸다) */
function pending<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const p = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { p, resolve, reject };
}

function watch(trust: SignalTrust) {
  const clock = new ManualClock();
  const events: (StallWhy | "settle")[] = [];
  let signal: (() => void) | null = null;
  let listening = 0;
  const call = pending<string>();
  let calls = 0;
  const out = watchCall(
    () => {
      calls += 1;
      return call.p;
    },
    {
      clock,
      trust,
      listen: (fn) => {
        signal = fn;
        listening += 1;
        return () => {
          listening -= 1;
        };
      },
      onStall: (why) => events.push(why),
      onSettle: () => events.push("settle"),
    },
  );
  return {
    clock,
    events,
    call,
    out,
    signal: () => signal?.(),
    listening: () => listening,
    calls: () => calls,
  };
}

describe("패스키 호출 지켜보기", () => {
  it("신호를 믿는 기기에서 초점 신호가 없으면 짧은 시간에 「창이 안 뜬 것」으로 알린다", () => {
    const w = watch("signal");
    w.clock.advance(WATCH_MS.quiet - 1);
    expect(w.events).toEqual([]);
    w.clock.advance(1);
    expect(w.events).toEqual(["quiet"]);
    // 끊지 않는다: 호출은 한 번뿐이고 시계에 걸린 일도 없다
    expect(w.calls()).toBe(1);
    expect(w.clock.pending()).toBe(0);
  });

  it("초점 신호가 오면(창이 떴다) 넉넉히 기다린 뒤 「끝나지 않음」으로 알린다", () => {
    const w = watch("signal");
    w.clock.advance(2_000);
    w.signal();
    w.clock.advance(WATCH_MS.quiet);
    expect(w.events).toEqual([]);
    w.clock.advance(WATCH_MS.afterSignal - WATCH_MS.quiet - 1);
    expect(w.events).toEqual([]);
    w.clock.advance(1);
    expect(w.events).toEqual(["slow"]);
  });

  it("신호가 불확실한 기기는 넉넉한 시간 하나로", () => {
    const w = watch("unsure");
    w.clock.advance(WATCH_MS.quiet);
    expect(w.events).toEqual([]);
    w.clock.advance(WATCH_MS.unsure - WATCH_MS.quiet);
    expect(w.events).toEqual(["quiet"]);
  });

  it("늦게라도 답이 오면 안내를 걷고 결과를 그대로 돌려준다", async () => {
    const w = watch("signal");
    w.clock.advance(WATCH_MS.quiet);
    expect(w.events).toEqual(["quiet"]);
    w.call.resolve("패스키");
    await expect(w.out).resolves.toBe("패스키");
    expect(w.events).toEqual(["quiet", "settle"]);
    expect(w.listening()).toBe(0);
  });

  it("늦은 실패도 그대로 던지고 안내를 걷는다", async () => {
    const w = watch("unsure");
    w.clock.advance(WATCH_MS.unsure);
    const err = new DOMException("x", "NotAllowedError");
    w.call.reject(err);
    await expect(w.out).rejects.toBe(err);
    expect(w.events).toEqual(["quiet", "settle"]);
  });

  it("제때 답이 오면 아무것도 띄우지 않고 시계·듣기를 정리한다", async () => {
    const w = watch("signal");
    w.clock.advance(1_000);
    w.call.resolve("ok");
    await w.out;
    expect(w.events).toEqual([]);
    expect(w.clock.pending()).toBe(0);
    expect(w.listening()).toBe(0);
  });

  it("초점 신호를 믿는 기기는 안드로이드·Windows", () => {
    expect(
      signalTrust(
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe("signal");
    expect(
      signalTrust(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      ),
    ).toBe("signal");
    expect(
      signalTrust(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("unsure");
    expect(
      signalTrust(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      ),
    ).toBe("unsure");
  });
});
