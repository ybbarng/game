// 공식 연습 출제(docs/47 16-9). 씨앗이 같고 기록이 같으면 같은 10문제를 같은 차례로 낸다
// (겨루기 3단계는 기록 없이 씨앗만 넘겨 모두에게 같은 문제를 준다). 느렸거나 틀린 상황이 더 자주 나오고,
// 익숙해진 상황은 윗면을 돌려 둔 채(앞 윗면 돌리기를 붙여) 낸다.
import { createRngFromSeed } from "@game/cube-engine";
import { nextInt } from "@game/mighty-engine";

import { averageMs, type CaseStats, type TrainBook } from "../learn/progress";
import { joinAlg, type Problem } from "./problem";
import { ROUND_SIZE } from "./round";

/** 이만큼 맞추고 틀림이 적으면 익숙한 상황으로 본다(윗면을 돌려 둔 채 낸다) */
export const FAMILIAR_SOLVES = 5;
/** 익숙하다고 볼 틀림 비율 상한 */
export const FAMILIAR_FAIL_RATE = 0.2;
/** 처음 보는 상황의 무게(본 상황 보통 무게 1보다 크게: 한 판 안에 고루 만나게) */
export const NEW_WEIGHT = 2;

const AUFS = ["", "U", "U2", "U'"] as const;

const failRate = (s: CaseStats) =>
  s.solves + s.fails === 0 ? 0 : s.fails / (s.solves + s.fails);

export function familiar(s: CaseStats | undefined): boolean {
  return (
    !!s && s.solves >= FAMILIAR_SOLVES && failRate(s) <= FAMILIAR_FAIL_RATE
  );
}

/**
 * 상황 하나의 무게. 처음 보는 것 NEW_WEIGHT, 본 것은 (평균 ÷ 단계 안 평균들의 가운데 값, 0.5~3) × (1 + 3 × 틀림 비율).
 * 느린 것은 많아야 세 배, 늘 틀리는 것은 네 배까지 자주 나온다.
 */
export function caseWeight(
  s: CaseStats | undefined,
  typicalMs: number | null,
): number {
  if (!s || s.solves + s.fails === 0) return NEW_WEIGHT;
  const avg = averageMs(s);
  const slow =
    avg !== null && typicalMs ? Math.min(3, Math.max(0.5, avg / typicalMs)) : 1;
  return slow * (1 + 3 * failRate(s));
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2
    ? (s[mid] as number)
    : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

export interface DrawOptions {
  seed: number;
  /** 상황 id → 보일 공식 */
  algOf: (caseId: string) => string;
  /** 이 기기의 연습 기록(없으면 고르게, 윗면 돌리기 없이) */
  book?: TrainBook;
  /** 익숙한 상황에 앞 윗면 돌리기를 붙이는 단계인가 */
  auf?: boolean;
  count?: number;
}

/** 한 판의 문제들. 바로 앞과 같은 상황은 (고를 것이 둘 이상이면) 잇달아 내지 않는다 */
export function drawRound(
  caseIds: readonly string[],
  opts: DrawOptions,
): Problem[] {
  const rng = createRngFromSeed(opts.seed);
  const book = opts.book ?? {};
  const typical = median(
    caseIds.flatMap((id) => {
      const a = averageMs(book[id]);
      return a === null ? [] : [a];
    }),
  );
  // 무게는 1/100 단위 정수로 맞춰 고른다(소수 더하기 차이로 결과가 바뀌지 않게)
  const weights = caseIds.map((id) =>
    Math.max(1, Math.round(caseWeight(book[id], typical) * 100)),
  );
  const out: Problem[] = [];
  let prev: string | null = null;
  const count = opts.count ?? ROUND_SIZE;
  for (let k = 0; k < count && caseIds.length > 0; k++) {
    const allowed = caseIds.map((id) => caseIds.length === 1 || id !== prev);
    const total = weights.reduce((s, w, i) => s + (allowed[i] ? w : 0), 0);
    let r = nextInt(rng, total);
    let pick = 0;
    for (let i = 0; i < caseIds.length; i++) {
      if (!allowed[i]) continue;
      r -= weights[i] as number;
      if (r < 0) {
        pick = i;
        break;
      }
    }
    const id = caseIds[pick] as string;
    const turn = AUFS[nextInt(rng, 4)] as string;
    const preAuf = opts.auf && familiar(book[id]) ? turn : "";
    out.push({ caseId: id, preAuf, alg: joinAlg(preAuf, opts.algOf(id)) });
    prev = id;
  }
  return out;
}
