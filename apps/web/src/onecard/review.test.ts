import type {
  GameEvent,
  OnecardRules,
  OnecardState,
  OnecardView,
} from "@game/onecard-engine";
import { describe, expect, it } from "vitest";
import { replayArchive } from "@/review/replay";
import { ReplayHost } from "@/review/replay-host";
import fixture from "../../e2e/onecard-review-archive.json";

import { onecardKit, onecardStepNotes } from "./kit";
import { scriptedOnecardArchive } from "./review-script";

/*
 * 원카드 판 위 복기: 남긴 기록(규칙·씨앗·행동)에서 걸음마다 판 상태를 다시 만들고, 그 걸음의 고유 사건(외침·잡기·벌칙 장)을
 * 글로 보인다. 기록은 엔진으로 만든 대본(review-script)이고, 화면 시험이 같은 기록을 파일로 가져온다
 */

const archive = scriptedOnecardArchive();
const replayed = replayArchive(onecardKit, archive);
const states = replayed.states as OnecardState[];
const events = replayed.events as GameEvent[][];
const name = (seat: number) => (seat === 0 ? "나" : `컴퓨터 ${seat}`);
const counts = (state: OnecardState) => state.hands.map((h) => h.length);

describe("기록 → 판 상태 다시 만들기", () => {
  it("행동마다 한 걸음씩 판 상태가 생기고, 마지막 걸음이 판 끝 순위다", () => {
    expect(replayed.error).toBeNull();
    expect(states).toHaveLength(archive.log.length + 1);
    expect(states[0]?.phase).toBe("play");
    expect(counts(states[0] as OnecardState)).toEqual([5, 5, 5]);
    const last = states.at(-1) as OnecardState;
    expect(last.phase).toBe("over");
    expect(last.result?.order).toEqual([1, 0, 2]);
  });

  it("잡힌 걸음 앞뒤로 잡힌 사람 손패가 벌칙 장만큼 늘어난다", () => {
    const at = events.findIndex((list) =>
      list.some((e) => e.type === "caught"),
    );
    expect(at).toBe(22);
    const before = states[at - 1] as OnecardState;
    const after = states[at] as OnecardState;
    expect(after.hands[2]?.length).toBe(
      (before.hands[2]?.length ?? 0) +
        (archive.rules as OnecardRules).catchPenalty,
    );
  });

  it("화면 시험이 가져오는 기록 파일은 대본과 같다(엔진이 바뀌면 다시 만든다)", () => {
    expect(fixture).toEqual({ version: 1, games: [archive] });
  });
});

describe("판 위 다시 보기에 흘려보내기(ReplayHost)", () => {
  it("한 걸음 앞으로 가면 그 걸음의 사건과 함께 화면을 보내고, 누를 수 있는 할 일은 지운다", () => {
    const host = new ReplayHost(onecardKit, replayed, 0, 21);
    const sent: { view: OnecardView; events: GameEvent[] }[] = [];
    host.subscribe((s) => sent.push(s));
    expect(host.forward()).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.events.map((e) => e.type)).toEqual([
      "shouted",
      "caught",
      "drew",
    ]);
    expect(sent[0]?.view.handCounts).toEqual(
      counts(states[22] as OnecardState),
    );
    expect(sent[0]?.view.decision).toBeNull();
  });
});

describe("그 걸음의 고유 사건 글(stepNotes)", () => {
  it("헛외침: 누른 사람의 헛외침과 벌칙 장(원카드! 줄은 겹쳐 빼다)", () => {
    expect(onecardStepNotes(events[2] ?? [], name)).toEqual([
      "컴퓨터 2: 헛외침",
      "컴퓨터 2: 헛외침 벌칙 1장",
    ]);
  });

  it("잡기: 잡은 사람과 잡힌 사람의 벌칙 장", () => {
    expect(onecardStepNotes(events[22] ?? [], name)).toEqual([
      "나: 컴퓨터 2 잡음",
      "컴퓨터 2: 잡혀서 벌칙 1장",
    ]);
  });

  it("본인 외침·공격으로 먹기·다시 섞기·다 냄·파산", () => {
    expect(onecardStepNotes(events[75] ?? [], name)).toEqual([
      "컴퓨터 1: 원카드!",
    ]);
    expect(onecardStepNotes(events[55] ?? [], name)).toEqual([
      "버린 더미 35장을 다시 섞음",
      "컴퓨터 2: 공격 2장 먹음",
    ]);
    expect(onecardStepNotes(events[95] ?? [], name)).toEqual([
      "컴퓨터 1: 다 냄, 1등",
    ]);
    expect(onecardStepNotes(events[97] ?? [], name)).toEqual([
      "컴퓨터 2: 공격 7장 먹음",
      "컴퓨터 2: 파산",
    ]);
  });

  it("낸 카드·한 장 먹기만 있는 걸음은 적을 것이 없다", () => {
    expect(onecardStepNotes(events[15] ?? [], name)).toEqual([]);
    expect(onecardStepNotes(events[1] ?? [], name)).toEqual([]);
  });
});
