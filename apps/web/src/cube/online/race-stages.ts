// 대결 실시간 단계 표시(docs/51 1-3). 화면을 모르는 순수 계산이다.
//
// 공정성: 새로 보내는 정보가 없다. 각 기기가 이미 받은 수 기록(`RaceSession.moveLog`: 수 글과 둔 시각)을 시작 상태에
// 다시 적용하며 혼자 맞추기와 같은 판정(`milestonesOf`)으로 이정표를 처음 지난 시각을 찾는다. 시각은 대결 시계(풀림 기준
// ms, 그 사람이 수에 단 시각)라 같은 기록을 받은 기기는 모두 같은 칩·시각을 낸다.
import { isRotation, milestonesOf, parseMoves } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { MILESTONE_RANK, type SplitGroup } from "../progress/splits";
import type { Split } from "../records";
import { applyLogText, isItemText } from "./items";

export interface LoggedMove {
  readonly m: string;
  readonly t: number;
}

interface PeerTrack {
  /** 지금까지 적용한 수 */
  count: number;
  state: PuzzleState;
  splits: Split[];
}

/**
 * 사람마다 이정표를 처음 지난 시각을 이어서 센다(수 기록은 뒤에 붙기만 하니 새 수만 적용한다).
 * 판(섞기)이 바뀌면 새로 만든다.
 */
export class StageTracker {
  private readonly peers = new Map<string, PeerTrack>();

  constructor(
    readonly n: number,
    private readonly start: PuzzleState,
  ) {}

  /** 그 사람의 수 기록까지 반영한 구간 기록(지난 차례대로) */
  update(id: string, log: readonly LoggedMove[]): readonly Split[] {
    let p = this.peers.get(id);
    if (!p || log.length < p.count) {
      p = { count: 0, state: this.start, splits: [] };
      this.peers.set(id, p);
    }
    for (; p.count < log.length; p.count++) {
      const entry = log[p.count] as LoggedMove;
      // 아이템전의 특별한 수(맞은 섞기·되감기)도 실제로 큐브에 들어간 대로 적용한다
      if (isItemText(entry.m)) {
        try {
          p.state = applyLogText(this.n, p.state, entry.m);
        } catch {
          continue;
        }
      } else {
        const move = parseMoves(this.n, entry.m)[0];
        if (!move) continue;
        p.state = applyLogText(this.n, p.state, entry.m);
        // 큐브 돌리기는 색 기준 판정을 바꾸지 않는다(혼자 맞추기 `SolveSession.track`과 같다)
        if (isRotation(this.n, move)) continue;
      }
      for (const mid of milestonesOf(this.n, p.state))
        if (!p.splits.some((s) => s.id === mid))
          p.splits.push({ id: mid, ms: entry.t });
    }
    return p.splits;
  }
}

/** 한 번에 다 계산(시험·결과 상자용) */
export function splitsFromLog(
  n: number,
  start: PuzzleState,
  log: readonly LoggedMove[],
): Split[] {
  return [...new StageTracker(n, start).update("x", log)];
}

export interface StageEntry {
  readonly id: string;
  readonly status: "playing" | "done" | "dnf" | "forfeit";
  /** 맞췄다고 알린 시간(맞춘 사람만) */
  readonly reported?: number | undefined;
  readonly groups: readonly SplitGroup[];
}

/**
 * 지금 앞선 차례(톡을 고를 때만 쓴다, 결과 순위는 대결 틀이 정한다).
 * 맞춘 사람(알린 시간 순) → 맞추는 중(가장 나아간 이정표가 높은 순, 같으면 먼저 지난 순, 이정표가 없으면 뒤) →
 * 못 맞춤 → 기권. 같으면 처음 차례 그대로.
 */
export function liveOrder(entries: readonly StageEntry[]): string[] {
  const statusRank = { done: 0, playing: 1, dnf: 2, forfeit: 3 } as const;
  const key = (e: StageEntry) => {
    const last = e.groups.at(-1);
    return {
      s: statusRank[e.status],
      done: e.reported ?? 0,
      rank: last ? (MILESTONE_RANK[last.main] ?? 0) : -1,
      at: last?.ms ?? 0,
    };
  };
  return entries
    .map((e, i) => ({ e, i, k: key(e) }))
    .sort(
      (a, b) =>
        a.k.s - b.k.s ||
        (a.k.s === 0 ? a.k.done - b.k.done : 0) ||
        (a.k.s === 1 ? b.k.rank - a.k.rank || a.k.at - b.k.at : 0) ||
        a.i - b.i,
    )
    .map((x) => x.e.id);
}

/** 이 사람 수를 넘으면 톡을 고른다 */
export const TOAST_ALL_UP_TO = 4;

/**
 * 띄울 톡(이정표를 지난 사람). 4명까지는 모두. 넘으면 1등이 바뀐 때의 새 1등, 나, 내 바로 앞뒤 사람만.
 * `order`는 이번 이정표를 반영한 차례, `prevLeader`는 그 전 1등.
 */
export function pickToasts(
  passed: readonly string[],
  {
    order,
    prevLeader,
    me,
  }: { order: readonly string[]; prevLeader: string | undefined; me: string },
): string[] {
  if (order.length <= TOAST_ALL_UP_TO) return [...passed];
  const allowed = new Set<string>();
  const leader = order[0];
  if (leader !== undefined && leader !== prevLeader) allowed.add(leader);
  const i = order.indexOf(me);
  if (i >= 0) {
    allowed.add(me);
    if (i > 0) allowed.add(order[i - 1] as string);
    if (i + 1 < order.length) allowed.add(order[i + 1] as string);
  }
  return passed.filter((id) => allowed.has(id));
}

/**
 * 결과 상자의 구간 기록 열: 사람들 칩(묶음)의 대표 단계를 모아 진행 차례로. 다 맞춘 순간(윗층)은 시간 칸이 있으니 뺀다
 */
export function splitColumns(
  groupsOf: readonly (readonly SplitGroup[])[],
): string[] {
  const ids = new Set<string>();
  for (const groups of groupsOf)
    for (const g of groups) if (g.main !== "ll") ids.add(g.main);
  return [...ids].sort(
    (a, b) => (MILESTONE_RANK[a] ?? 0) - (MILESTONE_RANK[b] ?? 0),
  );
}

/** 칸 하나: 그 단계를 처음 지난 시각. 지나지 않았거나 다 맞춘 순간에 함께 지났으면 null */
export function splitCell(splits: readonly Split[], id: string): number | null {
  const at = splits.find((s) => s.id === id)?.ms;
  if (at === undefined) return null;
  const done = splits.find((s) => s.id === "ll")?.ms;
  return done !== undefined && at === done ? null : at;
}
