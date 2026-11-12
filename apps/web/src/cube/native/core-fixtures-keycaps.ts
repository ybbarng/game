/**
 * Rust 코어 공통 시험 자료: 키 배치에서 수 → 누를 키(`keys/move-keys.ts`의 `keysForMove`·`keycapLabel`, `keys/reach.ts`
 * `routeFor`). 앱 힌트 말풍선의 키캡 줄과 공식 연습 키 비용이 쓴다. 꼴과 다시 쓰는 법은 `core-fixtures.ts` 머리말과 같다.
 */
import { createRng, nextInt } from "@game/mighty-engine";

import {
  bind,
  type Keymap,
  notationKeymap,
  twoHandKeymap,
  unbind,
} from "../input/keymaps";
import { keycapLabel, keysForMove } from "../keys/move-keys";
import { fixtureJson } from "./core-fixtures";

/**
 * 층 수 키를 든 옛 「사용자」 배치: 「두 손」에서 깊이 숫자 2~7을 비우고 층 수 키(1·2 왼손, 9·0 오른손)를 놓았다.
 * 깊이 키가 없으니 큰 큐브의 안쪽 넓은 수는 층 수를 바꾸는 길로만 친다
 */
export function layeredKeymap(): Keymap {
  let k = twoHandKeymap();
  for (let d = 2; d <= 7; d++) {
    k = unbind(k, { code: `Digit${d}` });
    k = unbind(k, { code: `Digit${d}`, shift: true });
  }
  k = bind(k, { code: "Digit1" }, "layers:L-");
  k = bind(k, { code: "Digit2" }, "layers:L+");
  k = bind(k, { code: "Digit9" }, "layers:R-");
  k = bind(k, { code: "Digit0" }, "layers:R+");
  // 조합 키 동작 하나(키캡 글의 Alt+·Ctrl+)
  k = bind(k, { code: "KeyQ", alt: true }, "S");
  k = bind(k, { code: "KeyP", ctrl: true }, "E'");
  return k;
}

const KEYMAPS: Record<string, () => Keymap> = {
  twoHand: twoHandKeymap,
  notation: notationKeymap,
  custom: layeredKeymap,
};

/** 공식 글에 나올 수 있는 수(소문자 넓게, R2', 깊이, 여러 층, 가운데 층, 큐브 돌리기, 쓸 수 없는 수) */
function vocabulary(n: number): string[] {
  const out: string[] = [];
  for (const f of ["R", "L", "U", "D", "F", "B"]) {
    for (const a of ["", "'", "2", "2'"]) out.push(`${f}${a}`, `${f}w${a}`);
    for (const a of ["", "'", "2"]) out.push(`${f.toLowerCase()}${a}`);
    for (let k = 2; k <= Math.min(n, 4); k++)
      out.push(`${k}${f}`, `${k}${f}'`, `${k}${f}w`, `${k}${f}w2`);
  }
  for (const s of ["M", "E", "S"]) out.push(s, `${s}'`, `${s}2`);
  for (const r of ["x", "y", "z"]) out.push(r, `${r}'`, `${r}2`);
  out.push("2-3Rw", "Q", "");
  return out;
}

export function buildKeycaps(): string {
  const rng = createRng(1112);
  const cases: unknown[] = [];
  for (const [preset, make] of Object.entries(KEYMAPS)) {
    const km = make();
    for (let n = 2; n <= 7; n++) {
      const vocab = vocabulary(n);
      // 크기마다 전부 넣으면 커서, 3×3·4×4·7×7은 전부, 나머지는 무작위 반
      const all = n === 3 || n === 4 || n === 7;
      const tokens = all ? vocab : vocab.filter(() => nextInt(rng, 2) === 0);
      cases.push({
        preset,
        n,
        keys: tokens.map((t) => {
          const k = keysForMove(km, n, t);
          return [t, k ? k.map(keycapLabel).join(" ") : null];
        }),
      });
    }
  }
  return fixtureJson(
    {
      what: "키 배치(두 손·표기·층 수 키를 든 사용자) × 크기 × 공식 글의 수 → 키캡 줄(keysForMove + keycapLabel, 처음 층 수). null은 키 없음",
      custom: layeredKeymap().bindings.map((b) => [
        b.code,
        (b.shift ? 1 : 0) | (b.alt ? 2 : 0) | (b.ctrl ? 4 : 0),
        b.action,
      ]),
    },
    cases,
  );
}
