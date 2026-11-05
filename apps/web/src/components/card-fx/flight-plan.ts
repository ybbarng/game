/*
 * 날아가는 카드(겉그림) 계획의 순수한 부분(docs/05 4.12). 화면은 판 상태를 늘 바로 그리고, 연출은 그 위를
 * 지나가는 겉그림일 뿐이다. 그래서 도착 자리의 실제 카드는 상태가 바뀐 그 프레임에 그려지고(원카드 더미 치기
 * 반응 시간의 기준), 겉그림은 누름을 받지 않는다. 겉그림이 내려앉을 때까지 도착 카드를 가리고 싶으면 `hide`에
 * 그 카드의 이름(`data-flip`, 원카드 손패는 카드 id)을 단다.
 *
 * 걸음은 두 가지로 짠다: 게임이 사건으로 자리를 계산해 바로 짜거나(원카드 `planFx`), 장면이 바뀔 때 앞뒤 화면의
 * `data-flip` 자리를 재어 짠다(`useCardFlip`, 화투)
 */
import type { Rect } from "@/layout/compute-layout";

/** 카드 가운데 자리와 너비(px, 무대 기준). 높이는 카드 종류가 정한다 */
export interface Spot {
  x: number;
  y: number;
  w: number;
  rotate?: number;
}

/** 연출 한 걸음 */
export type FlightStep<C extends string = string> =
  | {
      kind: "fly";
      /** null이면 뒷면 */
      card: C | null;
      from: Spot;
      to: Spot;
      /** 이 묶음의 연출 시작부터(ms) */
      at: number;
      ms: number;
      /** 내려앉을 때까지 가려 둘 도착 카드(`data-flip` 이름) */
      hide?: string;
      /**
       * 출발 전(`at` 전)에도 출발 자리에 보인다. 장면이 바뀌어 실제 카드는 이미 새 자리로 갔지만 차례를 기다리는
       * 카드(화투: 낸 카드 뒤에 가져가는 먹은 패)를 앞 자리에 남겨 보일 때
       */
      wait?: boolean;
    }
  | {
      kind: "shuffle";
      /** 섞는 덱 자리 */
      deck: Spot;
      at: number;
      ms: number;
    };

/** 앞 연출이 이보다 더 밀렸으면 남은 것을 버리고 바로 시작한다 */
export const FX_MAX_LAG_MS = 900;

/**
 * 앞 연출이 남아 있으면 이번 연출을 언제 시작하나. 너무 밀렸으면(`maxLagMs` 넘게) 남은 것을 버리고 바로 시작한다
 * (연출이 판 상태보다 한참 뒤처져 엉뚱한 때 날지 않게)
 */
export function fxStart(
  now: number,
  busyUntil: number,
  maxLagMs = FX_MAX_LAG_MS,
): { delay: number; flush: boolean } {
  const lag = busyUntil - now;
  if (lag <= 0) return { delay: 0, flush: false };
  if (lag > maxLagMs) return { delay: 0, flush: true };
  return { delay: lag, flush: false };
}

/** 사각형(왼쪽 위 기준)을 가운데 자리로 */
export function spotOfRect(r: Rect): Spot {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w };
}

/** 한 걸음(한 장이 한 자리에서 다음 자리로 가는 데) 걸리는 시간(ms). 장면 연출(`useCardFlip`)의 걸음 */
export const FLIP_STEP_MS = 420;

/** 앞 장면(또는 새 장면)에서 카드 하나(`data-flip`)의 자리 */
export interface FlipSpot {
  /** 무대 왼쪽 위 기준 */
  rect: Rect;
  /** 가장 가까운 `data-flip-zone` 이름 */
  zone: string | null;
}
export type FlipSpots = ReadonlyMap<string, FlipSpot>;

/** 장면이 바뀔 때 카드 하나의 움직임 */
export interface FlipMove {
  /** 움직일 카드의 `data-flip` */
  id: string;
  /** 몇 번째 걸음에 출발하나(0부터). 그 전에는 출발 자리에서 기다린다 */
  step: number;
  /** 출발 자리: 이 id의 앞 장면 자리(예: 더미, 남의 뒷면 부채). 없으면 자기 앞 장면 자리 */
  from?: string;
  /** 새 자리로 가기 전에 들르는 자리(앞 장면의 id). 들를 때마다 한 걸음씩 더 쓴다 */
  via?: readonly string[];
}

const moved = (a: Rect, b: Rect) =>
  Math.abs(a.x - b.x) > 2 || Math.abs(a.y - b.y) > 2 || Math.abs(a.w - b.w) > 2;

/**
 * 앞뒤 장면의 자리로 겉그림 걸음을 짠다. `explicit`에 없는 카드도 자리가 바뀌었으면 첫 걸음에 옮긴다(손패가 한 장
 * 빠져 좁혀지는 것 등). 옮기는 카드는 마지막 걸음이 내려앉을 때까지 새 자리에서 가리고(`hide`), 출발 전에는 앞
 * 자리에 남겨 보인다(`wait`). `faceOf`는 `data-flip` 이름의 앞면 카드(뒷면·더미면 null)
 */
export function sceneFlights<C extends string>(
  before: FlipSpots,
  next: FlipSpots,
  explicit: readonly FlipMove[],
  faceOf: (id: string) => C | null,
  stepMs = FLIP_STEP_MS,
): { steps: FlightStep<C>[]; duration: number } {
  const named = new Set(explicit.map((m) => m.id));
  const all: FlipMove[] = [...explicit];
  for (const [id, spot] of next) {
    const was = before.get(id);
    if (!named.has(id) && was && moved(was.rect, spot.rect))
      all.push({ id, step: 0 });
  }
  const steps: FlightStep<C>[] = [];
  let total = 0;
  for (const m of all) {
    const to = next.get(m.id)?.rect;
    const start = before.get(m.from ?? m.id)?.rect;
    if (!to || !start) continue;
    const via = (m.via ?? []).flatMap((v) => {
      const r = before.get(v)?.rect;
      return r ? [r] : [];
    });
    const points = [start, ...via, to].map(spotOfRect);
    const card = faceOf(m.id);
    const legs = points.length - 1;
    for (let k = 0; k < legs; k++)
      steps.push({
        kind: "fly",
        card,
        from: points[k] as Spot,
        to: points[k + 1] as Spot,
        at: (m.step + k) * stepMs,
        ms: stepMs,
        ...(k === 0 ? { wait: true } : {}),
        ...(k === legs - 1 ? { hide: m.id } : {}),
      });
    total = Math.max(total, m.step + legs);
  }
  return { steps, duration: total * stepMs };
}
