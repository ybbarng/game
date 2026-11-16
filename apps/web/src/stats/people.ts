import { botName, DEFAULT_BOT_NAMES } from "@/game/bot-names";
import type { LobbyState } from "@/net/protocol";

import type { Outcome, Result } from "./outcome";

/*
 * 같이 한 사람별 기록. 이름은 이 기기에만 있다(내 기록·복기 기록). 통계로 보내지 않는다.
 * 2026-11-17부터 친구와 한 판·게임에 같이 앉은 사람 이름(`with`)을 남긴다. 그 전 기록은 복기 기록(최근 50게임)의
 * 자리 이름으로 채운다. 복기 기록에는 사람과 컴퓨터를 가르는 표시가 없어 컴퓨터 이름으로 보이는 자리는 뺀다.
 */

/** 대기실에서 나와 컴퓨터를 뺀 사람 이름 */
export function otherPeople(
  lobby: LobbyState | null,
  mySeat: number | null,
): string[] {
  if (!lobby || mySeat === null) return [];
  return lobby.seats
    .filter((s) => s.kind !== "bot" && s.seat !== mySeat)
    .map((s) => s.name);
}

/** 온라인 화면의 방(방장이면 host, 참가자면 guest)에서 그때 같이 앉은 사람을 읽는 함수 */
export function sessionPeople(session: {
  host: { lobby(): LobbyState } | null;
  guest: { lobby: LobbyState | null; seat: number | null } | null;
}): () => string[] {
  return () => {
    if (session.host) return otherPeople(session.host.lobby(), 0);
    if (session.guest)
      return otherPeople(session.guest.lobby, session.guest.seat);
    return [];
  };
}

/** 복기 기록 하나에서 쓰는 것 */
export interface ArchivePeople {
  id: string;
  mode: "solo" | "online";
  seat: number;
  seatNames: string[] | null;
}

/**
 * 옛 기록용: 복기 기록의 자리 이름으로 대국 키 → 같이 한 사람. 내 자리와 컴퓨터 이름으로 보이는 자리
 * (내 컴퓨터 이름 설정, 기본 이름, 「컴퓨터 n」이 그 자리 번호와 맞으면)는 뺀다
 */
export function peopleFromArchives(
  archives: readonly ArchivePeople[],
  myBotNames: readonly string[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const a of archives) {
    if (a.mode !== "online" || !a.seatNames) continue;
    const names = a.seatNames.filter((name, seat) => {
      if (seat === a.seat) return false;
      if (seat === 0) return true; // 방장 자리는 사람이다
      return (
        name !== botName(myBotNames, seat) &&
        name !== DEFAULT_BOT_NAMES[seat - 1] &&
        name !== `컴퓨터 ${seat}`
      );
    });
    if (names.length > 0) out.set(a.id, names);
  }
  return out;
}

export interface PersonStats {
  name: string;
  n: number;
  won: number;
  lost: number;
  drawn: number;
}

/**
 * 사람별 판 수와 승패. `with`가 없는 기록은 `fallback`(대국 키 → 이름)으로 채우고, 둘 다 없으면 세지 않는다.
 * 판이 많은 사람부터, 같으면 이름 차례
 */
export function byPerson(
  results: readonly Result[],
  fallback: ReadonlyMap<string, readonly string[]> = new Map(),
): PersonStats[] {
  const table = new Map<string, PersonStats>();
  const add = (name: string, outcome: Outcome) => {
    const p = table.get(name) ?? { name, n: 0, won: 0, lost: 0, drawn: 0 };
    p.n++;
    if (outcome === "win") p.won++;
    else if (outcome === "loss") p.lost++;
    else p.drawn++;
    table.set(name, p);
  };
  for (const r of results) {
    if (r.mode !== "online") continue;
    const names = r.with ?? fallback.get(r.key) ?? [];
    // 같은 이름이 둘 앉아도 그 판은 한 번만 센다.
    for (const name of new Set(names)) add(name, r.outcome);
  }
  return [...table.values()].sort(
    (a, b) => b.n - a.n || a.name.localeCompare(b.name, "ko"),
  );
}
