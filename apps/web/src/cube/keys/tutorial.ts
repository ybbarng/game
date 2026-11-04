import {
  applyMove,
  type CubeMove,
  faceColors,
  invertMove,
  isRotation,
  isSolved,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { COMMAND_LABEL, type Command } from "../input/actions";
import {
  chordsFor,
  codeLabel,
  type Keymap,
  PRESET_LABEL,
} from "../input/keymaps";
import { handOf, keyLayers } from "./layout";
import { keysForMove } from "./move-keys";
import { keyTextFor, MoveMatcher } from "./reach";
import { TWO_HAND_RULE, TWO_HAND_RULES } from "./two-hand";

/**
 * 키 익히기 튜토리얼(`/cube/keys/learn`, docs/47 4-4절). 지금 배치를 읽어 단계마다 설명과 칠 것을 만든다.
 * 키 이름은 문장에 그대로 적지 않고 배치에서 읽으므로 「두 손」·「표기」·「사용자」 모두 같은 단계가 나온다.
 * 배치에 없는 수는 그 단계에서 빼고 `missing`에 남긴다(설정에서 놓으라고 알린다).
 *
 * 차례(2026-11-04): 쉬운 것에서 어려운 것으로. 손 자리 → 큐브 둘러보기(x·y·z, 목표 모양) → 한 면씩(R → 되돌리기 →
 * L·U·F·D·B, 돌리고 되돌려 맞추기) → 섞고 풀기(나중 것부터 거꾸로) → 반 바퀴 → 넓게·가운데 층 → 짧은 공식.
 */

/** 색 번호(맞춘 상태의 면 번호, U R F D L B 차례): 흰·빨강·초록·노랑·주황·파랑 */
export type ColorId = 0 | 1 | 2 | 3 | 4 | 5;

/** 대회 표준 색 이름(FACES 차례). 사용자 색을 바꿨어도 글은 이 이름을 쓰고 그림은 실제 색으로 그린다 */
export const COLOR_NAME = [
  "흰",
  "빨강",
  "초록",
  "노랑",
  "주황",
  "파랑",
] as const;

export type TutorialTarget =
  | { kind: "code"; code: string }
  /**
   * 수 하나. `ask`가 있으면 맞히기: 키 그림의 글을 가리고 키를 알려 주지 않는다. `ask`는 실물에서 그 수를 하는 손가락
   * (「왼 손목을 아래에서 위로」), 규칙으로 키를 떠올리게 한다
   */
  | { kind: "move"; notation: string; ask?: string }
  | { kind: "command"; command: Command }
  /** 큐브 전체를 돌려 이 색 면을 위·앞으로(적은 쪽만 본다) */
  | { kind: "orient"; up?: ColorId; front?: ColorId }
  /** 섞인 큐브를 스스로 맞추기(어느 쪽을 보든 면마다 한 색) */
  | { kind: "solve" };

export interface StepHand {
  /** 「오른손」·「왼손」·「두 손」 */
  label: string;
  /** 그 손으로 치는 수(표기). 화면이 사용자 배치 키캡을 붙인다 */
  moves: string[];
}

export interface TutorialStep {
  id: string;
  title: string;
  lines: string[];
  targets: TutorialTarget[];
  /** 이 배치에 키가 없어 뺀 것 */
  missing: string[];
  /** 한 면 단계: 어느 손으로 치는지 */
  hand?: StepHand;
}

/** 튜토리얼 큐브 크기 */
export const TUTORIAL_N = 3;

/** 단계 id 차례. 저장된 진도를 옮길 때도 쓴다 */
export const TUTORIAL_IDS = [
  "home",
  "rotate",
  "rule",
  "face-R",
  "commands",
  "face-L",
  "face-U",
  "face-F",
  "face-D",
  "face-B",
  "unwind",
  "double",
  "layer",
  "formula",
] as const;

/** 2026-11-04 전 단계 id(손 자리 → R·R'·U → L·L'·U' → F·D·B → x·y·z → M·Rw → 되돌리기·섞기 → 공식) */
const OLD_IDS = [
  "home",
  "right",
  "left",
  "fdb",
  "rotate",
  "layer",
  "commands",
  "formula",
];

/**
 * 저장된 진도(마친 단계 id)를 지금 단계로 옮긴다. 옛 단계를 모두 마친 사람은 모두 마친 것으로, 옛 「R·R'·U」는
 * 오른쪽 면, 「L·L'·U'」은 왼쪽 면(둘 다 마쳤으면 윗면도), 「F·D·B」는 앞·아래·뒷면으로 본다. 모르는 id는 버린다.
 */
export function migrateLearnDone(done: readonly string[]): string[] {
  const has = new Set(done);
  if (OLD_IDS.every((id) => has.has(id))) return [...TUTORIAL_IDS];
  const out = new Set<string>();
  for (const id of done)
    if ((TUTORIAL_IDS as readonly string[]).includes(id)) out.add(id);
  if (has.has("right")) out.add("face-R");
  if (has.has("left")) out.add("face-L");
  if (has.has("right") && has.has("left")) out.add("face-U");
  if (has.has("fdb")) for (const f of ["F", "D", "B"]) out.add(`face-${f}`);
  return TUTORIAL_IDS.filter((id) => out.has(id));
}

const SEXY = ["R", "U", "R'", "U'"];
const SUNE = ["R", "U", "R'", "U", "R", "U2", "R'"];

const FACE_INFO: Record<string, { name: string; note: string }> = {
  R: { name: "오른쪽 면", note: "실물에서는 오른 손목으로 돌려요." },
  L: {
    name: "왼쪽 면",
    note: "왼쪽 면은 왼쪽에서 바라볼 때 시계 방향이라, 앞에서 보면 R과 거꾸로 돌아요.",
  },
  U: {
    name: "윗면",
    note: "실물에서는 검지로 위층을 밀어요. U와 y는 같은 쪽으로 돌지만, U는 윗층만 돌아 모양이 바뀌고 y는 큐브 전체가 돌아 모양이 그대로예요.",
  },
  F: { name: "앞면", note: "앞면을 바라볼 때 시계 방향이에요." },
  D: {
    name: "아랫면",
    note: "아랫면은 아래에서 바라볼 때 시계 방향이라, 위에서 보면 U와 거꾸로 돌아요.",
  },
  B: {
    name: "뒷면",
    note: "뒷면은 뒤에서 바라볼 때 시계 방향이라, 앞에서 보면 F와 거꾸로 돌아요.",
  },
};

const HAND_LABEL = { left: "왼손", right: "오른손" } as const;

/** 수 몇 개를 치는 손: 모두 한 손이면 그 손, 갈리면 「두 손」, 키가 없으면 null */
function handFor(keymap: Keymap, n: number, moves: string[]): string | null {
  const hands = new Set<"left" | "right">();
  for (const m of moves) {
    const keys = keysForMove(keymap, n, m);
    if (!keys) return null;
    for (const c of keys) {
      const h = handOf(c.code);
      if (h) hands.add(h);
    }
  }
  const [only, ...rest] = [...hands];
  if (!only) return null;
  return rest.length > 0 ? "두 손" : HAND_LABEL[only];
}

export function tutorialSteps(keymap: Keymap): TutorialStep[] {
  const n = TUTORIAL_N;
  const k = (a: string) => keyTextFor(keymap, n, a) ?? "(키 없음)";
  // 「이 배치에서 F 키는 「U'」, J 키는 「U」 수예요.」 동작이 없는 키는 「J 키에는 동작이 없어요.」로 따로
  const homeKeysLine = (() => {
    const has: string[] = [];
    const none: string[] = [];
    for (const code of ["KeyF", "KeyJ"]) {
      const l = keyLayers(keymap, n, code).plain;
      if (l) has.push(`${codeLabel(code)} 키는 「${l.label}」`);
      else none.push(codeLabel(code));
    }
    const out: string[] = [];
    if (has.length > 0) out.push(`이 배치에서 ${has.join(", ")} 수예요.`);
    if (none.length > 0) out.push(`${none.join("·")} 키에는 동작이 없어요.`);
    out.push("차례로 눌러 보세요.");
    return out.join(" ");
  })();

  const moves = (...ts: string[]) => {
    const targets: TutorialTarget[] = [];
    const missing: string[] = [];
    for (const t of ts)
      if (keyTextFor(keymap, n, t) === null) {
        if (!missing.includes(t)) missing.push(t);
      } else targets.push({ kind: "move", notation: t });
    return { targets, missing };
  };

  const presetLine =
    keymap.preset === "twoHand"
      ? `「두 손」 배치는 실물에서 그 면을 돌리는 손으로 쳐요. ${faceHandLine(keymap)} csTimer 같은 가상 큐브 사이트와 같은 배치라 다른 곳에서도 그대로 써요(다른 곳: Space는 살펴보기).`
      : keymap.preset === "notation"
        ? "「표기」 배치는 글자 그대로 쳐요. Shift를 함께 누르면 반대 방향이에요."
        : `「${PRESET_LABEL.custom}」 배치로 안내해요. 키는 설정에서 바꾼 대로 나와요.`;

  // 큐브 둘러보기: x·y·z를 한 번씩 → 말한 색 면이 오게 돌리기. 두 축 넘게 돌릴 수 있어야 아무 모양이나 낸다
  const rot = moves("x", "y", "z");
  const axes = ["x", "y", "z"].filter(
    (a) =>
      keyTextFor(keymap, n, a) !== null ||
      keyTextFor(keymap, n, `${a}'`) !== null,
  );
  if (axes.length >= 2) rot.targets.push(...ORIENT_GOALS);
  else rot.missing.push("목표 모양(큐브 돌리기 키가 모자라요)");

  const faceStep = (f: string): TutorialStep => {
    const info = FACE_INFO[f] as { name: string; note: string };
    const ccw = `${f}'`;
    const hand = handFor(keymap, n, [f, ccw]);
    return {
      id: `face-${f}`,
      title: `${info.name} ${f}·${ccw}`,
      lines: [
        `${info.name}을 시계 방향으로 돌리려면 ${k(f)} 키(${f}), 반대로는 ${k(ccw)} 키(${ccw})를 쳐요.`,
        `${k(f)} 키로 돌린 뒤 ${k(ccw)} 키로 되돌려 맞춰요. 이어서 거꾸로도 해 봐요.`,
        info.note,
      ],
      ...moves(f, ccw, ccw, f),
      ...(hand ? { hand: { label: hand, moves: [f, ccw] } } : {}),
    };
  };

  const commandTargets: TutorialTarget[] = [];
  const commandMissing: string[] = [];
  const rMove = moves("R");
  commandTargets.push(...rMove.targets);
  commandMissing.push(...rMove.missing);
  for (const c of ["undo", "scramble", "reset"] as const)
    if (keyTextFor(keymap, n, c) === null)
      commandMissing.push(COMMAND_LABEL[c]);
    else commandTargets.push({ kind: "command", command: c });

  const unwind = moves("R", "U", "U'", "R'", "F", "R");
  unwind.targets.push({ kind: "solve" });

  return [
    {
      id: "home",
      title: "손 자리",
      lines: [
        `두 검지를 ${codeLabel("KeyF")}와 ${codeLabel("KeyJ")}에 올려요. 두 키에는 작은 돌기가 있어 보지 않고도 손 자리를 찾을 수 있어요.`,
        presetLine,
        homeKeysLine,
      ],
      targets: [
        { kind: "code", code: "KeyF" },
        { kind: "code", code: "KeyJ" },
      ],
      missing: [],
    },
    {
      id: "rotate",
      title: "큐브 둘러보기",
      lines: [
        `x·y·z는 큐브 전체를 돌려요. x는 ${k("x")} 키, y는 ${k("y")} 키, z는 ${k("z")} 키예요.`,
        "보는 쪽만 바뀌고 섞이지 않아요. x는 R, y는 U, z는 F와 같은 쪽으로 돌아요.",
        `한 번씩 쳐 본 뒤 말한 색 면이 오게 돌려 보세요. 반대쪽은 ${k("x'")}·${k("y'")}·${k("z'")} 키예요.`,
      ],
      ...rot,
    },
    ruleStep(keymap, n),
    faceStep("R"),
    {
      id: "commands",
      title: "되돌리기·맞춘 상태로",
      lines: [
        `실수해도 괜찮아요. 되돌리기(${k("undo")})는 마지막 수를 거꾸로 돌려요.`,
        `R을 친 뒤 되돌리기로 되돌려 보세요. 이어서 섞기(${k("scramble")}) 뒤 맞춘 상태로(${k("reset")})를 쳐요.`,
      ],
      targets: commandTargets,
      missing: commandMissing,
    },
    faceStep("L"),
    faceStep("U"),
    faceStep("F"),
    faceStep("D"),
    faceStep("B"),
    {
      id: "unwind",
      title: "섞고 풀기",
      lines: [
        "섞은 수는 나중에 친 것부터 거꾸로 쳐서 풀어요.",
        "R U로 섞고 U' R'으로 풀어 보세요. 다음엔 F R로 섞은 뒤 혼자 풀어요.",
      ],
      ...unwind,
    },
    {
      id: "double",
      title: "반 바퀴",
      lines: [
        `R2는 오른쪽 면을 반 바퀴 돌려요. 같은 키를 두 번 쳐요(${k("R2")}).`,
        "반 바퀴는 어느 쪽으로 돌려도 같아요.",
      ],
      ...moves("R2", "U2", "F2"),
    },
    {
      id: "layer",
      title: "넓게·가운데 층",
      lines: [
        `M(가운데 세로 층, L과 같은 방향)은 ${k("M")} 키, M'은 ${k("M'")} 키예요.`,
        `Rw(오른쪽 두 층 함께)는 ${k("Rw")} 키, Rw'은 ${k("Rw'")} 키예요.`,
        keymap.preset === "notation"
          ? `넓게는 Alt + 면 키, E·S는 ${k("E")}·${k("S")} 키예요.`
          : `E(적도, D와 같은 쪽)는 ${k("E")}, S(서 있는 층, F와 같은 쪽)는 ${k("S")} 키예요(csTimer와 같아요). 넓게는 Shift + 면 키로도 쳐요.`,
      ],
      ...moves("M", "M'", "Rw", "Rw'", "E", "S"),
    },
    {
      id: "formula",
      title: "짧은 공식",
      lines: [
        "섹시 무브 R U R' U'와 수네 R U R' U R U2 R'을 이어서 쳐 보세요.",
        "다 치면 조작 훈련에서 빠르기를 길러요.",
      ],
      ...moves(...SEXY, ...SUNE),
    },
  ];
}

/** 「두 손」 대응표에서 수 하나의 손가락(규칙 맞히기의 실마리) */
const fingerOf = (move: string) =>
  TWO_HAND_RULES.find((r) => r.move === move)?.finger ?? "";

/**
 * 배치 규칙(2026-11-04): 키를 하나씩 외우기 전에 규칙 하나로 떠올리게 한다. 「두 손」은 실물 핑거 트릭을 옮긴 배치
 * (csTimer와 같음)라 「R은 I, 그럼 L'은?」을 손가락으로 맞힌다. 「표기」는 「R은 R, 그럼 R'은?」. 문제의 키는
 * `two-hand.ts` 대응표와 지금 배치에서 읽고, 배치에 없는 수는 뺀다.
 */
function ruleStep(keymap: Keymap, n: number): TutorialStep {
  const k = (a: string) => keyTextFor(keymap, n, a);
  const has = (a: string) => k(a) !== null;
  const show = (m: string): TutorialTarget => ({ kind: "move", notation: m });
  const ask = (m: string, hint: string): TutorialTarget => ({
    kind: "move",
    notation: m,
    ask: hint,
  });
  if (keymap.preset === "twoHand") {
    const targets: TutorialTarget[] = [];
    // 보여 주고 → 짝을 맞히기: R(보기) → L'(왼손 거울) → L, U(보기) → U'(다른 손 같은 자리)
    for (const [m, asked] of [
      ["R", false],
      ["L'", true],
      ["L", true],
      ["U", false],
      ["U'", true],
      ["F'", true],
    ] as const)
      if (has(m)) targets.push(asked ? ask(m, fingerOf(m)) : show(m));
    return {
      id: "rule",
      title: "배치 규칙",
      lines: [
        "「두 손」은 실물 큐브의 핑거 트릭을 키보드로 옮긴 배치예요. csTimer 가상 큐브와 같은 자리라 거기서도 그대로 쳐요.",
        `규칙 하나만 기억해요: ${TWO_HAND_RULE}`,
        `예를 들어 R은 오른 손목을 아래에서 위로 올리니 오른손 위 줄 ${k("R") ?? "I"}, R'은 내리니 가운데 줄 ${k("R'") ?? "K"}예요. U는 오른 검지로 미니 ${k("U") ?? "J"}.`,
        "물음표 칸은 키를 가렸어요. 손가락을 떠올려 맞는 키를 쳐 보세요.",
      ],
      targets,
      missing: [],
    };
  }
  if (keymap.preset === "notation")
    return {
      id: "rule",
      title: "배치 규칙",
      lines: [
        "「표기」는 공식 글자 그대로 쳐요. R은 R 키, U는 U 키예요.",
        "반대 방향(')은 Shift와 함께, 넓게(w)는 Alt와 함께 쳐요.",
        "물음표 칸은 키를 가렸어요. 규칙대로 쳐 보세요.",
      ],
      targets: [
        show("R"),
        ask("R'", "R 키를 Shift와 함께"),
        ask("U'", "U 키를 Shift와 함께"),
      ],
      missing: [],
    };
  return {
    id: "rule",
    title: "배치 규칙",
    lines: [
      "「사용자」 배치는 설정에서 바꾼 대로예요. 키 그림을 보며 R과 R'을 쳐 보세요.",
    ],
    targets: (["R", "R'"] as const).filter(has).map(show),
    missing: [],
  };
}

/**
 * 둘러보기의 목표 모양. 앞 목표를 이룬 상태(그리고 x·y·z를 한 번씩 친 상태)에서 다음 목표가 이미 이뤄져 있지 않도록
 * 위 색을 매번 바꾼다(시험이 확인한다). 마지막은 처음 모양(흰 위·초록 앞)으로 돌아온다.
 */
export const ORIENT_GOALS: TutorialTarget[] = [
  { kind: "orient", up: 2 },
  { kind: "orient", up: 1 },
  { kind: "orient", up: 0, front: 2 },
];

export interface FaceHand {
  face: string;
  /** 시계(`R`)·반시계(`R'`)를 조합 키 없이 치는 키 */
  cw: string;
  ccw: string;
  /** 두 키를 같은 손으로 치면 그 손, 두 손에 나뉘면 null */
  hand: "left" | "right" | null;
}

/** 면마다 시계·반시계 키가 어느 손에 있는지(조합 키 없이 치는 키가 둘 다 있는 면만) */
export function faceHands(keymap: Keymap): FaceHand[] {
  const plain = (a: string) =>
    chordsFor(keymap, a).find((c) => !c.shift && !c.alt && !c.ctrl)?.code;
  const out: FaceHand[] = [];
  for (const face of ["R", "L", "U", "D", "F", "B"]) {
    const cw = plain(face);
    const ccw = plain(`${face}'`);
    if (!cw || !ccw) continue;
    const h = handOf(cw);
    out.push({ face, cw, ccw, hand: h && h === handOf(ccw) ? h : null });
  }
  return out;
}

/**
 * 「R·R'은 오른손 I·K, L·L'은 왼손 D·E로 한 손에서 쳐요. U·U'은 J·F, …로 두 손이 나눠 쳐요.」처럼
 * 지금 배치의 키에서 만든다.
 */
export function faceHandLine(keymap: Keymap): string {
  const pair = (f: FaceHand) =>
    `${f.face}·${f.face}'은 ${f.hand ? `${HAND_LABEL[f.hand]} ` : ""}${codeLabel(f.cw)}·${codeLabel(f.ccw)}`;
  const all = faceHands(keymap);
  const one = all.filter((f) => f.hand);
  const two = all.filter((f) => !f.hand);
  const out: string[] = [];
  if (one.length > 0) out.push(`${one.map(pair).join(", ")}로 한 손에서 쳐요.`);
  if (two.length > 0)
    out.push(`${two.map(pair).join(", ")}로 두 손이 나눠 쳐요.`);
  return out.join(" ");
}

export type TutorialEvent =
  | { kind: "code"; code: string }
  | { kind: "move"; move: CubeMove }
  | { kind: "command"; command: Command };

export type StepOutcome = "hit" | "partial" | "miss" | "done" | "ignore";

/** 위·앞 가운데 조각의 색 */
export interface CubeFacing {
  up: ColorId;
  front: ColorId;
}

export function facingOf(n: number, state: PuzzleState): CubeFacing {
  const nn = n * n;
  const mid = (nn - 1) >> 1;
  const colors = faceColors(n, state);
  // FACES 차례 U R F D L B: 위 = 0번 면, 앞 = 2번 면
  return {
    up: colors[mid] as ColorId,
    front: colors[2 * nn + mid] as ColorId,
  };
}

function facingMatches(t: { up?: ColorId; front?: ColorId }, f: CubeFacing) {
  return (
    (t.up === undefined || t.up === f.up) &&
    (t.front === undefined || t.front === f.front)
  );
}

/**
 * 한 단계 진행. 키마다 `code` 사건을, 그 키가 수·명령이 되면 그 사건을 이어서 넣는다.
 * 큐브 모양(목표 모양·혼자 풀기 판정용)은 단계 시작 때 맞춘 상태로 보고 들어온 수·명령으로 따라간다
 * (화면은 단계를 열 때 큐브를 맞춘 상태로 둔다). 섞기 뒤에는 모양을 모른다.
 */
export class StepRun {
  private i = 0;
  private matcher: MoveMatcher | null = null;
  private state: PuzzleState | null;
  private history: CubeMove[] = [];

  constructor(
    readonly n: number,
    readonly step: TutorialStep,
  ) {
    this.state = solvedCube(n);
    this.prepare();
  }

  get index(): number {
    return this.i;
  }

  get done(): boolean {
    return this.i >= this.step.targets.length;
  }

  get current(): TutorialTarget | undefined {
    return this.step.targets[this.i];
  }

  /** 맞춘 상태(또는 마지막 섞기·맞춘 상태로)에서 지금까지 돌린 수(되돌린 것은 빠진다) */
  get played(): readonly CubeMove[] {
    return this.history;
  }

  /** 지금 위·앞 색(섞은 뒤라 모르면 null) */
  get facing(): CubeFacing | null {
    return this.state ? facingOf(this.n, this.state) : null;
  }

  private prepare(): void {
    const t = this.current;
    this.matcher =
      t?.kind === "move" ? new MoveMatcher(this.n, t.notation) : null;
  }

  private hit(): "hit" | "done" {
    this.i++;
    this.prepare();
    return this.done ? "done" : "hit";
  }

  private track(ev: TutorialEvent): void {
    if (ev.kind === "move") {
      this.history.push(ev.move);
      if (this.state) this.state = applyMove(this.n, this.state, ev.move);
    } else if (ev.kind === "command") {
      if (ev.command === "undo") {
        const m = this.history.pop();
        if (m && this.state)
          this.state = applyMove(this.n, this.state, invertMove(m));
      } else if (ev.command === "reset") {
        this.history = [];
        this.state = solvedCube(this.n);
      } else if (ev.command === "scramble") {
        this.history = [];
        this.state = null;
      }
    }
  }

  feed(ev: TutorialEvent): StepOutcome {
    this.track(ev);
    const t = this.current;
    if (!t) return "ignore";
    if (t.kind === "code") {
      if (ev.kind !== "code") return "ignore";
      return ev.code === t.code ? this.hit() : "miss";
    }
    if (ev.kind === "code") return "ignore";
    if (t.kind === "move") {
      if (ev.kind !== "move") return "miss";
      const r = this.matcher?.feed(ev.move) ?? "miss";
      return r === "hit" ? this.hit() : r;
    }
    if (t.kind === "orient") {
      if (ev.kind === "command" && ev.command === "scramble") return "miss";
      const f = this.facing;
      if (f && facingMatches(t, f)) return this.hit();
      // 면만 돌리면 보는 쪽이 바뀌지 않는다: 큐브 전체를 돌리라고 알린다
      if (ev.kind === "move" && !isRotation(this.n, ev.move)) return "miss";
      return "partial";
    }
    if (t.kind === "solve") {
      // 맞춘 상태로·섞기로는 풀지 않는다. 수와 되돌리기로만
      if (ev.kind === "command" && ev.command !== "undo") return "ignore";
      return this.state && isSolved(this.n, this.state)
        ? this.hit()
        : "partial";
    }
    if (ev.kind !== "command") return "miss";
    return ev.command === t.command ? this.hit() : "miss";
  }
}

/** 칠 것을 글로(`R`, `되돌리기`, `F 키`, `초록 위`, `혼자 풀기`) */
export function targetLabel(t: TutorialTarget): string {
  if (t.kind === "code") return `${codeLabel(t.code)} 키`;
  if (t.kind === "move") return t.ask ? `${t.notation} ?` : t.notation;
  if (t.kind === "orient") return orientLabel(t);
  if (t.kind === "solve") return "혼자 풀기";
  return COMMAND_LABEL[t.command];
}

/** 「초록 위」·「흰 위·초록 앞」 */
export function orientLabel(t: { up?: ColorId; front?: ColorId }): string {
  const out: string[] = [];
  if (t.up !== undefined) out.push(`${COLOR_NAME[t.up]} 위`);
  if (t.front !== undefined) out.push(`${COLOR_NAME[t.front]} 앞`);
  return out.join("·");
}

/** 목표 모양을 문장으로: 「초록 면을 위로 오게 돌려요.」 */
export function orientGoalText(t: { up?: ColorId; front?: ColorId }): string {
  const out: string[] = [];
  if (t.up !== undefined) out.push(`${COLOR_NAME[t.up]} 면을 위로`);
  if (t.front !== undefined) out.push(`${COLOR_NAME[t.front]} 면을 앞으로`);
  return `${out.join(", ")} 오게 돌려요.`;
}
