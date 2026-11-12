/**
 * Rust 큐브 코어(`native/cube-core`, docs/52 5절 2단계)와 사이트 엔진이 같은 결과를 내는지 보는 공통 시험 자료를 만든다.
 * 사이트 엔진이 기준이다: 여기서 사이트 코드로 계산한 값을 `native/cube-core/fixtures/*.json`에 적고, Rust 시험
 * (`cargo test`)이 같은 파일을 읽어 코어의 결과와 견준다. 사이트 시험(`core-fixtures-*.test.ts`)은 지금 사이트 코드로
 * 다시 계산한 값이 파일과 같은지 본다. 그래서 사이트 엔진을 바꿔 결과가 달라지면 사이트 시험이 깨지고, 자료를 다시
 * 쓰면(아래) Rust 시험이 코어도 고치라고 깨진다.
 *
 * 다시 쓰기: `CUBE_CORE_FIXTURES=write pnpm vitest run apps/web/src/cube/native/`
 * (Rust 코어가 쓰는 공식 상황·티어 표 `native/cube-core/src/data.rs`도 같이 쓴다)
 *
 * 화면은 이 파일을 부르지 않는다(시험 전용).
 */
import {
  applyMoves,
  faceColors,
  formatMoves,
  isSolved,
  NotationError,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { SCRAMBLE_EVENTS, scramble } from "@game/cube-scramble";
import { createRng, nextInt, type RngState } from "@game/mighty-engine";

import { spotCase, spotHold } from "../algs/spot";
import { KeyInterpreter, type KeyResult } from "../input/interpreter";
import {
  type KeyChord,
  type KeyInput,
  type Keymap,
  notationKeymap,
  twoHandKeymap,
} from "../input/keymaps";
import { ALG_SETS } from "../learn/alg-sets";
import { goalMet } from "../learn/judge";
import type { AlgCase, AlgSet } from "../learn/types";
import { pickHint } from "../mini/hint-pick";
import {
  formatReplay,
  formatSplits,
  parseReplay,
  parseSplits,
} from "../records";
import { replayLength, solveSteps } from "../replay-player";
import { ao5, bestAo5, myTier, tierName, tierOf } from "../tiers/rank";
import { TIER_SIZES, TIER_TABLE } from "../tiers/table";
import {
  buildHint,
  buildRustHumanData,
  buildSession,
} from "./core-fixtures-human";
import { buildKeycaps } from "./core-fixtures-keycaps";
import { buildKeyTable } from "./core-fixtures-keytable";
import { buildPractice, buildRustPracticeData } from "./core-fixtures-practice";
import { buildKeyPaint, buildMask } from "./core-fixtures-screen";

/** 자료 파일 이름 → 내용(JSON 글) */
export type FixtureFiles = Record<string, string>;

const casesOf = (set: AlgSet): AlgCase[] =>
  ALG_SETS.find((s) => s.set === set)?.cases ?? [];

export const OLL = casesOf("oll");
export const PLL = casesOf("pll");
/** Cubie 「공식 보기」가 보는 2단계 OLL·PLL(사이트 `hint-pick.ts`의 TWO_LOOK과 같은 차례) */
export const TWO_LOOK = ALG_SETS.filter(
  (s) => s.set === "2look-oll" || s.set === "2look-pll",
).flatMap((s) => s.cases);

/** 한 줄에 사례 하나: 자료가 바뀌면 diff가 그 사례만 보이게 */
export function fixtureJson(meta: Record<string, unknown>, cases: unknown[]) {
  const head = JSON.stringify(meta).slice(0, -1);
  const sep = head === "{" ? "" : ",";
  return `${head}${sep}"cases":[\n${cases.map((c) => JSON.stringify(c)).join(",\n")}\n]}\n`;
}

const pick = <T>(rng: RngState, list: readonly T[]): T =>
  list[nextInt(rng, list.length)] as T;

// ── 섞기 ────────────────────────────────────────────────

/** 종목마다 씨앗 몇 개(3×3 해법이 무거워 3×3은 적게) */
const SCRAMBLE_COUNT: Record<string, number> = {
  "222": 12,
  "333": 10,
  "333bf": 6,
  "444": 6,
  "555": 4,
  "666": 3,
  "777": 3,
};

export function scrambleSeeds(event: string): number[] {
  const rng = createRng(0x5c4a3b1e ^ event.length);
  const fixed = [0, 1, 42, 4294967295];
  const out = [...fixed];
  while (out.length < (SCRAMBLE_COUNT[event] ?? 0) + fixed.length)
    out.push(nextInt(rng, 4294967296));
  return out;
}

export function buildScramble(): string {
  const cases = SCRAMBLE_EVENTS.flatMap((event) =>
    scrambleSeeds(event).map((seed) => {
      const s = scramble(event, seed);
      return { event, seed, text: s.text, official: s.official };
    }),
  );
  return fixtureJson({ what: "씨앗 → 섞기 글(packages/cube-scramble)" }, cases);
}

// ── 표기와 상태 ──────────────────────────────────────────

function vocabulary(n: number): string[] {
  const out: string[] = [];
  const amounts = ["", "'", "2", "2'", "’", "3", "1"];
  for (const f of ["U", "R", "F", "D", "L", "B"]) {
    for (const a of amounts) out.push(`${f}${a}`, `${f}w${a}`);
    out.push(`${f.toLowerCase()}`, `${f.toLowerCase()}'`);
    for (let k = 2; k <= n; k++) out.push(`${k}${f}`, `${k}${f}w2`);
    if (n >= 4) out.push(`2-3${f}w`, `2-3${f}'`, `3${f.toLowerCase()}`);
  }
  for (const r of ["x", "y", "z"]) out.push(r, `${r}'`, `${r}2`);
  if (n % 2 === 1)
    for (const s of ["M", "E", "S"]) out.push(s, `${s}'`, `${s}2`);
  return out;
}

const HAND_ALGS: [number, string][] = [
  [3, ""],
  [3, "R U R' U'"],
  [3, "(R U R' U') (R' F R2 U' R' U' R U R' F')"],
  [3, "M2 U M2 U2 M2 U M2"],
  [3, "x y z x' y' z'"],
  [3, "R’ U’ F’ r u f"],
  [3, "R3 U1 F2'"],
  [2, "R U2 R' F2 x2"],
  [4, "Rw 3Rw' 2R 2-3Rw r 3r x"],
  [5, "M E S 2R 3R 2-4Rw 3Uw'"],
  [6, "3Rw 4R 2-5Fw' 6L x2"],
  [7, "4Rw 3-5Uw2 M E' S2 7R"],
];

const BAD_ALGS: [number, string][] = [
  [4, "R M"],
  [3, "R Q"],
  [3, "2x"],
  [3, "Mw"],
  [3, "rw"],
  [3, "R4"],
  [3, "0R"],
  [4, "5R"],
  [5, "3-2Rw"],
  [3, "R'2"],
  [3, "R  ’U"],
  [7, "(R U) 8Rw"],
];

function stateCase(n: number, alg: string) {
  try {
    const moves = parseMoves(n, alg);
    const s = applyMoves(n, solvedCube(n), moves);
    return {
      n,
      alg,
      formatted: formatMoves(n, moves),
      colors: Array.from(faceColors(n, s)).join(""),
      perm: Array.from(s.perm),
      twist: Array.from(s.twist).join(""),
      solved: isSolved(n, s),
      solvedOriented: isSolved(n, s, { orientCenters: true }),
    };
  } catch (e) {
    if (!(e instanceof NotationError)) throw e;
    return { n, alg, error: { index: e.index, message: e.message } };
  }
}

export function buildMoves(): string {
  const rng = createRng(20261111);
  const cases: unknown[] = [];
  for (const [n, alg] of HAND_ALGS) cases.push(stateCase(n, alg));
  for (let n = 2; n <= 7; n++) {
    const vocab = vocabulary(n);
    for (let k = 0; k < 6; k++) {
      const len = 1 + nextInt(rng, n <= 3 ? 30 : 12);
      const tokens = Array.from({ length: len }, () => pick(rng, vocab));
      cases.push(stateCase(n, tokens.join(" ")));
    }
  }
  for (const [n, alg] of BAD_ALGS) cases.push(stateCase(n, alg));
  return fixtureJson(
    {
      what: "표기 → 수 목록 다시 쓰기·상태(perm: 자리마다 스티커 번호, twist: 스티커 방향, colors: 자리마다 색)·맞춤 판정. error는 표기 잘못(위치는 UTF-16 단위)",
    },
    cases,
  );
}

// ── OLL·PLL 알아보기 ────────────────────────────────────

const HOLD_ROTS = ["", "y", "y2", "y'", "x2", "z", "x' y"];
const AUFS = ["", "U", "U2", "U'"];

function invert(n: number, alg: string): string {
  return formatMoves(
    n,
    parseMoves(n, alg)
      .toReversed()
      .map((m) => ({ ...m, turns: (4 - m.turns) as 1 | 2 | 3 })),
  );
}

/** 상황 공식의 거꾸로로 만든 마지막 층 상태들(흰 면 아래 z2, 무작위 쥐기·윗면 돌리기) */
function spotSetups(): string[] {
  const rng = createRng(7);
  const setup = (algs: string[]) =>
    [
      "z2",
      pick(rng, AUFS),
      ...algs.map((a) => `${invert(3, a)} ${pick(rng, AUFS)}`),
      pick(rng, HOLD_ROTS),
    ]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  const out: string[] = ["", "z2", "z2 U", "z2 U2", "x y2 U'"];
  for (const c of [...OLL, ...PLL, ...TWO_LOOK])
    out.push(setup([c.algs[0] as string]));
  for (let k = 0; k < 8; k++)
    out.push(
      setup([pick(rng, OLL).algs[0], pick(rng, PLL).algs[0]] as string[]),
    );
  // F2L 전(십자부터 깨짐)
  for (const seed of [3, 4, 5]) out.push(scramble("333", seed).text);
  // F2L 짝 하나만 빠짐
  out.push("z2 R U R' U'", "z2 F R U R' U' F' R U R'");
  return out;
}

function spotEntry(alg: string) {
  const s = applyMoves(3, solvedCube(3), parseMoves(3, alg));
  const f2l = goalMet(3, s, "f2l");
  const hold = spotHold(s, TWO_LOOK);
  const hint = f2l ? pickHint(3, s) : null;
  return {
    alg,
    f2l,
    oll: spotCase(3, s, OLL)?.id ?? null,
    pll: spotCase(3, s, PLL)?.id ?? null,
    twoLook: hold ? { id: hold.c.id, rot: hold.rot, pre: hold.pre } : null,
    hint:
      hint === null
        ? null
        : hint.kind === "hint"
          ? {
              stage: hint.hint.stage,
              name: hint.hint.name ?? null,
              before: hint.hint.before,
              alg: hint.hint.alg,
            }
          : { kind: hint.kind },
  };
}

export function buildSpot(): string {
  return fixtureJson(
    {
      what: "3×3 맞춘 큐브에 alg를 둔 상태 → F2L 끝남, OLL·PLL 상황(첫 번째), 2단계 상황과 쥐는 법, Cubie 공식 보기(F2L 뒤만)",
    },
    spotSetups().map(spotEntry),
  );
}

// ── 티어 ────────────────────────────────────────────────

interface Rec {
  ms: number | null;
  penalty: number;
  hints?: number;
}

function randomRecord(rng: RngState, base: number): Rec {
  const r = nextInt(rng, 100);
  if (r < 6) return { ms: null, penalty: 0 };
  const ms = Math.round(
    base * (0.6 + nextFloatish(rng)) * 1000 + nextInt(rng, 10),
  );
  return {
    ms,
    penalty: r < 14 ? 2000 : 0,
    ...(r >= 96 ? { hints: 1 } : {}),
  };
}

const nextFloatish = (rng: RngState) => nextInt(rng, 1_000_000) / 1_000_000;

export function buildTier(): string {
  const rng = createRng(1209);
  const cases: unknown[] = [];
  // 경계: 반올림·10분·DNF
  const edge: Rec[][] = [
    [
      { ms: 10_005, penalty: 0 },
      { ms: 10_015, penalty: 0 },
      { ms: 10_025, penalty: 0 },
      { ms: 9_000, penalty: 0 },
      { ms: 12_000, penalty: 0 },
    ],
    [
      { ms: 599_999, penalty: 2000 },
      { ms: 600_500, penalty: 0 },
      { ms: 601_999, penalty: 0 },
      { ms: 700_000, penalty: 0 },
      { ms: 500_000, penalty: 0 },
    ],
    [
      { ms: null, penalty: 0 },
      { ms: 30_000, penalty: 0 },
      { ms: 31_234, penalty: 2000 },
      { ms: 29_999, penalty: 0 },
      { ms: 33_333, penalty: 0 },
    ],
    [
      { ms: null, penalty: 0 },
      { ms: null, penalty: 0 },
      { ms: 30_000, penalty: 0 },
      { ms: 31_000, penalty: 0 },
      { ms: 32_000, penalty: 0 },
    ],
    [
      { ms: 10_001, penalty: 0 },
      { ms: 10_002, penalty: 0 },
      { ms: 10_013, penalty: 0 },
      { ms: 5_000, penalty: 0 },
      { ms: 20_000, penalty: 0 },
    ],
  ];
  for (const five of edge) cases.push({ kind: "ao5", five, ao5: ao5(five) });

  for (const n of TIER_SIZES) {
    const base = [2, 3, 4, 5, 6, 7].indexOf(n) * 40 + 8;
    for (let k = 0; k < 3; k++) {
      const count = nextInt(rng, 14);
      const records = Array.from({ length: count }, () =>
        randomRecord(rng, base * (1 + k)),
      );
      const bestFive =
        k === 2
          ? Array.from({ length: 5 }, () => randomRecord(rng, base * 0.8))
          : [];
      const best = bestAo5(records);
      const mine = myTier(n, records, bestFive);
      cases.push({
        kind: "tier",
        n,
        records,
        bestFive,
        best,
        my: mine
          ? {
              ao5: mine.ao5,
              tier: mine.place.tier,
              division: mine.place.division,
              step: mine.place.step,
              name: tierName(mine.place),
            }
          : null,
      });
    }
    // 표의 경계마다(딱 경계, 10ms 넘음)
    for (const row of TIER_TABLE[n] ?? []) {
      for (const cut of row.cuts) {
        if (!Number.isFinite(cut)) continue;
        for (const ms of [
          Math.round(cut * 1000),
          Math.round(cut * 1000) + 10,
        ]) {
          const p = tierOf(n, ms);
          cases.push({
            kind: "tierOf",
            n,
            ms,
            place: p
              ? {
                  tier: p.tier,
                  division: p.division,
                  step: p.step,
                  name: tierName(p),
                }
              : null,
          });
        }
      }
    }
  }
  return fixtureJson(
    {
      what: "기록(새것이 앞, ms null = DNF, penalty 2000 = +2, hints = 공식 보기) → Ao5·최고 Ao5·티어",
    },
    cases,
  );
}

// ── 다시 보기·구간 기록 ──────────────────────────────────

const REPLAYS: [number, string][] = [
  [3, "R@120 U'@380 R'@2000 U@2100"],
  [3, ""],
  [3, "R@0 junk Q@50 U@x F@ B@1e3 L@0x20 D@-5 M@12.7 (R@40"],
  [4, "Rw@10 3Rw2@20 2R'@3000 M@3100 x@3200 r@3300"],
  [3, "R@100 R@100 R@90 R@5000"],
  [7, "3Uw@1 4R@2 S@3 Infinity@4 R@Infinity R@NaN"],
];

export function buildReplay(): string {
  const cases: unknown[] = REPLAYS.map(([n, text]) => {
    const parsed = parseReplay(text);
    return {
      kind: "replay",
      n,
      text,
      parsed,
      formatted: formatReplay(parsed.map(([notation, t]) => ({ notation, t }))),
      length: replayLength(text),
      steps: solveSteps(n, text).map((s) => ({
        at: s.at,
        moves: formatMoves(n, s.moves),
      })),
    };
  });
  for (const text of [
    "cross@3210 f2l1@8020",
    "cross@1 cross@2 F2L@3 bad oll@4.5 pll@07",
    "",
  ]) {
    const parsed = parseSplits(text);
    cases.push({
      kind: "splits",
      text,
      parsed,
      formatted: formatSplits(parsed),
    });
  }
  cases.push({
    kind: "format",
    events: [
      ["R", 120.4],
      ["U'", 380.5],
      ["x", 0],
    ],
    formatted: formatReplay([
      { notation: "R", t: 120.4 },
      { notation: "U'", t: 380.5 },
      { notation: "x", t: 0 },
    ]),
  });
  return fixtureJson(
    {
      what: "다시 보기 글·구간 기록 글 읽기·쓰기, 다시 보기 걸음(멈춤 1초까지)",
    },
    cases,
  );
}

// ── Rust 코어의 자료(공식 상황·티어 표) ──────────────────

function rustStr(s: string): string {
  const out = JSON.stringify(s);
  if (/\\u/.test(out)) throw new Error(`Rust 글로 옮기지 못하는 글자: ${s}`);
  return out;
}

const RUST_SET: Record<string, string> = {
  oll: "Oll",
  pll: "Pll",
  "2look-oll": "TwoLookOll",
  "2look-pll": "TwoLookPll",
};

function rustCases(name: string, cases: AlgCase[]): string {
  const rows = cases.map(
    (c) =>
      `    AlgCase { id: ${rustStr(c.id)}, set: AlgSet::${RUST_SET[c.set]}, group: ${
        c.group ? `Some(${rustStr(c.group)})` : "None"
      }, name: ${rustStr(c.name)}, alg: ${rustStr(c.algs[0] as string)} },`,
  );
  return `pub const ${name}: &[AlgCase] = &[\n${rows.join("\n")}\n];\n`;
}

const rustNum = (v: number) =>
  Number.isFinite(v)
    ? Number.isInteger(v)
      ? `${v}.0`
      : `${v}`
    : "f64::INFINITY";

export function buildRustData(): string {
  const tiers = TIER_SIZES.map((n) => {
    const rows = (TIER_TABLE[n] ?? []).map(
      (r) => `&[${r.cuts.map(rustNum).join(", ")}]`,
    );
    return `    (${n}, &[${rows.join(", ")}]),`;
  });
  return [
    "// 사이트 자료에서 만든 파일이다. 손으로 고치지 않는다.",
    "// 다시 만들기: CUBE_CORE_FIXTURES=write pnpm vitest run apps/web/src/cube/native/",
    "// 원본: apps/web/src/cube/learn/algs-*.ts(공식 상황), apps/web/src/cube/tiers/table.ts(티어 표)",
    "",
    "use crate::spot::{AlgCase, AlgSet};",
    "",
    "/// OLL 57(사이트 「OLL(57)」 묶음 차례)",
    rustCases("OLL_CASES", OLL),
    "/// PLL 21",
    rustCases("PLL_CASES", PLL),
    "/// 2단계 OLL·PLL(Cubie 공식 보기가 보는 차례)",
    rustCases("TWO_LOOK_CASES", TWO_LOOK),
    "/// 크기 → 티어 열 개(아이언부터)의 구간 상한(초, 이하). 구간이 있으면 IV·III·II·I 넷",
    "pub const TIER_TABLE: &[(usize, &[&[f64]])] = &[",
    ...tiers,
    "];",
    "",
  ].join("\n");
}

// ── 키 배치 해석기(docs/52 5-2) ─────────────────────────

type Preset = "twoHand" | "notation";

const KEY_PRESETS: Record<Preset, () => Keymap> = {
  twoHand: twoHandKeymap,
  notation: notationKeymap,
};

/** 자료의 키 누름 하나(거짓인 조합 키는 적지 않는다) */
type KeyStep = Partial<KeyInput> & { code: string };

const keyInput = (k: KeyStep): KeyInput => ({
  code: k.code,
  shiftKey: !!k.shiftKey,
  altKey: !!k.altKey,
  ctrlKey: !!k.ctrlKey,
  metaKey: !!k.metaKey,
  repeat: !!k.repeat,
});

const chordStep = (b: KeyChord): KeyStep => ({
  code: b.code,
  ...(b.shift ? { shiftKey: true } : {}),
  ...(b.alt ? { altKey: true } : {}),
  ...(b.ctrl ? { ctrlKey: true } : {}),
});

/** 배치에 없는 누름·⌘ 조합도 섞는다(⌘Z만 되돌리기, 나머지는 키를 먹지 않아야 한다) */
const STRAY_KEYS: KeyStep[] = [
  { code: "KeyQ", altKey: true },
  { code: "Digit3", shiftKey: true },
  { code: "KeyZ", metaKey: true },
  { code: "KeyZ", metaKey: true, shiftKey: true },
  { code: "KeyI", metaKey: true },
  { code: "KeyZ", ctrlKey: true },
  { code: "Tab" },
  { code: "F1" },
];

function keyResult(r: KeyResult | null) {
  if (r === null || r.kind !== "move") return r;
  const { axis, from, to, turns } = r.move;
  return { ...r, move: { axis, from, to, turns } };
}

function keyCase(preset: Preset, n: number, keys: KeyStep[]) {
  const it = new KeyInterpreter(n, KEY_PRESETS[preset]());
  const results = keys.map((k) => keyResult(it.handle(keyInput(k))));
  return { preset, n, keys, results };
}

/** 손으로 고른 차례: 층 수·깊이·가운데 줄 키, 명령이 층 수·깊이를 되돌리는지, 크기에 없는 동작 */
const HAND_KEYS: [Preset, number, string[]][] = [
  [
    "twoHand",
    3,
    "KeyI KeyK KeyT KeyB KeyX Period Digit2 KeyI Digit2 KeyJ Digit2 KeyH Digit3 KeyI Digit1 Digit9 KeyU KeyY KeyN Semicolon".split(
      " ",
    ),
  ],
  [
    "twoHand",
    4,
    "Digit2 KeyI KeyU Period Digit2 KeyK Digit3 KeyU Digit3 Enter KeyI KeyT KeyB KeyD KeyV Digit2 KeyF Digit3 Escape KeyI".split(
      " ",
    ),
  ],
  [
    "twoHand",
    5,
    "Digit3 KeyI Digit3 KeyU Digit3 KeyJ KeyB KeyT KeyX Backspace Digit4 Space KeyX".split(
      " ",
    ),
  ],
  [
    "twoHand",
    7,
    "Digit3 KeyI Digit4 KeyT KeyB Digit7 KeyI Digit5 KeyW Digit6 KeyO".split(
      " ",
    ),
  ],
  ["twoHand", 2, "KeyI KeyU Digit2 KeyI Digit7 KeyT Enter".split(" ")],
  [
    "notation",
    3,
    "Digit2 KeyR Digit3 KeyR Digit4 KeyR Digit2 KeyM KeyR KeyM KeyX".split(" "),
  ],
  [
    "notation",
    5,
    "Digit3 KeyR Digit3 Enter KeyR Digit7 KeyR Digit5 KeyU Digit2 KeyX".split(
      " ",
    ),
  ],
  ["notation", 7, "Digit7 KeyF Digit6 KeyB Digit4 KeyM".split(" ")],
  ["notation", 2, "Digit2 KeyR KeyM KeyR".split(" ")],
];

/** 손으로 고른 조합 키 차례(Shift 넓게, 되풀이 누름, ⌘Z, Alt 넓게) */
const HAND_MODS: [Preset, number, KeyStep[]][] = [
  [
    "twoHand",
    4,
    [
      { code: "KeyI", shiftKey: true },
      { code: "Digit3" },
      { code: "KeyI", shiftKey: true },
      { code: "Digit3", shiftKey: true },
      { code: "KeyK", shiftKey: true },
      { code: "Digit2" },
      { code: "KeyH", shiftKey: true },
      { code: "KeyJ", shiftKey: true },
      { code: "KeyI", repeat: true },
      { code: "KeyZ", metaKey: true },
      { code: "KeyZ", ctrlKey: true },
    ],
  ],
  [
    "notation",
    4,
    [
      { code: "Digit3" },
      { code: "KeyR", altKey: true },
      { code: "KeyR", altKey: true, shiftKey: true },
      { code: "Digit3" },
      { code: "KeyR", shiftKey: true },
      { code: "Digit3" },
      { code: "KeyX" },
      { code: "KeyR" },
      { code: "KeyM" },
    ],
  ],
];

export function buildKeys(): string {
  const rng = createRng(20261112);
  const cases: unknown[] = [];
  for (const [preset, n, codes] of HAND_KEYS)
    cases.push(
      keyCase(
        preset,
        n,
        codes.map((code) => ({ code })),
      ),
    );
  for (const [preset, n, keys] of HAND_MODS)
    cases.push(keyCase(preset, n, keys));
  for (const preset of Object.keys(KEY_PRESETS) as Preset[]) {
    const chords = KEY_PRESETS[preset]().bindings.map(chordStep);
    for (let n = 2; n <= 7; n++) {
      for (let k = 0; k < 3; k++) {
        const keys = Array.from({ length: 40 }, (): KeyStep => {
          const r = nextInt(rng, 100);
          if (r < 6) return pick(rng, STRAY_KEYS);
          if (r < 9) return { ...pick(rng, chords), repeat: true };
          return pick(rng, chords);
        });
        cases.push(keyCase(preset, n, keys));
      }
    }
  }
  return fixtureJson(
    {
      what: "키 배치(두 손·표기)와 해석기: 키 누름 차례 → 수(가장 짧은 이름과 계약의 수)·깊이·층 수·명령. 키를 먹지 않으면 null",
    },
    cases,
  );
}

/** Rust 코어의 배치 자료: 배치가 바뀌면 자료만 다시 쓰면 된다 */
export function buildRustKeymaps(): string {
  const rows = (preset: Preset) =>
    KEY_PRESETS[preset]()
      .bindings.map(
        (b) =>
          `    (${rustStr(b.code)}, ${(b.shift ? 1 : 0) | (b.alt ? 2 : 0) | (b.ctrl ? 4 : 0)}, ${rustStr(b.action)}),`,
      )
      .join("\n");
  return [
    "// 사이트 자료에서 만든 파일이다. 손으로 고치지 않는다.",
    "// 다시 만들기: CUBE_CORE_FIXTURES=write pnpm vitest run apps/web/src/cube/native/",
    "// 원본: apps/web/src/cube/input/keymaps.ts(twoHandKeymap·notationKeymap)",
    "",
    "/// 「두 손」 배치: (KeyboardEvent.code, 조합 키(1 Shift·2 Alt·4 Ctrl을 더한 값), 동작 이름). 사이트와 같은 차례",
    "pub const TWO_HAND: &[(&str, u8, &str)] = &[",
    rows("twoHand"),
    "];",
    "",
    "/// 「표기」 배치(같은 꼴)",
    "pub const NOTATION: &[(&str, u8, &str)] = &[",
    rows("notation"),
    "];",
    "",
  ].join("\n");
}

/** 자료 파일 전부(파일 이름 → 내용) */
export const BUILDERS = {
  "fixtures/scramble.json": buildScramble,
  "fixtures/moves.json": buildMoves,
  "fixtures/spot.json": buildSpot,
  "fixtures/tier.json": buildTier,
  "fixtures/replay.json": buildReplay,
  "fixtures/keys.json": buildKeys,
  "fixtures/session.json": buildSession,
  "fixtures/hint.json": buildHint,
  "fixtures/practice.json": buildPractice,
  "fixtures/keycaps.json": buildKeycaps,
  "fixtures/keytable.json": buildKeyTable,
  "fixtures/mask.json": buildMask,
  "fixtures/keypaint.json": buildKeyPaint,
  "src/data.rs": buildRustData,
  "src/keymap_data.rs": buildRustKeymaps,
  "src/human_data.rs": buildRustHumanData,
  "src/practice_data.rs": buildRustPracticeData,
} as const;
