// 수 흐름 띠(docs/51 1-1). 내가 둔 수를 리듬게임 콤보처럼 하나씩 띄워 흘려보낸다. 화면을 모르는 순수 함수다.
// - 같은 층을 이어 돌리면 합친다(U U → U2, U U U → U′, U U′ → 지움). 되돌리기도 반대 수라 앞 수를 지운다.
// - 큐브 전체 돌리기(x·y·z)는 회색으로 작게 두고 수로 세지 않는다(빠르기에도 넣지 않는다).
// - 지나간 수는 `FLOW_KEEP`개만 남긴다.
// - 흐름 콤보(docs/51 2-1)는 `combo.ts`의 규칙을 그대로 쓴다(이어 치기·되돌리는 수·진행 없음).
import { type CubeMove, formatMove, isRotation } from "@game/cube-engine";

import { type ComboState, EMPTY_COMBO, pushCombo } from "./combo";

export { COMBO_GAP_MS, COMBO_SHOW, comboLevel, comboNow } from "./combo";

export interface FlowItem {
  /** 띠 안에서 늘 같은 번호(합쳐도 그대로). 그리기의 열쇠 */
  readonly id: number;
  /** 합칠 때마다 1씩 오른다(떴다 작아지는 움직임을 다시 일으킨다) */
  readonly rev: number;
  readonly move: CubeMove;
  /** 보일 글(WCA 표기, 프라임은 ′) */
  readonly text: string;
  /** 칠할 색: 수를 둔 때 그 면에 있던 색(면 번호, 키 그림과 같은 기준). 큐브 전체 돌리기는 null */
  readonly color: number | null;
  /** 큐브 전체 돌리기 */
  readonly rotation: boolean;
}

/** 흐름 콤보 상태(`combo.ts`)를 함께 든다 */
export interface FlowStrip extends ComboState {
  readonly items: readonly FlowItem[];
  /** 다음 번호 */
  readonly next: number;
  /** 면 돌리기를 둔 시각(ms, 빠르기 계산). 큐브 돌리기는 빼고, 최근 것만 */
  readonly times: readonly number[];
}

/** 남기는 수 */
export const FLOW_KEEP = 14;
/** 빠르기를 재는 구간(ms) */
export const FLOW_SPEED_WINDOW = 3_000;

export const EMPTY_FLOW: FlowStrip = {
  items: [],
  next: 1,
  times: [],
  ...EMPTY_COMBO,
};

const sameLayers = (a: CubeMove, b: CubeMove) =>
  a.axis === b.axis && a.from === b.from && a.to === b.to;

/** 보일 글: 프라임은 ′ */
export function flowText(n: number, m: CubeMove): string {
  return formatMove(n, m).replace(/'/g, "′");
}

/**
 * 수 하나를 띠에 더한다. `color`는 그 수를 둔 때의 면 색(키 그림과 같은 기준), `at`은 시각(ms).
 * `progress`는 이 수를 둔 뒤의 진행 점수(콤보의 「진행 없음」 규칙에 쓴다, 없으면 그 규칙을 쓰지 않는다)
 */
export function pushFlow(
  strip: FlowStrip,
  n: number,
  move: CubeMove,
  color: number | null,
  at: number,
  progress?: number,
): FlowStrip {
  const rotation = isRotation(n, move);
  const times = rotation
    ? strip.times
    : [...strip.times.filter((t) => at - t <= FLOW_SPEED_WINDOW), at];
  const c = pushCombo(strip, n, move, at, progress);
  const flow: ComboState = {
    combo: c.combo,
    turnAt: c.turnAt,
    run: c.run,
    start: c.start,
    recent: c.recent,
  };
  const last = strip.items.at(-1);
  if (last && sameLayers(last.move, move)) {
    const turns = (last.move.turns + move.turns) % 4;
    const rest = strip.items.slice(0, -1);
    if (turns === 0) return { items: rest, next: strip.next, times, ...flow };
    const merged: CubeMove = { ...last.move, turns: turns as 1 | 2 | 3 };
    return {
      items: [
        ...rest,
        { ...last, rev: last.rev + 1, move: merged, text: flowText(n, merged) },
      ],
      next: strip.next,
      times,
      ...flow,
    };
  }
  const item: FlowItem = {
    id: strip.next,
    rev: 0,
    move,
    text: flowText(n, move),
    color: rotation ? null : color,
    rotation,
  };
  return {
    items: [...strip.items, item].slice(-FLOW_KEEP),
    next: strip.next + 1,
    times,
    ...flow,
  };
}

/**
 * 지금 빠르기(초당 수). 최근 `FLOW_SPEED_WINDOW` 안의 면 돌리기 수를 그 구간 길이로 나눈다.
 * 구간 첫 수부터 지금까지가 더 짧으면(막 시작) 그만큼으로 나누되 1초 아래로는 줄이지 않는다. 두 수 아래면 null
 */
export function flowSpeed(strip: FlowStrip, now: number): number | null {
  const recent = strip.times.filter((t) => now - t <= FLOW_SPEED_WINDOW);
  if (recent.length < 2) return null;
  const span = Math.max(1_000, now - (recent[0] as number));
  return recent.length / (Math.min(span, FLOW_SPEED_WINDOW) / 1000);
}
