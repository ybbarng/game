/**
 * Rust 코어 공통 시험 자료: 「사용자」 키 배치 편집(Cubie 설정 창, docs/52 5-8 「남은 것」 1). 사이트 설정 화면
 * (`components/CubeSettingsApp.tsx` `KeymapSection`)이 하는 일을 화면 없이 그대로 따라 한다: 키 지정(겹치면 묻고 바꾸기·그만두기),
 * 키 빼기, 비우기, 기본으로 되돌리기, 묶음 고르기, 마우스 돌리기, 가져오기. 걸음마다 저장 글·알림·묻는 글·키 없는 동작·
 * 겹친 키·가져오기 오류를 적는다. 꼴과 다시 쓰는 법은 `core-fixtures.ts` 머리말과 같다. 화면은 이 파일을 부르지 않는다(시험 전용).
 */
import { createRng, nextInt, type RngState } from "@game/mighty-engine";

import { actionLabel, actionsFor } from "../input/actions";
import {
  chordKey,
  chordLabel,
  codeLabel,
  findConflicts,
  type KeyChord,
  type Keymap,
  PRESET_LABEL,
  presetKeymap,
  unbind,
} from "../input/keymaps";
import { exportKeymap, importKeymap, loadKeymap } from "../input/storage";
import {
  assignedText,
  assignKey,
  checkAssign,
  chordFromEvent,
  clearAction,
  conflictQuestion,
  customFrom,
  keylessActions,
  keysOf,
  toCustom,
} from "../keymap-editor";
import { fixtureJson } from "./core-fixtures";

/** 사이트 `saveKeymap`이 저장소에 쓰는 글 */
function stored(km: Keymap): string {
  return JSON.stringify(km.preset === "custom" ? km : { ...km, bindings: [] });
}

/** 저장 글의 FNV-1a 32비트(UTF-8 바이트, 16진 8자리). 걸음마다 글을 통째로 적으면 자료가 커서 */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(text)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const keylessText = (km: Keymap, n: number) => {
  const k = keylessActions(km, n);
  return k.length
    ? `키가 없는 동작: ${k.map(actionLabel).join(", ")}. 「키 지정」으로 놓아 주세요.`
    : "";
};

const conflictsText = (km: Keymap) => {
  const c = findConflicts(km);
  return c.length
    ? `겹친 키: ${c.map((x) => `${x.chord}(${x.actions.join("·")})`).join(", ")}`
    : "";
};

const CODES = [
  "KeyI",
  "KeyJ",
  "KeyK",
  "KeyD",
  "KeyF",
  "KeyQ",
  "KeyZ",
  "Digit3",
  "Semicolon",
  "Comma",
  "Space",
  "Enter",
  "Backspace",
  "ArrowUp",
  "BracketLeft",
  "Backquote",
];

const MODS: [number, KeyChord][] = [
  [0, { code: "" }],
  [1, { code: "", shift: true }],
  [2, { code: "", alt: true }],
  [4, { code: "", ctrl: true }],
  [3, { code: "", shift: true, alt: true }],
  [7, { code: "", shift: true, alt: true, ctrl: true }],
];

const pick = <T>(rng: RngState, list: readonly T[]): T =>
  list[nextInt(rng, list.length)] as T;

/** 키 이름이 섞여도 같은 차례로 놓는지 보는 배치(한 동작에 키 여럿) */
function manyKeys(): Keymap {
  let km: Keymap = customFrom("twoHand");
  const codes = [
    "KeyZ",
    "KeyA",
    "Digit9",
    "Digit1",
    "Semicolon",
    "Slash",
    "Space",
    "ArrowUp",
    "Backquote",
    "BracketLeft",
  ];
  for (const code of codes)
    for (const [, m] of MODS) km = assignKey(km, "R", { ...m, code }).keymap;
  return km;
}

const IMPORTS = [
  "",
  "not json",
  "[]",
  "1",
  '{"version":2,"preset":"custom","bindings":[]}',
  '{"version":1,"preset":"mine","bindings":[]}',
  '{"version":1,"preset":"custom","bindings":[],"mouseRotate":"yes"}',
  '{"version":1,"preset":"twoHand","mouseRotate":true}',
  '{"version":1,"preset":"notation"}',
  '{"version":1,"preset":"custom"}',
  '{"version":1,"preset":"custom","bindings":{}}',
  '{"version":1,"preset":"custom","bindings":[{"code":"KeyI","action":"R"},{"code":"Key-I","action":"R"}]}',
  '{"version":1,"preset":"custom","bindings":[{"code":"KeyI","shift":1,"action":"R"}]}',
  '{"version":1,"preset":"custom","bindings":[{"code":"KeyI","action":"Q"}]}',
  '{"version":1,"preset":"custom","bindings":[{"code":"KeyI","action":5}]}',
  '{"version":1,"preset":"custom","bindings":[{"code":"KeyI","action":null}]}',
  '{"version":1,"preset":"custom","bindings":[{"code":"KeyI"}]}',
  '{"version":1,"preset":"custom","bindings":[{"code":"KeyI","action":["R","U"]}]}',
  '{"version":1,"preset":"custom","bindings":[{"code":"KeyI","action":{}}]}',
  '{"version":1,"preset":"custom","bindings":["KeyI"]}',
  '{"version":1,"preset":"custom","bindings":[{"code":"KeyI","action":"R"},{"code":"KeyI","action":"U"},{"code":"KeyJ","shift":true,"alt":false,"action":"depth:3"},{"code":"KeyJ","shift":true,"action":"layers:L+"}],"mouseRotate":true}',
  ' {"version":1.0,"preset":"custom","bindings":[{"code":"Digit7","ctrl":true,"action":"7Rw2"}]} ',
  '{"version":1,"preset":"custom","bindings":[],}',
  '{"version":1,"version":2,"preset":"custom","bindings":[]}',
  '{"version":1,"preset":"cus\\u0074om","bindings":[{"code":"KeyM","action":"M\'"}]}',
  `{"version":1,"preset":"custom","bindings":[${Array.from({ length: 501 }, () => '{"code":"KeyI","action":"R"}').join(",")}]}`,
];

type Op =
  | ["assign", string, string, number, "yes" | "no" | ""]
  | ["unbind", string]
  | ["clear", string]
  | ["customFrom", "twoHand" | "notation"]
  | ["toCustom"]
  | ["preset", "twoHand" | "notation"]
  | ["mouse", boolean]
  | ["import", string];

/** 대본 하나: 설정 화면에서 누른 차례대로 하고 걸음마다 화면 상태를 적는다 */
function session(seed: number, n: number, start: string | null) {
  const rng = createRng(seed);
  let km: Keymap = loadKeymap(
    start === null ? null : { getItem: () => start, setItem: () => {} },
  );
  let message: string | null = null;
  let importError: string | null = null;
  const steps: unknown[] = [];
  const ops: Op[] = [];
  for (let i = 0; i < 40; i++) {
    const r = nextInt(rng, 100);
    let question: string | null = null;
    let op: Op;
    if (r < 55) {
      const action = pick(rng, actionsFor(n)).id;
      const [mods, m] = pick(rng, MODS);
      const chord = { ...m, code: pick(rng, CODES) };
      // 키 지정 단추를 누르면 알림을 지운다
      message = null;
      const check = checkAssign(km, action, chord);
      let answer: "yes" | "no" | "" = "";
      const apply = () => {
        const res = assignKey(km, action, chord);
        km = res.keymap;
        const rest = res.replaced
          ? keysOf(km, res.replaced).map(chordLabel)
          : [];
        message = assignedText(
          chordLabel(chord),
          actionLabel(action),
          res.replaced ? actionLabel(res.replaced) : null,
          rest,
        );
      };
      if (check.current) {
        question = conflictQuestion(
          chordLabel(chord),
          actionLabel(check.current),
          actionLabel(action),
          check.orphan,
        );
        answer = nextInt(rng, 3) === 0 ? "no" : "yes";
        if (answer === "yes") apply();
      } else apply();
      op = ["assign", action, chord.code, mods, answer];
    } else if (r < 65 && km.bindings.length) {
      const b = pick(rng, km.bindings);
      km = unbind(km, b);
      op = ["unbind", chordKey(b)];
    } else if (r < 72) {
      const a = pick(rng, actionsFor(n)).id;
      km = clearAction(km, a);
      op = ["clear", a];
    } else if (r < 77) {
      const p = pick(rng, ["twoHand", "notation"] as const);
      km = customFrom(p);
      message = `「${PRESET_LABEL[p]}」 배치로 되돌렸어요.`;
      op = ["customFrom", p];
    } else if (r < 81) {
      const p = pick(rng, ["twoHand", "notation"] as const);
      km = presetKeymap(p);
      message = null;
      op = ["preset", p];
    } else if (r < 86) {
      km = toCustom(km);
      op = ["toCustom"];
    } else if (r < 92) {
      const on = nextInt(rng, 2) === 0;
      km = { ...km, mouseRotate: on };
      op = ["mouse", on];
    } else {
      // 키가 너무 많은 글(501개)은 가져오기 사례에만 둔다(자료가 커서)
      const text = pick(rng, IMPORTS.slice(0, -1));
      const res = importKeymap(text);
      if (res.ok) {
        km = res.keymap;
        importError = null;
        message = "배치를 가져왔어요.";
      } else importError = res.error;
      op = ["import", text];
    }
    ops.push(op);
    steps.push([
      fnv(stored(km)),
      message,
      question,
      keylessText(km, n),
      conflictsText(km),
      importError,
    ]);
  }
  return {
    seed,
    n,
    start,
    ops,
    steps,
    stored: stored(km),
    export: fnv(exportKeymap(km)),
  };
}

export function buildKeymapEditor(): string {
  const cases: unknown[] = [];
  for (let n = 2; n <= 7; n++)
    cases.push({
      kind: "actions",
      n,
      actions: actionsFor(n).map((a) => [a.id, a.group, a.label]),
      labels: actionsFor(n).map((a) => actionLabel(a.id)),
      keyless: ["twoHand", "notation"].map((p) =>
        keylessText(presetKeymap(p as "twoHand" | "notation"), n),
      ),
    });
  cases.push({
    kind: "labels",
    codes: [
      ...CODES,
      "KeyA",
      "Digit0",
      "Slash",
      "Period",
      "Quote",
      "BracketRight",
      "Minus",
      "Equal",
      "Backslash",
      "Escape",
      "ArrowLeft",
      "ArrowRight",
      "ArrowDown",
      "F5",
    ].map((code) => [
      code,
      codeLabel(code),
      ...MODS.map(([, m]) => chordLabel({ ...m, code })),
      ...MODS.map(([, m]) => chordKey({ ...m, code })),
    ]),
    events: [
      ["KeyJ", false, false, false, false],
      ["KeyJ", true, true, true, false],
      ["KeyJ", false, false, false, true],
      ["ShiftLeft", true, false, false, false],
      ["MetaRight", false, false, false, true],
      ["CapsLock", false, false, false, false],
      ["Fn", false, false, false, false],
      ["", false, false, false, false],
    ].map(([code, shift, alt, ctrl, meta]) => {
      const c = chordFromEvent({
        code: code as string,
        shiftKey: shift as boolean,
        altKey: alt as boolean,
        ctrlKey: ctrl as boolean,
        metaKey: meta as boolean,
      });
      return [code, shift, alt, ctrl, meta, c ? chordKey(c) : null];
    }),
    order: keysOf(manyKeys(), "R").map(chordKey),
  });
  for (const text of IMPORTS) {
    const r = importKeymap(text);
    cases.push({
      kind: "import",
      text,
      ok: r.ok ? stored(r.keymap) : null,
      export: r.ok ? exportKeymap(r.keymap) : null,
      error: r.ok ? null : r.error,
    });
  }
  const starts: (string | null)[] = [
    null,
    stored(presetKeymap("notation")),
    stored(customFrom("twoHand")),
    "broken",
  ];
  let seed = 1;
  for (const n of [2, 3, 4, 7])
    for (const start of starts)
      cases.push({ kind: "session", ...session(seed++, n, start) });
  return fixtureJson(
    {
      what: "사용자 키 배치 편집: 동작 목록(크기마다 id·묶음·이름, 기본 배치의 키 없는 동작 글), 키 이름·키 누름 → 키, 가져오기(저장 글·내보내기 글·오류), 설정 화면 대본(걸음마다 [저장 글의 FNV-1a, 알림, 묻는 글, 키 없는 동작 글, 겹친 키 글, 가져오기 오류])",
    },
    cases,
  );
}
