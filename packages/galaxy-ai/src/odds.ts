import {
  ASTEROID,
  activeCards,
  BASE,
  BOARD_SIZE,
  COMET,
  firstStarOfSide,
  type GalaxyBoard,
  OBSERVATORY,
  sideOf,
} from "@game/galaxy-engine";

/**
 * 칸 밟힘 확률(docs/48 3-3·8절 고수). 한 차례를 주사위 둘·같은 눈 한 번 더·세 번째 같은 눈·
 * 소행성대(다음 차례 같은 눈이면 나감)·혜성 한 번 더·공문 이동(11 소행성대,
 * 13 관측지, 14 다음 계절 첫 별, 15 혜성)으로 펼친 마르코프 연쇄를 정확히 계산한다.
 * 차례 시작 자리의 정상 분포에서 한 차례에 각 칸에 멈추는 기대 횟수를 낸다.
 *
 * 가정: 공문은 더미에서 고르게 나온다(실제는 쓴 공문이 빠지지만 길게 보면 같다).
 * 소행성대에 걸리면 50을 내지 않고 굴린다. 공문 11·세 번째 같은 눈으로 소행성대에 가는 것도 그 칸에 멈춘 것으로 센다.
 */

/** 한 걸음을 펼친 결과(무게 1 기준): 칸마다 멈춘 기대 횟수, 차례가 끝난 자리 분포 */
interface Spread {
  land: Float64Array;
  /** 0~31 칸(풀려 있음), 32 소행성대에 걸림 */
  end: Float64Array;
}

const JAILED = BOARD_SIZE;
/** 한 번 멈춘 뒤 혜성·공문으로 이어 가는 이동을 따라가는 상한 */
const HOPS = 12;
const DICE: { sum: number; doubles: boolean }[] = [];
for (let a = 1; a <= 6; a++)
  for (let b = 1; b <= 6; b++) DICE.push({ sum: a + b, doubles: a === b });

function empty(): Spread {
  return {
    land: new Float64Array(BOARD_SIZE),
    end: new Float64Array(BOARD_SIZE + 1),
  };
}

function addInto(target: Spread, source: Spread, weight: number): void {
  for (let i = 0; i < BOARD_SIZE; i++)
    target.land[i] =
      (target.land[i] as number) + weight * (source.land[i] as number);
  for (let i = 0; i <= BOARD_SIZE; i++)
    target.end[i] =
      (target.end[i] as number) + weight * (source.end[i] as number);
}

/** 한 차례가 펼쳐지는 계산(판마다 공문 목록이 달라 판마다 따로) */
function turnModel(board: GalaxyBoard) {
  const cards = activeCards(board);
  const memo = new Map<string, Spread>();
  const cached = (key: string, make: () => Spread): Spread => {
    const hit = memo.get(key);
    if (hit) return hit;
    const made = make();
    memo.set(key, made);
    return made;
  };

  /** 칸의 일을 마친 뒤: 같은 눈이면 한 번 더, 아니면 끝 */
  const settle = (sq: number, again: boolean, doubles: number): Spread =>
    cached(`s${sq}|${again}|${doubles}`, () => {
      if (again) return roll(sq, doubles);
      const out = empty();
      out.end[sq] = 1;
      return out;
    });

  const jail = (): Spread => {
    const out = empty();
    out.land[ASTEROID] = 1;
    out.end[JAILED] = 1;
    return out;
  };

  /** 이 칸에 멈췄다 */
  const land = (sq: number, again: boolean, doubles: number, hop = 0): Spread =>
    cached(`l${sq}|${again}|${doubles}|${hop}`, () => {
      const out = empty();
      out.land[sq] = 1;
      // 혜성 → 공문 15 → 혜성처럼 돌아오는 길이 있다. 이어진 이동이 HOPS번을 넘는 몫(1e-15 아래)은 그 칸에서 멈춘 것으로 친다
      if (hop >= HOPS) {
        addInto(out, settle(sq, again, doubles), 1);
        return out;
      }
      if (sq === COMET) {
        for (const d of DICE)
          addInto(
            out,
            land((COMET + d.sum) % BOARD_SIZE, again, doubles, hop + 1),
            1 / 36,
          );
        return out;
      }
      if (board.squares[sq]?.kind === "notice") {
        const w = 1 / cards.length;
        for (const card of cards) {
          let next: Spread;
          switch (card) {
            case 11:
              next = jail();
              break;
            case 13:
              next = land(OBSERVATORY, again, doubles, hop + 1);
              break;
            case 14:
              next = land(
                firstStarOfSide((sideOf(sq) ?? 0) + 1),
                again,
                doubles,
                hop + 1,
              );
              break;
            case 15:
              next = land(COMET, again, doubles, hop + 1);
              break;
            default:
              next = settle(sq, again, doubles);
          }
          addInto(out, next, w);
        }
        return out;
      }
      addInto(out, settle(sq, again, doubles), 1);
      return out;
    });

  /** 풀려 있는 자리에서 굴린다(`doubles`는 이번 차례 같은 눈 수) */
  const roll = (sq: number, doubles: number): Spread =>
    cached(`r${sq}|${doubles}`, () => {
      const out = empty();
      for (const d of DICE) {
        if (d.doubles && doubles >= 2) addInto(out, jail(), 1 / 36);
        else
          addInto(
            out,
            land(
              (sq + d.sum) % BOARD_SIZE,
              d.doubles,
              doubles + (d.doubles ? 1 : 0),
            ),
            1 / 36,
          );
      }
      return out;
    });

  /** 차례 시작 자리 하나에서 한 차례 */
  const turnFrom = (start: number): Spread => {
    if (start !== JAILED) return roll(start, 0);
    // 걸린 차례: 같은 눈이면 그만큼 나가고(한 번 더 없음), 아니면 쉬고 다음 차례에는 풀려 있다
    const out = empty();
    for (const d of DICE) {
      if (d.doubles)
        addInto(out, land((ASTEROID + d.sum) % BOARD_SIZE, false, 0), 1 / 36);
      else out.end[ASTEROID] = (out.end[ASTEROID] as number) + 1 / 36;
    }
    return out;
  };
  return turnFrom;
}

const rateCache = new WeakMap<GalaxyBoard, readonly number[]>();

/**
 * 한 사람의 한 차례에 각 칸에 멈추는 기대 횟수(칸 32개). 합은 한 차례에 멈추는 칸 수(같은 눈·혜성·공문 이동 때문에 1보다 크다).
 * 고수가 기대 이용료를 셀 때 쓴다
 */
export function landingRate(board: GalaxyBoard): readonly number[] {
  const hit = rateCache.get(board);
  if (hit) return hit;
  const turnFrom = turnModel(board);
  const spreads = Array.from({ length: BOARD_SIZE + 1 }, (_, s) => turnFrom(s));
  let dist = new Float64Array(BOARD_SIZE + 1);
  dist[BASE] = 1;
  // 정상 분포: 한 바퀴 넘게 돌면 시작 자리는 잊힌다. 충분히 되풀이한다(가볍다: 33 × 33 × 400)
  for (let k = 0; k < 400; k++) {
    const next = new Float64Array(BOARD_SIZE + 1);
    for (let s = 0; s <= BOARD_SIZE; s++) {
      const p = dist[s] as number;
      if (p === 0) continue;
      const end = (spreads[s] as Spread).end;
      for (let t = 0; t <= BOARD_SIZE; t++)
        next[t] = (next[t] as number) + p * (end[t] as number);
    }
    dist = next;
  }
  const rate = new Array<number>(BOARD_SIZE).fill(0);
  for (let s = 0; s <= BOARD_SIZE; s++) {
    const p = dist[s] as number;
    const land = (spreads[s] as Spread).land;
    for (let i = 0; i < BOARD_SIZE; i++)
      rate[i] = (rate[i] as number) + p * (land[i] as number);
  }
  rateCache.set(board, rate);
  return rate;
}

/** 칸 밟힘 비율(합 1): 멈춘 칸 가운데 그 칸의 몫. bench의 「칸마다 밟힌 비율」과 견준다 */
export function landingOdds(board: GalaxyBoard): number[] {
  const rate = landingRate(board);
  const total = rate.reduce((a, b) => a + b, 0);
  return rate.map((r) => r / total);
}
