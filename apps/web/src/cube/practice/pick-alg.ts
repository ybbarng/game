// 공식 연습의 기본 공식 고르기(docs/47 16-9). 내 공식에서 고른 공식이 있으면 그것, 없으면 자료·후보 가운데
// 지금 키 배치로 키 비용이 가장 싼 공식. 같으면 자료 차례(실물에서 흔한 대표가 먼저)를 따른다.
// 흔한 공식보다 SWITCH_MARGIN 넘게 싸야 바꾼다: 키 하나도 안 줄어드는 차이로 배우기 단원·영상과 다른 공식을 외우게 하지 않는다.
import { candidatesOf } from "../algs/candidates";
import { type AlgBook, knownAlg } from "../algs/store";
import type { Keymap } from "../input/keymaps";
import { keyCost } from "./key-cost";
import type { DrillCase } from "./types";

/** 흔한 공식을 버리고 다른 공식을 고르려면 이만큼(키 하나) 이상 싸야 한다 */
export const SWITCH_MARGIN = 1;

export interface PickedAlg {
  alg: string;
  /** 실물에서 흔한 공식(자료의 첫 공식) */
  common: string;
  why: "mine" | "keys";
}

/** 고를 수 있는 공식: 자료(대표·대안) 다음에 후보 */
export function choicesOf(c: DrillCase): string[] {
  const out = [...c.algs];
  if (c.source)
    for (const x of candidatesOf(c.source))
      if (!out.includes(x.alg)) out.push(x.alg);
  return out;
}

export function pickAlg(
  c: DrillCase,
  keymap: Keymap,
  book: AlgBook = {},
): PickedAlg {
  const common = c.algs[0] as string;
  const use = c.source ? book[c.source.id]?.use : undefined;
  if (c.source && use && knownAlg(book, c.source, use))
    return { alg: use, common, why: "mine" };
  const commonCost = keyCost(common, keymap);
  let best = common;
  let bestCost = commonCost;
  for (const alg of choicesOf(c)) {
    const cost = keyCost(alg, keymap);
    if (cost < bestCost) {
      best = alg;
      bestCost = cost;
    }
  }
  if (commonCost - bestCost < SWITCH_MARGIN) best = common;
  return { alg: best, common, why: "keys" };
}
