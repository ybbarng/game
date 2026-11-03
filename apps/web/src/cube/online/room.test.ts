import { type CubeMove, invertMoves, parseMoves } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { DelayNet, runUntil } from "@/net/race/race-fixture";
import { type Scrambler, scrambleSeed } from "./race-game";
import { CubeRoom } from "./room";
import { averageOf5, matchOver, standings } from "./standings";

/** 큐브 경주 방: 대기실 → 판 → 결과(ManualClock·DelayNet, 결정적) */

const SHORT = ["R U", "F R'", "U2 R F'"];
const fake: Scrambler = (event, seed) => ({
  event,
  text: SHORT[seed % SHORT.length] as string,
  official: false,
});

function setup() {
  const clock = new ManualClock();
  const net = new DelayNet(clock);
  const host = new CubeRoom({
    transport: net.join("h"),
    clock,
    isHost: true,
    name: "방장",
    scrambler: fake,
    settings: { n: 2, inspection: false, timeLimitSec: 60 },
  });
  const guest = new CubeRoom({
    transport: net.join("g"),
    clock,
    isHost: false,
    name: "  손님   하나 ",
    scrambler: fake,
  });
  clock.advance(100);
  return { clock, host, guest };
}

/** 내 경주가 풀리면 `delay` 뒤 섞기의 거꾸로를 한 번에 둔다 */
function solveWhenReleased(clock: ManualClock, room: CubeRoom, delay: number) {
  let done = "";
  room.onChange(() => {
    const s = room.session();
    const snap = s?.snapshot();
    if (!s || snap?.phase !== "race" || done === `${room.state?.race?.id}`)
      return;
    done = `${room.state?.race?.id}`;
    const text = fake("222", scrambleSeed(snap.seed as string)).valueOf() as {
      text: string;
    };
    const moves = invertMoves(parseMoves(2, text.text));
    clock.after(delay, () => {
      for (const m of moves) s.play(m as CubeMove);
    });
  });
}

describe("큐브 경주 방", () => {
  it("손님이 들어오면 이름이 실린 방 상태를 받고, 방장이 컴퓨터를 더해 판을 열면 모두 같은 결과를 낸다", () => {
    const { clock, host, guest } = setup();
    expect(guest.state?.players.map((p) => p.name)).toEqual([
      "방장",
      "손님 하나",
    ]);
    host.setSettings({ format: "ao5" });
    host.addBot("expert");
    clock.advance(100);
    expect(guest.state?.players).toHaveLength(3);
    expect(guest.state?.settings.format).toBe("ao5");

    solveWhenReleased(clock, host, 500);
    solveWhenReleased(clock, guest, 300);
    for (let round = 1; round <= 2; round++) {
      expect(host.startRound()).toBe(true);
      runUntil(
        clock,
        () => host.rounds.length === round && guest.rounds.length === round,
        120_000,
        50,
      );
      expect(guest.rounds[round - 1]?.result).toEqual(
        host.rounds[round - 1]?.result,
      );
      runUntil(clock, () => guest.state?.status === "between");
    }
    const players = host.state?.players.map((p) => p.id) as string[];
    const table = standings("ao5", players, host.rounds);
    expect(table.map((r) => r.id)).toEqual(
      standings("ao5", players, guest.rounds).map((r) => r.id),
    );
    // 섞기 글·수 기록이 남아 다시 볼 수 있다
    const last = guest.rounds.at(-1);
    expect(last?.scramble.length).toBeGreaterThan(0);
    expect(last?.logs.bot1?.length).toBeGreaterThan(0);
    expect(host.state?.status).toBe("between");
  });

  it("판 도중에는 설정을 바꾸거나 사람을 뺄 수 없다", () => {
    const { host } = setup();
    expect(host.startRound()).toBe(true);
    host.setSettings({ n: 3 });
    host.removePlayer("g");
    expect(host.state?.settings.n).toBe(2);
    expect(host.state?.players).toHaveLength(2);
  });

  it("4×4 이상으로 바꾸면 컴퓨터를 뺀다(컴퓨터는 2×2·3×3만)", () => {
    const { clock, host, guest } = setup();
    host.fillWithBots("beginner");
    expect(host.state?.players).toHaveLength(8);
    host.setSettings({ n: 4 });
    clock.advance(100);
    expect(guest.state?.players.map((p) => p.id)).toEqual(["h", "g"]);
  });
});

describe("종합 순위", () => {
  it("5판 평균은 가장 좋은·나쁜 판을 빼고, 못 맞춘 판이 둘이면 DNF", () => {
    expect(averageOf5([10, 20, 30, 40, 50])).toBe(30);
    expect(averageOf5([10, null, 30, 40, 50])).toBe(40);
    expect(averageOf5([10, null, 30, null, 50])).toBeNull();
    expect(averageOf5([10, 20])).toBe(15);
  });

  it("먼저 N판: 이긴 판 수로 끝난다", () => {
    const win = (id: string) => ({
      result: {
        ranking: [id, id === "a" ? "b" : "a"],
        players: {
          a: { id: "a", status: "done" as const, moves: 1, accepted: 1 },
          b: { id: "b", status: "done" as const, moves: 1, accepted: 2 },
        },
      },
    });
    const rounds = [win("a"), win("b"), win("a")];
    expect(matchOver("firstTo", 2, rounds)).toBe(true);
    expect(matchOver("firstTo", 3, rounds)).toBe(false);
    expect(standings("firstTo", ["a", "b"], rounds)[0]).toMatchObject({
      id: "a",
      wins: 2,
    });
  });
});
