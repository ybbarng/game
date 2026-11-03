import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { DelayedNetwork } from "./delayed-network";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("DelayedNetwork", () => {
  it("쌍마다 정한 지연으로 닿고, 기본은 보낸 차례를 지킨다(앞 막힘)", async () => {
    const clock = new ManualClock();
    // a→b 첫 메시지만 100ms, 나머지 a→b 10ms, a→c 30ms
    const net = new DelayedNetwork(clock, (from, to, n) =>
      to === "c" ? 30 : from === "a" && n === 0 ? 100 : 10,
    );
    const a = net.join("a");
    const b = net.join("b");
    const c = net.join("c");
    const got: string[] = [];
    b.onMessage((m, from) => got.push(`b<${from}:${String(m)}@${clock.now()}`));
    c.onMessage((m, from) => got.push(`c<${from}:${String(m)}@${clock.now()}`));
    await flush();
    a.send("1");
    a.send("2");
    a.send("3", "c");
    clock.advance(99);
    expect(got).toEqual(["c<a:1@30", "c<a:2@30", "c<a:3@30"]);
    clock.advance(1);
    // 두 번째 메시지는 10ms면 닿지만 첫 메시지 뒤에 막혔다
    expect(got.slice(3)).toEqual(["b<a:1@100", "b<a:2@100"]);
    expect(net.delivered).toBe(5);
  });

  it("순서 없는 통로는 늦은 메시지를 앞지른다", () => {
    const clock = new ManualClock();
    const net = new DelayedNetwork(
      clock,
      (_f, _t, n) => (n === 0 ? 100 : 10),
      false,
    );
    const a = net.join("a");
    const b = net.join("b");
    const got: unknown[] = [];
    b.onMessage((m) => got.push(m));
    a.send({ n: 1 });
    a.send({ n: 2 });
    clock.advance(50);
    expect(got).toEqual([{ n: 2 }]);
    clock.advance(50);
    expect(got).toEqual([{ n: 2 }, { n: 1 }]);
  });

  it("나간 기기에는 닿지 않는다", () => {
    const clock = new ManualClock();
    const net = new DelayedNetwork(clock, () => 10);
    const a = net.join("a");
    const b = net.join("b");
    const got: unknown[] = [];
    b.onMessage((m) => got.push(m));
    a.send("x");
    b.leave();
    clock.advance(20);
    expect(got).toEqual([]);
  });
});
