import {
  createMatch,
  type PlayerView,
  presetRules,
  viewOf,
} from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import { ManualClock } from "./clock";
import { prepareGroup } from "./group";
import { FairGuestSeat } from "./guest-seat";
import type { FairQuery } from "./messages";

await prepareGroup("r255");

const rules = presetRules("standard6");

/** 1번 참가자 자리와 그 자리가 받은 화면(공약 중이라 죽이기 물음에는 곧바로 「없다」고 답한다) */
function guestSeat() {
  const clock = new ManualClock();
  const seat = new FairGuestSeat({
    rules,
    seat: 1,
    guestSeats: [1],
    group: "r255",
    broadcast: () => {},
    onIncident: () => {},
    onSnapshot: () => {},
    onVerify: () => {},
    clock,
  });
  const view: PlayerView = viewOf(createMatch({ rules, seed: 1 }).state, 1);
  seat.snapshot(view, []);
  const query: FairQuery = { kind: "kill", deal: 0, card: "SA" };
  const ask = () => seat.receive({ t: "fp", k: "query", id: "1", query }, 0);
  return { seat, view, clock, query, ask };
}

describe("참가자 자리가 방장 물음에 보낸 답(ownAnswers)", () => {
  it("답 뒤 다음 화면이 제때 오면 방장이 받았다고 본다", () => {
    const { seat, view, query, ask } = guestSeat();
    ask();
    seat.snapshot(view, []);
    expect(seat.ownAnswers).toEqual({
      seat: 1,
      answers: [{ query, have: false, delivered: true }],
    });
  });

  it("다음 화면을 아직 받지 못했으면 닿았는지 모른다", () => {
    const { seat, ask } = guestSeat();
    ask();
    expect(seat.ownAnswers.answers.map((a) => a.delivered)).toEqual([false]);
  });

  it("물음을 받고 5초가 지나서야 다음 화면이 오면 방장이 기다리다 넘어갔을 수 있어 닿았다고 보지 않는다", () => {
    const { seat, view, clock, ask } = guestSeat();
    ask();
    clock.advance(5_000);
    seat.snapshot(view, []);
    expect(seat.ownAnswers.answers.map((a) => a.delivered)).toEqual([false]);
  });

  it("다음 화면이 다시 연결한 화면이면 답이 닿기 전에 끊겼을 수 있어 닿았다고 보지 않는다", () => {
    const { seat, view, ask } = guestSeat();
    ask();
    seat.snapshot(view, [], true);
    seat.snapshot(view, []);
    expect(seat.ownAnswers.answers.map((a) => a.delivered)).toEqual([false]);
  });

  it("방장이 아닌 연결이 보낸 물음에는 답을 남기지 않는다", () => {
    const { seat, query } = guestSeat();
    seat.receive({ t: "fp", k: "query", id: "1", query }, 2);
    expect(seat.ownAnswers.answers).toEqual([]);
  });
});
