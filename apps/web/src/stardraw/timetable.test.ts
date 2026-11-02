import { roundTimes, type Schedule, withChange } from "@game/stardraw-core";
import { describe, expect, it } from "vitest";

import { timetable } from "./timetable";

// 지금 서버 시험 운영과 같은 20분 회차(마감 x:15·x:35·x:55, 관측 5분 뒤, 관측 1분 뒤 다음 회차)
const MIN = 60;
const EPOCH = 1793253600 - 5 * MIN;
const trial: Schedule = {
  epoch: EPOCH,
  entries: [
    {
      fromRound: 1,
      length: 20 * MIN,
      closeMargin: 60,
      powTarget: 2 ** 26,
      registerPowTarget: 2 ** 20,
      phase: "trial",
    },
  ],
};
/** 224회 칸 시작(= 223회 마감) */
const SLOT = roundTimes(trial, 224).opensAt;

describe("관측 시간표", () => {
  it("관측을 기다리는 회차부터, 확정 뒤 예정 세 줄까지", () => {
    // 223회 마감 2분 뒤: 223회 관측을 기다리고 224회는 아직 열리지 않았다. 기록은 222회까지
    const t = timetable(trial, 222, SLOT + 2 * MIN, 224, 223, false);
    expect(t.fixedThrough).toBe(226);
    expect(t.rows.map((r) => [r.round, r.state, r.fixed])).toEqual([
      [223, "closed", true],
      [224, "upcoming", true],
      [225, "upcoming", true],
      [226, "upcoming", true],
      [227, "upcoming", false],
      [228, "upcoming", false],
      [229, "upcoming", false],
    ]);
    expect(t.change).toBeNull();
  });

  it("관측 시각부터 1분은 관측 중, 다음 회차 접수는 그 뒤에 열린다", () => {
    const observing = timetable(
      trial,
      223,
      SLOT + 5 * MIN + 30,
      224,
      223,
      false,
    );
    expect(observing.rows[0]).toMatchObject({
      round: 223,
      state: "observing",
      observeAt: SLOT + 5 * MIN,
      observeEnd: SLOT + 6 * MIN,
    });
    expect(observing.rows[1]).toMatchObject({
      round: 224,
      state: "upcoming",
      opensAt: SLOT + 6 * MIN,
    });
    const open = timetable(trial, 223, SLOT + 6 * MIN, 224, null, false);
    expect(open.rows[0]).toMatchObject({ round: 224, state: "open" });
  });

  it("관측 연출이 시작되면 관측 중", () => {
    const t = timetable(trial, 223, SLOT + 5 * MIN, 224, 223, true);
    expect(t.rows[0]).toMatchObject({ round: 223, state: "observing" });
  });

  it("마감 여유가 지나면 마감, 관측은 마감 5분 뒤", () => {
    const times = roundTimes(trial, 224);
    const t = timetable(trial, 223, times.entryDeadline, 224, null, false);
    expect(t.rows[0]).toMatchObject({
      state: "closed",
      deadline: times.closesAt - 60,
      observeAt: times.closesAt + 5 * MIN,
    });
  });

  it("회차 막대는 빈틈없이 맞물린다(관측 끝 = 다음 회차 접수 시작)", () => {
    const t = timetable(trial, 223, SLOT + 6 * MIN, 224, null, false);
    for (let i = 1; i < t.rows.length; i++)
      expect(t.rows[i]?.opensAt).toBe(t.rows[i - 1]?.observeEnd);
  });

  it("예고 중인 변경이 있으면 그 앞까지만 확정이고 바뀐 시각으로 보인다", () => {
    const hourly = withChange(trial, {
      ...trial.entries[0],
      fromRound: 228,
      length: 60 * MIN,
    } as Schedule["entries"][number]);
    const t = timetable(hourly, 223, SLOT + 6 * MIN, 224, null, false);
    expect(t.fixedThrough).toBe(227);
    expect(t.change).toEqual({ fromRound: 228, length: 60 * MIN });
    const r228 = t.rows.find((r) => r.round === 228);
    const r229 = t.rows.find((r) => r.round === 229);
    expect(r228?.fixed).toBe(false);
    expect((r229?.opensAt ?? 0) - (r228?.opensAt ?? 0)).toBe(60 * MIN);
  });
});
