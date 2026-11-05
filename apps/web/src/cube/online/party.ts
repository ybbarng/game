// 파티 모드: 체력바 대결(docs/51 3-2, docs/47 9-6). 화면을 모르는 순수 계산이다.
//
// - 사람마다 체력 100. 내가 이정표를 지날 때 아직 못 지난 사람들의 체력이 깎인다(판정은 `milestonesOf`).
// - 끝까지(핸디캡 목표가 있으면 그 목표까지) 맞추면 그 판을 이긴다. 그보다 먼저 남은 사람이 하나뿐이면 그 사람이 이긴다.
// - 시각은 그 사람이 단 시각이 아니라 대결 틀이 증인 하한으로 확인한 시각이다(`checkTime`, 중간 지점 `checkpointLog`).
// - 판 도중에는 확실한 데까지만 판정한다: 아직 받지 못한 수가 있을 수 있는 시각(`horizon`), 하한을 다 받지 못한 지점의 단 시각
//   가운데 가장 이른 때 앞까지. 그래서 판 도중의 판정은 판 끝(모든 기록을 받은 뒤)의 판정과 어긋나지 않고, 같은 메시지를
//   받은 기기는 같은 체력·같은 승자를 낸다.
import { type MilestoneId, milestonesOf } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { checkTime } from "@/net/race/judge";
import type { CheckpointLog } from "@/net/race/types";

export const PARTY_HP = 100;
/** 이보다 아래면 경고(20%) */
export const PARTY_LOW = 20;

/**
 * 크기마다 깎는 이정표와 깎는 양(맞수 한 명일 때 한 번에). 맞수가 여럿이면 나눠서, 꼴찌가 이정표 하나에 잃는 양은 사람 수와
 * 상관없이 같다. 3×3은 일곱 이정표 모두 뒤지면 일곱째(윗면)에서 0이 되고, 여섯째 뒤에 4가 남아 경고가 뜬다.
 * 2×2·4×4·5×5는 이정표가 둘이라 둘 다 뒤지면 둘째에서 0이 된다
 */
const LADDERS: Record<number, { ids: readonly MilestoneId[]; damage: number }> =
  {
    2: { ids: ["layer1", "oll"], damage: 50 },
    3: {
      ids: ["cross", "f2l1", "f2l2", "f2l3", "layer1", "layer2", "oll"],
      damage: 16,
    },
    4: { ids: ["centers", "edges"], damage: 50 },
    5: { ids: ["centers", "edges"], damage: 50 },
  };

export function partyLadder(n: number): {
  ids: readonly MilestoneId[];
  damage: number;
} {
  return LADDERS[n] ?? (LADDERS[3] as (typeof LADDERS)[number]);
}

/** 대결 틀의 중간 지점(`RaceGame.checkpointsOf`): 지금 상태가 지난, 깎는 이정표 */
export function partyCheckpoints(n: number, state: PuzzleState): MilestoneId[] {
  const ladder = partyLadder(n).ids;
  return milestonesOf(n, state).filter((id) => ladder.includes(id));
}

/** 체력이 0이 되어 스스로 그만둔다 */
export const PARTY_KO = "체력 0";
/** 판이 정해져 남은 사람이 그만둔다 */
export const PARTY_OVER = "판이 끝남";
export const PARTY_REASONS: readonly string[] = [PARTY_KO, PARTY_OVER];

export type PartyEnd = "solved" | "last" | "time" | "noDecision";

export const PARTY_END_LABELS: Record<PartyEnd, string> = {
  solved: "끝까지 맞춤",
  last: "끝까지 남음",
  time: "제한 시간",
  noDecision: "두 기기 기록이 다름",
};

export interface PartyHit {
  /** 풀림 기준 ms(확인한 시각) */
  at: number;
  by: string;
  id: MilestoneId;
  to: string[];
  damage: number;
}

export interface PartyOutcome {
  /** 남은 체력(0 아래로는 0) */
  hp: Record<string, number>;
  /** 체력이 0이 된 시각 */
  knockedOut: Record<string, number>;
  /** 대결 틀이 빼거나(틀린 수 등) 시각을 판정하지 못해 빠진 때 */
  left: Record<string, number>;
  /** 순위에 넣지 않는 사람(셋 이상 판에서 시각이 다툼인 사람) */
  unranked: string[];
  hits: PartyHit[];
  /** 이보다 이른 일은 확실히 판정했다(판 끝이면 Infinity) */
  until: number;
  /** 판이 정해졌다 */
  decided?: { at: number; winner: string | null; end: PartyEnd };
  /** 정해졌을 때만: 앞선 차례(기권·순위 없음은 뒤)와 등수(1부터, 같으면 같은 등수) */
  ranking: string[];
  places: Record<string, number>;
}

export interface PartyInput {
  n: number;
  players: readonly string[];
  /** 사람마다 이 기기가 받은 기록(`RaceSession.checkpointLog`) */
  logs: Readonly<Record<string, CheckpointLog | undefined>>;
  /** 증인 기기가 하나뿐일 때 다툼으로 보는 폭(대결 틀과 같은 값) */
  disputeMs: number;
  /** 판이 끝나 모든 기록을 받았다(남은 하한은 기다리지 않는다) */
  final: boolean;
}

type Event =
  | { kind: "pass"; at: number; p: string; ids: MilestoneId[] }
  /** 한 수에 여럿을 지나 미뤄 둔 이정표 몫(그 판정 시각에 깎는다) */
  | { kind: "strike"; at: number; p: string; id: MilestoneId }
  | { kind: "solve"; at: number; p: string; t: number }
  | { kind: "dispute"; at: number; p: string }
  | { kind: "leave"; at: number; p: string };

const KIND_ORDER = {
  leave: 0,
  dispute: 1,
  pass: 2,
  strike: 3,
  solve: 4,
} as const;

/** 한 수에 이정표 여럿을 지났을 때 남은 몫을 깎는 간격(ms, 판정 시각. 기기 시계가 아니다) */
export const PARTY_LATER_MS = 1_000;
const LATER_MS = PARTY_LATER_MS;

const order = (x: Event, y: Event) =>
  x.at - y.at ||
  KIND_ORDER[x.kind] - KIND_ORDER[y.kind] ||
  (x.p < y.p ? -1 : x.p > y.p ? 1 : 0);

export function judgeParty(input: PartyInput): PartyOutcome {
  const { n, logs, final } = input;
  const ladder = partyLadder(n);
  const fight = [...input.players]
    .sort()
    .filter((id) => logs[id] && logs[id]?.status !== "forfeit");
  const hp: Record<string, number> = {};
  for (const id of fight) hp[id] = PARTY_HP;
  const damage = ladder.damage / Math.max(1, fight.length - 1);
  const events: Event[] = [];
  /** 사람마다 판 도중 판정을 막는 시각(이보다 이른 일만 확실하다) */
  const wall = new Map<string, number>();
  const block = (p: string, t: number) =>
    wall.set(p, Math.min(wall.get(p) ?? Number.POSITIVE_INFINITY, t));
  for (const p of fight) {
    const log = logs[p] as CheckpointLog;
    if (!final) block(p, log.horizon);
    for (const m of log.marks) {
      const ids = m.ids.filter((x): x is MilestoneId =>
        ladder.ids.includes(x as MilestoneId),
      );
      if (ids.length === 0) continue;
      if (!final && !m.settled) {
        block(p, m.t);
        continue;
      }
      const c = checkTime(m.t, m.bounds, input.disputeMs);
      events.push(
        c.disputed
          ? { kind: "dispute", at: m.t, p }
          : { kind: "pass", at: c.accepted as number, p, ids },
      );
    }
    if (log.done) {
      if (!final && !log.done.settled) block(p, log.done.t);
      else {
        const c = checkTime(log.done.t, log.done.bounds, input.disputeMs);
        events.push(
          c.disputed
            ? { kind: "dispute", at: log.done.t, p }
            : { kind: "solve", at: c.accepted as number, p, t: log.done.t },
        );
      }
    }
    // 대결 틀이 뺀 사람(틀린 수·출발 전에 둔 수·컴퓨터 계획 없음 등): 마지막 수 뒤로는 판에 없다
    if (
      log.status === "dnf" &&
      !PARTY_REASONS.includes(log.reason ?? "") &&
      !log.done
    )
      events.push({ kind: "leave", at: log.last, p });
  }
  events.sort(order);
  /** 판정 도중에 생긴 일(미뤄 둔 몫)을 차례에 맞춰 끼운다 */
  const insert = (e: Event, from: number) => {
    let j = from;
    while (j < events.length && order(events[j] as Event, e) <= 0) j++;
    events.splice(j, 0, e);
  };

  const active = new Set(fight);
  const knockedOut: Record<string, number> = {};
  const left: Record<string, number> = {};
  const unranked: string[] = [];
  const passed = new Map<string, Map<MilestoneId, number>>(
    fight.map((p) => [p, new Map()]),
  );
  const hits: PartyHit[] = [];
  let decided: PartyOutcome["decided"];
  let until = Number.POSITIVE_INFINITY;
  const limit = () => {
    let at = Number.POSITIVE_INFINITY;
    for (const p of active) at = Math.min(at, wall.get(p) ?? at);
    return at;
  };

  for (let i = 0; i < events.length && !decided; ) {
    const at = (events[i] as Event).at;
    const cap = limit();
    if (!(at < cap)) {
      until = cap;
      break;
    }
    const now: Event[] = [];
    while (i < events.length && (events[i] as Event).at === at)
      now.push(events[i++] as Event);
    for (const e of now) {
      if (!active.has(e.p)) continue;
      if (e.kind === "leave") {
        active.delete(e.p);
        left[e.p] = at;
      } else if (e.kind === "dispute") {
        // 1:1에서 누가 거짓인지 가릴 수 없다: 그 판은 판정하지 않는다. 셋 이상이면 그 사람만 순위 없이 뺀다(대결 틀과 같다)
        if (fight.length <= 2) {
          decided = { at, winner: null, end: "noDecision" };
          break;
        }
        active.delete(e.p);
        left[e.p] = at;
        unranked.push(e.p);
      }
    }
    if (decided) break;
    // 같은 시각에 지난 것은 서로 깎지 않는다(먼저가 아니다): 먼저 모두 적고 나서 깎는다
    const passes = now.filter(
      (e): e is Extract<Event, { kind: "pass" }> =>
        e.kind === "pass" && active.has(e.p),
    );
    for (const e of passes)
      for (const id of e.ids) passed.get(e.p)?.set(id, at);
    /** 이 이정표를 아직 못 지난 사람(이 시각까지 지났으면 깎지 않는다) */
    const behind = (p: string, id: MilestoneId) =>
      [...active].filter(
        (q) => q !== p && !((passed.get(q)?.get(id) ?? at + 1) <= at),
      );
    const strike = (p: string, id: MilestoneId, to: string[]) => {
      for (const q of to) hp[q] = (hp[q] as number) - damage;
      hits.push({ at, by: p, id, to, damage });
    };
    // 한 수에 이정표 여럿을 지나면(단계 건너뛰기) 그 순간에는 하나 몫만 깎고, 남은 몫은 확인한 시각 + 1000·k에 하나씩 깎는다
    // (그 사이 따라 지나면 깎지 않는다). 시각은 판정 시각이라 모든 기기가 같다
    // 같은 사람이 같은 판정 시각에 지난 것은 한 순간으로 묶는다(같은 수, 같은 ms에 몰아 둔 수)
    const byPlayer = new Map<string, MilestoneId[]>();
    for (const e of passes)
      byPlayer.set(e.p, [...(byPlayer.get(e.p) ?? []), ...e.ids]);
    for (const [p, ids] of byPlayer) {
      const e = { p, ids };
      const due = [...e.ids]
        .sort((x, y) => ladder.ids.indexOf(x) - ladder.ids.indexOf(y))
        .filter((id) => behind(e.p, id).length > 0);
      const first = due[0];
      if (first !== undefined) strike(e.p, first, behind(e.p, first));
      due.slice(1).forEach((id, k) => {
        insert({ kind: "strike", at: at + LATER_MS * (k + 1), p: e.p, id }, i);
      });
    }
    for (const e of now) {
      if (e.kind !== "strike" || !active.has(e.p)) continue;
      const to = behind(e.p, e.id);
      if (to.length > 0) strike(e.p, e.id, to);
    }
    for (const q of [...active])
      if ((hp[q] as number) <= 1e-9) {
        active.delete(q);
        knockedOut[q] = at;
      }
    const solvers = now.filter(
      (e): e is Extract<Event, { kind: "solve" }> =>
        e.kind === "solve" && active.has(e.p),
    );
    if (solvers.length > 0) {
      // 같은 인정 시각이면 알린 시각, 그다음 아이디(대결 틀 순위와 같은 차례)
      solvers.sort((x, y) => x.t - y.t || (x.p < y.p ? -1 : 1));
      decided = { at, winner: (solvers[0] as Event).p, end: "solved" };
      break;
    }
    if (fight.length >= 2 && active.size <= 1)
      decided = { at, winner: [...active][0] ?? null, end: "last" };
  }
  if (!decided && final) {
    const alive = [...active];
    const best = Math.max(...alive.map((p) => hp[p] as number));
    const top = alive.filter((p) => hp[p] === best);
    decided = {
      at: Number.POSITIVE_INFINITY,
      winner: top.length === 1 ? (top[0] as string) : null,
      end: "time",
    };
  }
  if (decided) until = Number.POSITIVE_INFINITY;
  else if (until === Number.POSITIVE_INFINITY) until = limit();

  const out: PartyOutcome = {
    hp: Object.fromEntries(
      Object.entries(hp).map(([p, v]) => [p, Math.max(0, v)]),
    ),
    knockedOut,
    left,
    unranked,
    hits,
    until,
    ranking: [],
    places: {},
  };
  if (decided) {
    out.decided = decided;
    rank(out, fight, active, input.players);
  }
  return out;
}

/** 정해진 판의 차례: 이긴 사람 → 남은 사람(체력 순) → 0이 됐거나 빠진 사람(늦게 빠진 순) → 순위 없음 → 기권 */
function rank(
  out: PartyOutcome,
  fight: readonly string[],
  active: ReadonlySet<string>,
  players: readonly string[],
): void {
  const d = out.decided as NonNullable<PartyOutcome["decided"]>;
  const unranked = new Set(out.unranked);
  const forfeit = [...players].sort().filter((p) => !fight.includes(p));
  if (d.end === "noDecision") {
    out.ranking = [...fight, ...forfeit];
    return;
  }
  const outAt = (p: string) =>
    out.knockedOut[p] ?? out.left[p] ?? Number.NEGATIVE_INFINITY;
  const key = (p: string): [number, number] =>
    p === d.winner
      ? [0, 0]
      : active.has(p)
        ? [1, -(out.hp[p] as number)]
        : [2, -outAt(p)];
  const ranked = fight.filter((p) => !unranked.has(p));
  ranked.sort((x, y) => {
    const [a1, a2] = key(x);
    const [b1, b2] = key(y);
    return a1 - b1 || a2 - b2 || (x < y ? -1 : 1);
  });
  out.ranking = [
    ...ranked,
    ...fight.filter((p) => unranked.has(p)),
    ...forfeit,
  ];
  for (const [i, p] of ranked.entries()) {
    const prev = ranked[i - 1];
    const same =
      prev !== undefined &&
      key(prev)[0] === key(p)[0] &&
      key(prev)[1] === key(p)[1];
    out.places[p] = same ? (out.places[prev] as number) : i + 1;
  }
}
