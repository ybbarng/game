import { roundTimes, type Schedule, withChange } from "@game/stardraw-core";
import { describe, expect, it } from "vitest";

import { timetable } from "./timetable";

// 지금 서버 시험 운영과 같은 20분 회차(마감 x:15·x:35·x:55, 관측 5분 뒤)
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

describe("관측 시간표", () => {
  it("관측을 기다리는 회차부터, 확정 뒤 예정 세 줄까지", () => {
    // 224회 예측 중(223회 관측 1분 뒤), 223회는 관측 연출 전, 기록은 222회까지
    const now = roundTimes(trial, 224).opensAt + 6 * MIN;
    const t = timetable(trial, 222, now, 224, 223, false);
    expect(t.fixedThrough).toBe(226);
    expect(t.rows.map((r) => [r.round, r.state, r.fixed])).toEqual([
      [223, "closed", true],
      [224, "open", true],
      [225, "upcoming", true],
      [226, "upcoming", true],
      [227, "upcoming", false],
      [228, "upcoming", false],
      [229, "upcoming", false],
    ]);
    expect(t.change).toBeNull();
  });

  it("접수는 앞 회차 관측 시각부터(그 전 5분은 앞 회차 기록을 기다린다)", () => {
    const slot = roundTimes(trial, 224).opensAt;
    const before = timetable(trial, 222, slot + 60, 224, 223, false);
    expect(before.rows[1]).toMatchObject({ round: 224, state: "upcoming" });
    expect(before.rows[1]?.opensAt).toBe(
      roundTimes(trial, 223).closesAt + 5 * MIN,
    );
    const after = timetable(trial, 223, slot + 5 * MIN, 224, null, false);
    expect(after.rows[0]).toMatchObject({ round: 224, state: "open" });
  });

  it("관측 연출 중인 회차는 관측 중", () => {
    const now = roundTimes(trial, 224).opensAt + 6 * MIN;
    const t = timetable(trial, 222, now, 224, 223, true);
    expect(t.rows[0]).toMatchObject({ round: 223, state: "observing" });
  });

  it("관측할 회차가 없으면 지금 예측받는 회차부터", () => {
    const now = roundTimes(trial, 224).opensAt + 10 * MIN;
    const t = timetable(trial, 223, now, 224, null, false);
    expect(t.rows[0]).toMatchObject({ round: 224, state: "open" });
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

  it("예고 중인 변경이 있으면 그 앞까지만 확정이고 바뀐 시각으로 보인다", () => {
    const hourly = withChange(trial, {
      ...trial.entries[0],
      fromRound: 228,
      length: 60 * MIN,
    } as Schedule["entries"][number]);
    const now = roundTimes(hourly, 224).opensAt + 6 * MIN;
    const t = timetable(hourly, 222, now, 224, 223, false);
    expect(t.fixedThrough).toBe(227);
    expect(t.change).toEqual({ fromRound: 228, length: 60 * MIN });
    const r228 = t.rows.find((r) => r.round === 228);
    const r229 = t.rows.find((r) => r.round === 229);
    expect(r228?.fixed).toBe(false);
    expect((r229?.opensAt ?? 0) - (r228?.opensAt ?? 0)).toBe(60 * MIN);
  });
});
