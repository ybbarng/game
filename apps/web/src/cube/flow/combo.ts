// 흐름 콤보(docs/51 2-1, docs/47 8-8). 화면을 모르는 순수 함수다. 수 흐름 띠(`strip.ts`)와 혼자 맞추기 세션
// (`solve-session.ts`의 「가장 긴 콤보」)이 같은 규칙을 쓴다.
// - 면 돌리기 사이가 `COMBO_GAP_MS` 안쪽이면 이어 친 것으로 1 오른다. 멈추면 끊긴다(다음 수가 1).
// - 되돌리는 수는 콤보를 끊는다(0): 같은 층을 이어 돌려 합이 한 바퀴가 되는 수(R R′, R2 R2, R R R R, Rw Rw′).
//   큐브 돌리기(x·y·z)는 앞 수를 볼 때 건너뛰고, 그 뒤의 면 이름은 큐브를 돌린 만큼 바꿔 같은 층인지 본다.
// - 진행이 없으면 끊는다(0): 콤보가 `comboStepMoves(n)`수(3×3 이상 10수, 2×2 20수) 늘 때마다 진행 칸
//   (`flowScore`, 조각 점수 반 점이 한 칸, 큰 큐브는 센터 스티커·짝지은 엣지도 한 칸)이 콤보를 시작할 때보다 한 칸씩 더
//   올라 있어야 한다. 공식 도중에는 맞춘 조각이 잠깐 흐트러지므로 그 순간의 값이 아니라 최근 `COMBO_LOOK_BACK`수 가운데
//   가장 높은 값으로 본다. 끊기면 지금 칸 수를 새 시작으로 잡는다. 진행 칸을 주지 않으면(배우기 등) 이 규칙은 쓰지 않는다.
//   처음 정한 「20수 동안 최고치를 새로 넘지 못하면」은 초보자 해법의 마지막 층(같은 공식 되풀이)에서 최고치를 60수 넘게
//   못 넘어 끊겼고, 막 돌리기도 우연히 최고치를 자주 넘어 콤보가 30~60까지 쌓였다(docs/47 8-8).
// - 큐브 돌리기는 콤보를 올리지도 끊지도 않는다(시각도 그대로라, 돌리느라 오래 멈추면 다음 수에서 끊긴다).
import { type Axis, type CubeMove, isRotation } from "@game/cube-engine";

/** 수 사이가 이보다 길면(ms) 콤보가 끊긴다 */
export const COMBO_GAP_MS = 1_000;
/** 이만큼 이어 쳐야 콤보를 보인다(두세 수는 공식 하나 안에서도 늘 이어진다) */
export const COMBO_SHOW = 4;
/** 진행을 보는 간격(면 돌리기 수). 이만큼마다 진행 칸이 한 칸씩 더 올라 있어야 한다 */
export const COMBO_STEP_MOVES = 10;
/** 2×2는 조각이 8개뿐이라 칸이 드물게 오른다(초보자 해법의 첫 층) */
export const COMBO_STEP_MOVES_2 = 20;
/**
 * 진행을 볼 때 돌아보는 수(공식 도중에 잠깐 흐트러진 것을 빼려고). 보는 간격(`comboStepMoves`)과 따로 정한다: 가장 긴
 * 공식 하나만큼만 돌아보면 되므로, 2×2처럼 간격이 20수여도 그 앞 8수의 최고치는 일부러 보지 않는다(그때 쌓은 진행이
 * 지금 남아 있어야 한다)
 */
export const COMBO_LOOK_BACK = 12;

/** 크기마다 진행을 보는 간격 */
export function comboStepMoves(n: number): number {
  return n === 2 ? COMBO_STEP_MOVES_2 : COMBO_STEP_MOVES;
}

/** 이어 돌린 같은 층과 그 합(4분의 1 바퀴 단위, 0~3) */
interface Run {
  readonly axis: Axis;
  readonly from: number;
  readonly to: number;
  readonly sum: number;
}

export interface ComboState {
  /** 지금 이어 친 면 돌리기 수. 끊겼는지는 `comboNow`가 지금 시각으로 본다 */
  readonly combo: number;
  /** 마지막 면 돌리기 시각(ms). 없으면 null */
  readonly turnAt: number | null;
  /** 바로 앞 면 돌리기의 층(지금 쥔 방향 기준)과 같은 층을 이어 돌린 합 */
  readonly run: Run | null;
  /** 이 콤보를 시작할 때의 진행 칸. 없으면 null */
  readonly start: number | null;
  /** 최근 면 돌리기 뒤의 진행 칸(`COMBO_LOOK_BACK`개까지, 차례대로) */
  readonly recent: readonly number[];
}

export const EMPTY_COMBO: ComboState = {
  combo: 0,
  turnAt: null,
  run: null,
  start: null,
  recent: [],
};

// ── 큐브 돌리기 뒤의 층 ──────────────────────────────────

/** 방향: 축과 쪽(+1이면 층 1이 있는 R·U·F 쪽) */
type Dir = readonly [Axis, 1 | -1];

/**
 * 축 `a`를 + 쪽에서 볼 때 시계 방향 90°로 큐브를 돌리면 다른 축 방향이 어디로 가나.
 * x(R처럼): F→U, U→B. y(U처럼): F→L, R→F. z(F처럼): U→R, R→D
 */
const QUARTER: Readonly<Record<Axis, Partial<Record<Axis, Dir>>>> = {
  x: { y: ["z", -1], z: ["y", 1] },
  y: { z: ["x", -1], x: ["z", 1] },
  z: { x: ["y", -1], y: ["x", 1] },
};

function turnDir(d: Dir, rot: Axis, turns: number): Dir {
  let [axis, sign] = d;
  for (let i = 0; i < turns; i++) {
    const to = QUARTER[rot][axis];
    if (!to) break; // 돌리는 축과 같은 축은 그대로
    axis = to[0];
    sign = (to[1] * sign) as 1 | -1;
  }
  return [axis, sign];
}

/** 큐브 돌리기 `rot` 뒤, 앞서 돌린 층(`run`)을 새로 쥔 방향의 이름으로 */
function runAfterRotation(n: number, run: Run, rot: CubeMove): Run {
  const [axis, sign] = turnDir([run.axis, 1], rot.axis, rot.turns);
  if (sign === 1) return { ...run, axis };
  // 반대쪽으로 갔다: 층 번호가 뒤집히고, + 쪽에서 본 돌림 방향도 뒤집힌다
  return {
    axis,
    from: n + 1 - run.to,
    to: n + 1 - run.from,
    sum: (4 - run.sum) % 4,
  };
}

// ── 한 수 ────────────────────────────────────────────

/**
 * 수 하나를 콤보에 더한다. `at`은 시각(ms), `progress`는 이 수를 둔 뒤의 진행 칸(`flowScore`).
 * 진행 칸이 없으면 「진행 없음」 규칙은 건너뛴다
 */
export function pushCombo(
  c: ComboState,
  n: number,
  move: CubeMove,
  at: number,
  progress?: number,
): ComboState {
  if (isRotation(n, move))
    return c.run ? { ...c, run: runAfterRotation(n, c.run, move) } : c;
  const joined = c.turnAt !== null && at - c.turnAt <= COMBO_GAP_MS;
  const fresh = (combo: number, run: Run): ComboState => ({
    combo,
    turnAt: at,
    run,
    start: progress ?? null,
    recent: progress === undefined ? [] : [progress],
  });
  const same =
    c.run !== null &&
    c.run.axis === move.axis &&
    c.run.from === move.from &&
    c.run.to === move.to;
  const run: Run = {
    axis: move.axis,
    from: move.from,
    to: move.to,
    sum: ((same ? (c.run?.sum ?? 0) : 0) + move.turns) % 4,
  };
  // 되돌리는 수: 끊는다
  if (same && run.sum === 0) return fresh(0, run);
  if (!joined) return fresh(1, run);
  const combo = c.combo + 1;
  if (progress === undefined) return { ...c, combo, turnAt: at, run };
  // 앞 콤보가 0에서 다시 시작하면 이 수가 새 시작이다
  if (c.start === null || c.combo === 0) return fresh(combo, run);
  const recent = [...c.recent, progress].slice(-COMBO_LOOK_BACK);
  const step = comboStepMoves(n);
  // 진행이 없다: 끊는다
  if (
    combo % step === 0 &&
    Math.max(...recent) < c.start + Math.floor(combo / step)
  )
    return fresh(0, run);
  return { combo, turnAt: at, run, start: c.start, recent };
}

/** 지금 콤보: 마지막 면 돌리기에서 `COMBO_GAP_MS`가 지나면 0 */
export function comboNow(c: ComboState, now: number): number {
  return c.turnAt !== null && now - c.turnAt <= COMBO_GAP_MS ? c.combo : 0;
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

/** 이어진 수들(차례대로)의 가장 긴 콤보. 시험·기록이 같은 규칙으로 센다 */
export function longestCombo(
  n: number,
  steps: readonly { move: CubeMove; at: number; progress?: number }[],
): number {
  let c = EMPTY_COMBO;
  let best = 0;
  for (const s of steps) {
    c = pushCombo(c, n, s.move, s.at, s.progress);
    if (c.combo > best) best = c.combo;
  }
  return best;
}
