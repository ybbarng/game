/**
 * Rust 코어 공통 시험 자료: 단축키 표(F1)의 칸마다 적는 글(사이트 Cubie 미니 표 `KeysPanelPage` = `KeyboardMap` 「모두」).
 * Cubie 네이티브 표(`NativeKeysView`)가 코어 `keys::table`로 같은 글을 그린다. 꼴과 다시 쓰는 법은 `core-fixtures.ts`
 * 머리말과 같다.
 */
import { type Keymap, notationKeymap, twoHandKeymap } from "../input/keymaps";
import {
  ARROWS,
  allLayerLines,
  KEYBOARD_ROWS,
  keyLayers,
  type Layer,
  MODIFIER_LABEL,
} from "../keys/layout";
import { fixtureJson } from "./core-fixtures";
import { layeredKeymap } from "./core-fixtures-keycaps";

/** 줄의 조합 키(자료 꼴: Shift 1·Alt 2) */
const LAYER_MODS: Record<Layer, number> = {
  plain: 0,
  shift: 1,
  alt: 2,
  altShift: 3,
};

export const KEYMAPS: Record<string, () => Keymap> = {
  twoHand: twoHandKeymap,
  notation: notationKeymap,
  custom: layeredKeymap,
};

/** Cubie 표는 Cubie가 쓰지 않는 동작(처음으로·살펴보기)을 뺀다(`KeysPanelPage`) */
export function forCubie(k: Keymap): Keymap {
  return {
    ...k,
    bindings: k.bindings.filter(
      (b) => b.action !== "reset" && b.action !== "inspectionSkip",
    ),
  };
}

/** 칸 하나: [code, [[조합 키, 글, 쓸 수 있나(1/0)], …]]. 화살표 칸은 그냥 칠 때 한 줄(`Arrows`) */
function cells(keymap: Keymap, n: number): unknown[] {
  const out: unknown[] = [];
  for (const row of KEYBOARD_ROWS)
    for (const { code } of row) {
      if (code === "Gap" || code in MODIFIER_LABEL) continue;
      if (code === ARROWS) {
        for (const c of ["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"]) {
          const a = keyLayers(keymap, n, c).plain;
          if (a) out.push([c, [[0, a.label, a.usable ? 1 : 0]]]);
        }
        continue;
      }
      const lines = allLayerLines(keyLayers(keymap, n, code));
      if (lines.length > 0)
        out.push([
          code,
          lines.map(({ key, a }) => [
            LAYER_MODS[key],
            a.label,
            a.usable ? 1 : 0,
          ]),
        ]);
    }
  return out;
}

export function buildKeyTable(): string {
  const cases: unknown[] = [];
  for (const [preset, make] of Object.entries(KEYMAPS))
    for (let n = 2; n <= 7; n++)
      cases.push({ preset, n, cells: cells(forCubie(make()), n) });
  return fixtureJson(
    {
      what: "키 배치(두 손·표기·층 수 키를 든 사용자) × 크기 → 단축키 표 칸마다 적는 줄 [조합 키(Shift 1·Alt 2), 글, 쓸 수 있나]. 사용자 배치는 keycaps.json의 custom",
    },
    cases,
  );
}
