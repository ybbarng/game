// 수 흐름 띠(docs/51 1-1). 내가 둔 수를 리듬게임 콤보처럼 하나씩 띄워 흘려보낸다. 화면을 모르는 순수 함수다.
// - 같은 층을 이어 돌리면 합친다(U U → U2, U U U → U′, U U′ → 지움). 되돌리기도 반대 수라 앞 수를 지운다.
// - 큐브 전체 돌리기(x·y·z)는 회색으로 작게 두고 수로 세지 않는다(빠르기에도 넣지 않는다).
// - 지나간 수는 `FLOW_KEEP`개만 남긴다.
// - 흐름 콤보(docs/51 2-1): 면 돌리기 사이가 `COMBO_GAP_MS` 안쪽이면 이어 친 것으로 센다. 멈추면 끊긴다.
import { type CubeMove, formatMove, isRotation } from "@game/cube-engine";

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

export interface FlowStrip {
  readonly items: readonly FlowItem[];
  /** 다음 번호 */
  readonly next: number;
  /** 면 돌리기를 둔 시각(ms, 빠르기 계산). 큐브 돌리기는 빼고, 최근 것만 */
  readonly times: readonly number[];
  /** 지금 이어 친 면 돌리기 수(흐름 콤보). 끊겼는지는 `comboNow`가 지금 시각으로 본다 */
  readonly combo: number;
  /** 마지막 면 돌리기 시각(ms). 없으면 null */
  readonly turnAt: number | null;
}

/** 남기는 수 */
export const FLOW_KEEP = 14;
/** 빠르기를 재는 구간(ms) */
export const FLOW_SPEED_WINDOW = 3_000;

/** 수 사이가 이보다 길면(ms) 콤보가 끊긴다 */
export const COMBO_GAP_MS = 1_000;
/** 이만큼 이어 쳐야 콤보를 보인다(두세 수는 공식 하나 안에서도 늘 이어진다) */
export const COMBO_SHOW = 4;

export const EMPTY_FLOW: FlowStrip = {
  items: [],
  next: 1,
  times: [],
  combo: 0,
  turnAt: null,
};

const sameLayers = (a: CubeMove, b: CubeMove) =>
  a.axis === b.axis && a.from === b.from && a.to === b.to;

/** 보일 글: 프라임은 ′ */
export function flowText(n: number, m: CubeMove): string {
  return formatMove(n, m).replace(/'/g, "′");
}

/**
 * 수 하나를 띠에 더한다. `color`는 그 수를 둔 때의 면 색(키 그림과 같은 기준), `at`은 시각(ms).
 */
export function pushFlow(
  strip: FlowStrip,
  n: number,
  move: CubeMove,
  color: number | null,
  at: number,
): FlowStrip {
  const rotation = isRotation(n, move);
  const times = rotation
    ? strip.times
    : [...strip.times.filter((t) => at - t <= FLOW_SPEED_WINDOW), at];
  // 큐브 돌리기는 콤보를 올리지도 끊지도 않는다(시각도 그대로라, 돌리느라 오래 멈추면 다음 수에서 끊긴다)
  const flow = rotation
    ? { combo: strip.combo, turnAt: strip.turnAt }
    : { combo: comboAfter(strip, at), turnAt: at };
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

function comboAfter(strip: FlowStrip, at: number): number {
  return strip.turnAt !== null && at - strip.turnAt <= COMBO_GAP_MS
    ? strip.combo + 1
    : 1;
}

/** 지금 콤보: 마지막 면 돌리기에서 `COMBO_GAP_MS`가 지나면 0 */
export function comboNow(strip: FlowStrip, now: number): number {
  return strip.turnAt !== null && now - strip.turnAt <= COMBO_GAP_MS
    ? strip.combo
    : 0;
}

/**
 * 콤보 강조 단계(0~4). 띠의 바탕·테두리가 단계마다 조금씩 짙어진다(번쩍이지 않게 색만 천천히 바뀐다).
 * 4수부터 보이고, 12·24·40수에서 한 단계씩
 */
export function comboLevel(combo: number): number {
  if (combo < COMBO_SHOW) return 0;
  if (combo < 12) return 1;
  if (combo < 24) return 2;
  if (combo < 40) return 3;
  return 4;
}

/** 면 돌리기 시각들(차례대로)에서 가장 긴 콤보. 판 끝 결과 상자·기록에 쓴다 */
export function longestCombo(times: readonly number[]): number {
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const t of times) {
    run = prev !== null && t - prev <= COMBO_GAP_MS ? run + 1 : 1;
    prev = t;
    if (run > best) best = run;
  }
  return best;
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
