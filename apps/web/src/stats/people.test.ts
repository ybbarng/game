import { describe, expect, it } from "vitest";

import type { LobbyState } from "@/net/protocol";

import type { Result } from "./outcome";
import {
  byPerson,
  otherPeople,
  peopleFromArchives,
  sessionPeople,
} from "./people";

const LOBBY: LobbyState = {
  ruleCode: "",
  started: true,
  seats: [
    { seat: 0, name: "방장 지은", kind: "host", connected: true },
    { seat: 1, name: "나", kind: "guest", connected: true },
    { seat: 2, name: "서연", kind: "bot", connected: true },
    { seat: 3, name: "철수", kind: "guest", connected: false },
  ],
};

function result(
  outcome: Result["outcome"],
  extra: Partial<Result> = {},
): Result {
  return { at: 0, key: "online:r1", mode: "online", outcome, ...extra };
}

describe("같이 앉은 사람 읽기", () => {
  it("대기실에서 내 자리와 컴퓨터 자리를 빼고 사람 이름만 남긴다(끊긴 사람도 같이 앉은 사람이다)", () => {
    expect(otherPeople(LOBBY, 1)).toEqual(["방장 지은", "철수"]);
    expect(otherPeople(LOBBY, null)).toEqual([]);
  });

  it("방장이면 0번 자리가 나이고, 참가자면 받은 자리가 나다", () => {
    expect(
      sessionPeople({ host: { lobby: () => LOBBY }, guest: null })(),
    ).toEqual(["나", "철수"]);
    expect(
      sessionPeople({ host: null, guest: { lobby: LOBBY, seat: 3 } })(),
    ).toEqual(["방장 지은", "나"]);
    expect(sessionPeople({ host: null, guest: null })()).toEqual([]);
  });

  it("옛 기록: 복기 기록의 자리 이름에서 나와 컴퓨터 이름으로 보이는 자리를 뺀다", () => {
    const map = peopleFromArchives(
      [
        {
          id: "online:r1",
          mode: "online",
          seat: 1,
          seatNames: ["지은", "나", "지호", "철수", "컴퓨터 4", "내 봇"],
        },
        { id: "solo:5", mode: "solo", seat: 0, seatNames: null },
      ],
      ["", "", "", "", "내 봇"],
    );
    // 2번 「지호」는 기본 이름 3번째라 2번 자리 기본 이름(서연)과 달라 사람으로 본다.
    expect(map.get("online:r1")).toEqual(["지은", "지호", "철수"]);
    expect(map.has("solo:5")).toBe(false);
  });
});

describe("사람별 판 수와 승률", () => {
  it("판마다 같이 한 사람에게 승패를 하나씩 더하고, 판이 많은 사람부터 늘어놓는다", () => {
    const people = byPerson([
      result("win", { with: ["철수", "영희"] }),
      result("loss", { with: ["철수"] }),
      result("draw", { with: ["철수"] }),
    ]);
    expect(people).toEqual([
      { name: "철수", n: 3, won: 1, lost: 1, drawn: 1 },
      { name: "영희", n: 1, won: 1, lost: 0, drawn: 0 },
    ]);
  });

  it("이름이 없는 옛 기록은 대국 키로 복기 기록의 이름을 빌리고, 그것도 없으면 세지 않는다", () => {
    const people = byPerson(
      [
        result("win", { key: "online:old" }),
        result("win", { key: "online:gone" }),
      ],
      new Map([["online:old", ["민수"]]]),
    );
    expect(people).toEqual([{ name: "민수", n: 1, won: 1, lost: 0, drawn: 0 }]);
  });

  it("혼자 한 판은 세지 않고, 같은 이름이 둘 앉아도 그 판은 한 번만 센다", () => {
    const people = byPerson([
      result("win", { mode: "solo", with: ["철수"] }),
      result("loss", { with: ["철수", "철수"] }),
    ]);
    expect(people).toEqual([{ name: "철수", n: 1, won: 0, lost: 1, drawn: 0 }]);
  });
});
