// 파티 모드: 체력바 대결(docs/51 3-2, docs/47 9-6)과 아이템전(docs/51 3-3, docs/47 9-7). 화면을 모르는 순수 계산이다.
//
// - 사람마다 체력 100. 내가 이정표를 지날 때 아직 못 지난 사람들의 체력이 깎인다(판정은 `milestonesOf`).
// - 끝까지(핸디캡 목표가 있으면 그 목표까지) 맞추면 그 판을 이긴다. 그보다 먼저 남은 사람이 하나뿐이면 그 사람이 이긴다.
// - 아이템전이면 이정표를 지날 때 아이템을 받고(`items.ts` `drawItem`), 수 기록의 특별한 수로 쓴다. 누가 무엇을 가졌나, 누구에게
//   맞았나, 한 수 섞기를 제때 넣었나를 여기서 같은 차례로 판정한다. 체력바 없이(`hp: false`) 아이템만 쓸 수도 있다.
// - 시각은 그 사람이 단 시각이 아니라 대결 틀이 증인 하한으로 확인한 시각이다(`checkTime`, 중간 지점 `checkpointLog`).
// - 판 도중에는 확실한 데까지만 판정한다: 아직 받지 못한 수가 있을 수 있는 시각(`horizon`), 하한을 다 받지 못한 지점의 단 시각
//   가운데 가장 이른 때 앞까지. 그래서 판 도중의 판정은 판 끝(모든 기록을 받은 뒤)의 판정과 어긋나지 않고, 같은 메시지를
//   받은 기기는 같은 체력·같은 아이템·같은 승자를 낸다.
import { type MilestoneId, milestonesOf } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { checkTime } from "@/net/race/judge";
import type { CheckpointLog } from "@/net/race/types";
import {
  ATTACKS,
  blindFace,
  drawItem,
  type ItemKind,
  MIX_GRACE_MS,
  mixMoves,
  parseItemMark,
  type Standing,
  standingOf,
} from "./items";

/**
 * 파티 모드. 옛 방장은 `"hp"`만 안다(아이템전 값을 모르는 옛 화면은 그 방 상태를 버린다).
 * `"items"`는 아이템만(순위는 일반 대결처럼 시간), `"hp-items"`는 체력바 + 아이템
 */
export type PartyMode = "hp" | "items" | "hp-items";
export const PARTY_MODES: readonly PartyMode[] = ["hp", "items", "hp-items"];
export const PARTY_MODE_LABELS: Record<PartyMode, string> = {
  hp: "파티: 체력바",
  items: "파티: 아이템전",
  "hp-items": "파티: 체력바 + 아이템",
};
export const hasHp = (m: PartyMode | undefined): boolean =>
  m === "hp" || m === "hp-items";
export const hasItems = (m: PartyMode | undefined): boolean =>
  m === "items" || m === "hp-items";

export const PARTY_HP = 100;
/** 이보다 아래면 경고(20%) */
export const PARTY_LOW = 20;

/**
 * 크기마다 깎는 이정표와 깎는 양(맞수 한 명일 때 한 번에). 맞수가 여럿이면 나눠서, 꼴찌가 이정표 하나에 잃는 양은 사람 수와
 * 상관없이 같다. 3×3은 일곱 이정표 모두 뒤지면 일곱째(윗면)에서 0이 되고, 여섯째 뒤에 4가 남아 경고가 뜬다.
 * 2×2·4×4·5×5는 이정표가 둘이라 둘 다 뒤지면 둘째에서 0이 된다. 아이템도 이 이정표에서 받는다
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

/** 아이템전 규칙을 어겨 빠진 까닭(정직한 기기는 내지 않는다. 고친 클라이언트·끊김) */
export const ITEM_NOT_HELD = "갖지 않은 아이템을 씀";
export const ITEM_NO_HIT = "방해를 받지 않음";
export const ITEM_BAD_HIT = "확인 안 되는 방해";

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

/** 받은 아이템 하나 */
export interface ItemGrant {
  at: number;
  p: string;
  item: ItemKind;
  milestone: MilestoneId;
  standing: Standing;
  /** 가졌다(방패는 켜졌다). 이미 하나를 가졌으면(방패는 이미 켜졌으면) 받지 못하고 버린다 */
  kept: boolean;
}

/** 쓴 아이템 하나 */
export interface ItemUse {
  at: number;
  p: string;
  /** 그 사람의 몇 번째 쓰기(1부터) */
  k: number;
  item: ItemKind;
  /** 방해를 쓴 상대(없으면 아무도 없어 헛씀) */
  to?: string;
  /** 시간 줍기로 채운 체력 */
  healed?: number;
}

/** 남에게 쓴 방해 하나(막힌 것 포함) */
export interface ItemHit {
  at: number;
  by: string;
  to: string;
  k: number;
  item: ItemKind;
  /** 방패가 막았다 */
  blocked: boolean;
  /** 한 수 섞기가 넣을 수 */
  moves?: string;
  /** 한 면 가리기가 가린 면(자리 기준 0 위, 1 오른쪽, 2 앞) */
  face?: 0 | 1 | 2;
}

export interface ItemsOutcome {
  /** 지금 가진 아이템(하나까지) */
  slot: Record<string, ItemKind | null>;
  /** 방패가 켜져 있다 */
  guard: Record<string, boolean>;
  grants: ItemGrant[];
  uses: ItemUse[];
  hits: ItemHit[];
  /** 한 수 섞기를 맞았는데 아직 넣지 않은 것(그 사람 기기가 `hitText`로 넣는다) */
  owed: Record<string, { by: string; k: number; moves: string }[]>;
  /** 아이템 규칙을 어겨 빠진 사람과 까닭 */
  out: Record<string, string>;
}

export interface PartyOutcome {
  /** 남은 체력(0 아래로는 0). 체력바가 아니면 비어 있다 */
  hp: Record<string, number>;
  /** 체력이 0이 된 시각 */
  knockedOut: Record<string, number>;
  /** 대결 틀이 빼거나(틀린 수 등) 시각을 판정하지 못해 빠진 때, 아이템 규칙을 어겨 빠진 때 */
  left: Record<string, number>;
  /** 순위에 넣지 않는 사람(셋 이상 판에서 시각이 다툼인 사람, `PartyInput.exclude`로 처음부터 뺀 사람) */
  unranked: string[];
  hits: PartyHit[];
  /** 아이템전이면 */
  items?: ItemsOutcome;
  /** 이보다 이른 일은 확실히 판정했다(판 끝이면 Infinity) */
  until: number;
  /** 판이 정해졌다(체력바만. 아이템만인 판은 순위를 대결 틀이 매긴다) */
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
  /** 체력바(기본 켬). 끄면 아이템만: 깎기·탈락·남은 한 사람·판 정하기가 없다 */
  hp?: boolean;
  /** 아이템전: 판 씨앗(뽑기·섞을 수). `draw`는 시험만 넣는다(모든 기기가 같은 것을 넣는다. 제품은 `drawItem`) */
  items?: { seed: string; draw?: typeof drawItem };
  /**
   * 판정에서 처음부터 뺄 사람(이 기기가 계획을 맞춰 보지 못한 컴퓨터, docs/47 10-2). 그 사람의 이정표·아이템·맞춤은
   * 판정에 끼지 않는다(남을 깎거나 1등 견제 대상이 되지 않고, 판을 정하지 않는다). 순위 없음으로 끝에 둔다.
   * 기기마다 본 것으로 정하므로 기기마다 다를 수 있다
   */
  exclude?: readonly string[];
}

type Event =
  | { kind: "pass"; at: number; p: string; ids: MilestoneId[] }
  | { kind: "use"; at: number; p: string; k: number; item: ItemKind }
  | {
      kind: "inject";
      at: number;
      p: string;
      by: string;
      k: number;
      moves: string;
    }
  /** 한 수에 여럿을 지나 미뤄 둔 이정표 몫(그 판정 시각에 깎는다) */
  | { kind: "strike"; at: number; p: string; id: MilestoneId }
  | { kind: "solve"; at: number; p: string; t: number }
  | { kind: "dispute"; at: number; p: string }
  | { kind: "leave"; at: number; p: string };

const KIND_ORDER = {
  leave: 0,
  dispute: 1,
  pass: 2,
  // 같은 판정 시각이면 깎기(지나기·미룬 몫) 먼저, 그다음 쓰기(시간 줍기 등). 탈락은 그 뒤에 본다
  strike: 3,
  use: 4,
  inject: 5,
  solve: 6,
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
  const withHp = input.hp !== false;
  const seed = input.items?.seed;
  const draw = input.items?.draw ?? drawItem;
  const ladder = partyLadder(n);
  const excluded = new Set(input.exclude ?? []);
  const fight = [...input.players]
    .sort()
    .filter(
      (id) => logs[id] && logs[id]?.status !== "forfeit" && !excluded.has(id),
    );
  const hp: Record<string, number> = {};
  if (withHp) for (const id of fight) hp[id] = PARTY_HP;
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
      const acts = seed !== undefined ? m.ids.map(parseItemMark) : [];
      if (ids.length === 0 && !acts.some(Boolean)) continue;
      if (!final && !m.settled) {
        block(p, m.t);
        continue;
      }
      const c = checkTime(m.t, m.bounds, input.disputeMs);
      if (c.disputed) {
        events.push({ kind: "dispute", at: m.t, p });
        continue;
      }
      const at = c.accepted as number;
      if (ids.length > 0) events.push({ kind: "pass", at, p, ids });
      for (const a of acts) {
        if (a?.kind === "use")
          events.push({ kind: "use", at, p, k: a.k, item: a.item });
        else if (a?.kind === "inject")
          events.push({
            kind: "inject",
            at,
            p,
            by: a.by,
            k: a.k,
            moves: a.moves,
          });
      }
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
  /** 순위를 매기는 사람(빠지거나 0이 된 사람 빼고, 맞춘 사람은 맨 앞으로 남는다) */
  const field = new Set(fight);
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

  // ---- 아이템 ----
  const items: ItemsOutcome | undefined =
    seed !== undefined
      ? {
          slot: Object.fromEntries(fight.map((p) => [p, null])),
          guard: Object.fromEntries(fight.map((p) => [p, false])),
          grants: [],
          uses: [],
          hits: [],
          owed: {},
          out: {},
        }
      : undefined;
  /** 순위: 지난 이정표 수(많을수록), 같으면 먼저 닿은 사람. 맞춘 사람은 맨 앞 */
  const progress = new Map(fight.map((p) => [p, { count: 0, at: 0 }]));
  const solvedAt = new Map<string, number>();
  const standing = (p: string): [number, number] => {
    const s = solvedAt.get(p);
    if (s !== undefined) return [Number.POSITIVE_INFINITY, s];
    const g = progress.get(p) as { count: number; at: number };
    return [g.count, g.at];
  };
  const ahead = (q: string, p: string) => {
    const [c1, t1] = standing(q);
    const [c2, t2] = standing(p);
    return c1 > c2 || (c1 === c2 && t1 < t2);
  };
  const placeOf = (p: string) =>
    1 + [...field].filter((q) => q !== p && ahead(q, p)).length;
  /** 한 수 섞기를 맞아 넣어야 하는 것: 「쓴 사람|몇 번째」 → 누가·무엇을·언제 맞았나 */
  const owed = new Map<
    string,
    { to: string; moves: string; at: number; done: boolean }
  >();
  /** 섞기를 넣기 전에 지난 이정표(넣은 때로 미룬다) */
  const deferred = new Map<string, MilestoneId[]>();
  const leave = (p: string, at: number, reason?: string) => {
    if (!active.has(p)) return;
    active.delete(p);
    field.delete(p);
    left[p] = at;
    if (reason && items) items.out[p] = reason;
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
      if (e.kind === "leave") leave(e.p, at);
      else if (e.kind === "dispute") {
        // 1:1에서 누가 거짓인지 가릴 수 없다: 그 판은 판정하지 않는다. 셋 이상이면 그 사람만 순위 없이 뺀다(대결 틀과 같다)
        if (fight.length <= 2) {
          decided = { at, winner: null, end: "noDecision" };
          break;
        }
        leave(e.p, at);
        unranked.push(e.p);
      }
    }
    if (decided) break;
    /** 아직 넣지 않은 한 수 섞기가 있는 사람(그 사람이 그 뒤에 지난 이정표는 넣은 때로 미룬다) */
    const owes = (p: string, t: number) =>
      [...owed.values()].some((o) => o.to === p && !o.done && o.at < t);
    /** 이정표 지나기: 순위·깎기·받기. 같은 시각에 지난 것은 서로 깎지 않는다(먼저 모두 적고 나서 깎는다) */
    /** 이 이정표를 아직 못 지난 사람(이 시각까지 지났으면 깎지 않는다) */
    const behind = (p: string, id: MilestoneId) =>
      [...active].filter(
        (q) => q !== p && !((passed.get(q)?.get(id) ?? at + 1) <= at),
      );
    const strike = (p: string, id: MilestoneId, to: string[]) => {
      for (const q of to) hp[q] = (hp[q] as number) - damage;
      hits.push({ at, by: p, id, to, damage });
    };
    const runPasses = (list: { p: string; ids: MilestoneId[] }[]) => {
      for (const e of list) {
        for (const id of e.ids) passed.get(e.p)?.set(id, at);
        const g = progress.get(e.p) as { count: number; at: number };
        g.count += e.ids.length;
        g.at = at;
      }
      if (withHp) {
        // 한 순간(같은 사람, 같은 판정 시각)에 이정표 여럿을 지나면(단계 건너뛰기) 그 순간에는 하나 몫만 깎고, 남은 k번째
        // 몫은 판정 시각 + 1000·k에 하나씩 깎는다(그 사이 따라 지나면 깎지 않는다). 시각은 판정 시각이라 모든 기기가 같다
        const byPlayer = new Map<string, MilestoneId[]>();
        for (const e of list)
          byPlayer.set(e.p, [...(byPlayer.get(e.p) ?? []), ...e.ids]);
        for (const [p, ids] of byPlayer) {
          const due = [...ids]
            .sort((x, y) => ladder.ids.indexOf(x) - ladder.ids.indexOf(y))
            .filter((id) => behind(p, id).length > 0);
          const first = due[0];
          if (first !== undefined) strike(p, first, behind(p, first));
          due.slice(1).forEach((id, k) => {
            insert({ kind: "strike", at: at + LATER_MS * (k + 1), p, id }, i);
          });
        }
      }
      if (!items || seed === undefined) return;
      // 받기: 그때 순위(이 시각의 이정표를 모두 적은 뒤)로 뽑는다. 가진 것이 있으면 버린다. 방패는 받는 순간 켜진다
      for (const e of list) {
        const st = standingOf(placeOf(e.p), field.size);
        for (const id of [...e.ids].sort(
          (x, y) => ladder.ids.indexOf(x) - ladder.ids.indexOf(y),
        )) {
          const item = draw(seed, e.p, ladder.ids.indexOf(id) + 1, st, {
            n,
            hp: withHp,
          });
          let kept: boolean;
          if (item === "shield") {
            kept = !items.guard[e.p];
            items.guard[e.p] = true;
          } else {
            kept = items.slot[e.p] === null;
            if (kept) items.slot[e.p] = item;
          }
          items.grants.push({
            at,
            p: e.p,
            item,
            milestone: id,
            standing: st,
            kept,
          });
        }
      }
    };
    const passes: { p: string; ids: MilestoneId[] }[] = [];
    for (const e of now) {
      if (e.kind !== "pass" || !active.has(e.p)) continue;
      if (owes(e.p, at)) {
        const d = deferred.get(e.p) ?? [];
        d.push(...e.ids);
        deferred.set(e.p, d);
      } else passes.push(e);
    }
    runPasses(passes);
    if (withHp)
      for (const e of now) {
        if (e.kind !== "strike" || !active.has(e.p)) continue;
        const to = behind(e.p, e.id);
        if (to.length > 0) strike(e.p, e.id, to);
      }
    if (items && seed !== undefined) {
      for (const e of now) {
        if (e.kind !== "use" || !active.has(e.p)) continue;
        if (items.slot[e.p] !== e.item) {
          leave(e.p, at, ITEM_NOT_HELD);
          continue;
        }
        items.slot[e.p] = null;
        const use: ItemUse = { at, p: e.p, k: e.k, item: e.item };
        items.uses.push(use);
        if (e.item === "heal" && withHp) {
          const before = hp[e.p] as number;
          hp[e.p] = Math.min(PARTY_HP, before + damage);
          use.healed = (hp[e.p] as number) - before;
        }
        if (!ATTACKS.includes(e.item)) continue;
        // 상대: 맞추는 중인 사람 가운데 가장 앞선 사람(내가 1등이면 2등)
        const target = [...active]
          .filter((q) => q !== e.p && !solvedAt.has(q))
          .sort((x, y) => placeOf(x) - placeOf(y) || (x < y ? -1 : 1))[0];
        if (target === undefined) continue;
        use.to = target;
        const blocked = items.guard[target] === true;
        if (blocked) items.guard[target] = false;
        const hit: ItemHit = {
          at,
          by: e.p,
          to: target,
          k: e.k,
          item: e.item,
          blocked,
        };
        if (e.item === "mix") hit.moves = mixMoves(seed, e.p, e.k, n);
        if (e.item === "blind") hit.face = blindFace(seed, e.p, e.k);
        items.hits.push(hit);
        if (e.item === "mix" && !blocked)
          owed.set(`${e.p}|${e.k}`, {
            to: target,
            moves: hit.moves as string,
            at,
            done: false,
          });
      }
      // 넣기: 맞은 섞기와 같은 수를, 맞은 뒤에. 다 넣으면 미룬 이정표를 이 시각에 센다
      const released: { p: string; ids: MilestoneId[] }[] = [];
      for (const e of now) {
        if (e.kind !== "inject" || !active.has(e.p)) continue;
        const o = owed.get(`${e.by}|${e.k}`);
        if (!o || o.done || o.to !== e.p || o.moves !== e.moves || at < o.at) {
          leave(e.p, at, ITEM_BAD_HIT);
          continue;
        }
        o.done = true;
        const d = deferred.get(e.p);
        if (d && !owes(e.p, Number.POSITIVE_INFINITY)) {
          deferred.delete(e.p);
          const ids = d.filter(
            (id) => !passes.some((x) => x.p === e.p && x.ids.includes(id)),
          );
          if (ids.length > 0) released.push({ p: e.p, ids });
        }
      }
      runPasses(released);
    }
    if (withHp)
      for (const q of [...active])
        if ((hp[q] as number) <= 1e-9) {
          active.delete(q);
          field.delete(q);
          knockedOut[q] = at;
        }
    const solvers = now.filter((e): e is Extract<Event, { kind: "solve" }> => {
      if (e.kind !== "solve" || !active.has(e.p)) return false;
      // 한 수 섞기를 맞고 기한(맞은 뒤 MIX_GRACE_MS) 안에 넣지 않은 채 맞췄으면 그 맞춤은 받지 않는다. 기한 안이면 넣지 않아도 된다
      const late = [...owed.values()].some(
        (o) => o.to === e.p && !o.done && at >= o.at + MIX_GRACE_MS,
      );
      if (late) {
        leave(e.p, at, ITEM_NO_HIT);
        return false;
      }
      return true;
    });
    if (solvers.length > 0) {
      // 같은 인정 시각이면 알린 시각, 그다음 아이디(대결 틀 순위와 같은 차례)
      solvers.sort((x, y) => x.t - y.t || (x.p < y.p ? -1 : 1));
      if (withHp) {
        decided = { at, winner: (solvers[0] as Event).p, end: "solved" };
        break;
      }
      // 아이템만: 맞춘 사람은 더 받지도 맞지도 않고, 순위에서는 맨 앞에 남는다
      for (const e of solvers) {
        solvedAt.set(e.p, at);
        active.delete(e.p);
      }
    }
    if (withHp && fight.length >= 2 && active.size <= 1)
      decided = { at, winner: [...active][0] ?? null, end: "last" };
  }
  if (!decided && final && withHp) {
    const alive = [...active];
    const best = Math.max(...alive.map((p) => hp[p] as number));
    const top = alive.filter((p) => hp[p] === best);
    decided = {
      at: Number.POSITIVE_INFINITY,
      winner: top.length === 1 ? (top[0] as string) : null,
      end: "time",
    };
  }
  if (decided || final) until = Number.POSITIVE_INFINITY;
  else if (until === Number.POSITIVE_INFINITY) until = limit();
  if (items)
    for (const [key, o] of owed) {
      if (o.done || !active.has(o.to)) continue;
      const [by, k] = key.split("|") as [string, string];
      const list = items.owed[o.to] ?? [];
      list.push({ by, k: Number(k), moves: o.moves });
      items.owed[o.to] = list;
    }

  // 뺀 사람(기권하지 않은 사람만): 순위 없음
  const dropped = [...input.players]
    .sort()
    .filter(
      (id) => excluded.has(id) && logs[id] && logs[id]?.status !== "forfeit",
    );
  const out: PartyOutcome = {
    hp: Object.fromEntries(
      Object.entries(hp).map(([p, v]) => [p, Math.max(0, v)]),
    ),
    knockedOut,
    left,
    unranked: [...unranked, ...dropped],
    hits,
    ...(items ? { items } : {}),
    until,
    ranking: [],
    places: {},
  };
  if (decided) {
    out.decided = decided;
    rank(out, fight, active, input.players, dropped);
  }
  return out;
}

/** 정해진 판의 차례: 이긴 사람 → 남은 사람(체력 순) → 0이 됐거나 빠진 사람(늦게 빠진 순) → 순위 없음(뺀 사람 포함) → 기권 */
function rank(
  out: PartyOutcome,
  fight: readonly string[],
  active: ReadonlySet<string>,
  players: readonly string[],
  dropped: readonly string[],
): void {
  const d = out.decided as NonNullable<PartyOutcome["decided"]>;
  const unranked = new Set(out.unranked);
  const forfeit = [...players]
    .sort()
    .filter((p) => !fight.includes(p) && !dropped.includes(p));
  if (d.end === "noDecision") {
    out.ranking = [...fight, ...dropped, ...forfeit];
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
    ...dropped,
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
