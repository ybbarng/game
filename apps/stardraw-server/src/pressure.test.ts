import { describe, expect, it } from "vitest";

import { EntryPressure, emptyPressure } from "./pressure";

describe("예측 몰림 숫자: 회차별로 세고 오래된 회차는 버린다(docs/36 11-43)", () => {
  it("회차마다 따로 세고, 줄 길이·기다림은 가장 큰 값만 남긴다", () => {
    const p = new EntryPressure();
    p.add(1, "busy");
    p.add(1, "busy");
    p.add(2, "prefixEntry");
    p.queued(1, 3);
    p.queued(1, 2);
    p.waited(1, 1200.4);
    p.waited(1, 800);
    expect(p.get(1)).toEqual({
      ...emptyPressure(1),
      busy: 2,
      maxQueue: 3,
      maxWaitMs: 1200,
    });
    expect(p.get(2)).toEqual({ ...emptyPressure(2), prefixEntry: 1 });
    // 일이 없던 회차는 모두 0이고, 물어본다고 남기지 않는다
    expect(p.get(3)).toEqual(emptyPressure(3));
    expect(p.kept()).toEqual([1, 2]);
  });

  it("남기는 회차 수를 넘으면 가장 오래된 회차부터 버린다", () => {
    const p = new EntryPressure(3);
    for (const r of [1, 2, 3, 4]) p.add(r, "late");
    expect(p.kept()).toEqual([2, 3, 4]);
    // 버린 옛 회차에 늦게 하나 더 와도 바로 다시 버린다
    p.add(1, "late");
    expect(p.kept()).toEqual([2, 3, 4]);
    expect(p.get(1)).toEqual(emptyPressure(1));
  });

  it("감시용 합·최댓값은 고른 회차만 더한다(503은 busy + queueTimeout, 429는 예측 + 등록)", () => {
    const p = new EntryPressure();
    p.add(1, "busy");
    p.add(2, "busy");
    p.add(2, "queueTimeout");
    p.add(2, "prefixEntry");
    p.add(2, "prefixRegister");
    p.add(2, "late");
    p.waited(1, 4000);
    p.waited(2, 300);
    p.queued(2, 7);
    expect(p.recent((r) => r >= 2)).toEqual({
      entryBusyRecent: 2,
      entryPrefixRecent: 2,
      entryLateRecent: 1,
      entryMaxWaitMsRecent: 300,
      entryMaxQueueRecent: 7,
    });
    expect(p.recent(() => false)).toEqual({
      entryBusyRecent: 0,
      entryPrefixRecent: 0,
      entryLateRecent: 0,
      entryMaxWaitMsRecent: 0,
      entryMaxQueueRecent: 0,
    });
  });
});
