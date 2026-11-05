import type { PuzzleState } from "@game/puzzle-core";
import { faceColors, rotatedSolved } from "./state";
import { CUBE_ROTATIONS } from "./topology";

/**
 * 모양 맞추기 판정(대결 「모양 만들기」, docs/47 9-10).
 *
 * 같은 모양으로 보는 것:
 * - 큐브를 통째로 돌린 차이(x·y·z, 24가지).
 * - 큐브를 다르게 쥔 채 같은 공식을 한 차이. 맞춘 큐브를 노란 면이 위로 오게 쥐고 공식을 하면 모양은 같고 색만
 *   「큐브를 돌린 만큼」 바뀐다. 그래서 색을 바꿔 읽는 것도 큐브 돌리기 24가지에서 나오는 것만 받는다
 *   (맞은편 색 짝과 색 차례가 그대로인 것).
 *
 * 같다고 보지 않는 것: 거울에 비친 모양, 아무렇게나 색을 바꾼 모양(예: 흰색과 빨강만 맞바꾼 것).
 */

interface Grip {
  /** 통째로 돌린 뒤 자리 j의 색 = 돌리기 전 자리 `map[j]`의 색 */
  map: Uint16Array;
}

interface Tables {
  grips: Grip[];
  /** 큐브 돌리기에서 나오는 색 바꿔 읽기 24가지(`perm[원래 색] = 바뀐 색`) */
  relabels: Uint8Array[];
  relabelKeys: Set<string>;
}

const cache = new Map<number, Tables>();

function tables(n: number): Tables {
  const hit = cache.get(n);
  if (hit) return hit;
  const nn = n * n;
  const grips: Grip[] = [];
  const relabels: Uint8Array[] = [];
  const relabelKeys = new Set<string>();
  for (const g of CUBE_ROTATIONS) {
    const r = rotatedSolved(n, g);
    grips.push({ map: Uint16Array.from(r.perm) });
    const perm = new Uint8Array(6);
    for (let f = 0; f < 6; f++)
      perm[Math.floor((r.perm[f * nn] as number) / nn)] = f;
    const key = perm.join("");
    if (!relabelKeys.has(key)) {
      relabelKeys.add(key);
      relabels.push(perm);
    }
  }
  const made = { grips, relabels, relabelKeys };
  cache.set(n, made);
  return made;
}

export interface ShapeMatcher {
  /** 목표와 같은 모양인가(위 규칙) */
  matches(state: PuzzleState): boolean;
  /** 목표와 같은 색 칸의 비율(0~1), 쥐는 법·색 바꿔 읽기 가운데 가장 잘 맞는 것 */
  closeness(state: PuzzleState): number;
}

export function shapeMatcher(n: number, target: PuzzleState): ShapeMatcher {
  const want = faceColors(n, target);
  const { grips, relabels, relabelKeys } = tables(n);
  const total = want.length;
  return {
    matches(state) {
      const got = faceColors(n, state);
      const m = new Int8Array(6);
      const used = new Uint8Array(6);
      for (const { map } of grips) {
        m.fill(-1);
        used.fill(0);
        let ok = true;
        for (let j = 0; j < total; j++) {
          const a = got[map[j] as number] as number;
          const b = want[j] as number;
          const had = m[a] as number;
          if (had === -1) {
            if (used[b]) {
              ok = false;
              break;
            }
            m[a] = b;
            used[b] = 1;
          } else if (had !== b) {
            ok = false;
            break;
          }
        }
        if (ok && relabelKeys.has(m.join(""))) return true;
      }
      return false;
    },
    closeness(state) {
      const got = faceColors(n, state);
      const count = new Uint16Array(36);
      let best = 0;
      for (const { map } of grips) {
        count.fill(0);
        for (let j = 0; j < total; j++) {
          const at =
            (got[map[j] as number] as number) * 6 + (want[j] as number);
          count[at] = (count[at] as number) + 1;
        }
        for (const p of relabels) {
          let s = 0;
          for (let c = 0; c < 6; c++)
            s += count[c * 6 + (p[c] as number)] as number;
          if (s > best) best = s;
        }
      }
      return best / total;
    },
  };
}
