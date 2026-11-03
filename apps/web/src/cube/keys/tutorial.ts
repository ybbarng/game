import { COMMAND_LABEL, type Command } from "../input/actions";
import {
  chordsFor,
  codeLabel,
  type Keymap,
  PRESET_LABEL,
} from "../input/keymaps";
import type { CubeMove } from "../view/types";
import { handOf, keyLayers } from "./layout";
import { keyTextFor, MoveMatcher } from "./reach";

/**
 * 키 익히기 튜토리얼(`/cube/keys/learn`, docs/47 4절). 지금 배치를 읽어 단계마다 설명과 칠 것을 만든다.
 * 키 이름은 문장에 그대로 적지 않고 배치에서 읽으므로 「두 손」·「표기」·「사용자」 모두 같은 단계가 나온다.
 * 배치에 없는 수는 그 단계에서 빼고 `missing`에 남긴다(설정에서 놓으라고 알린다).
 */

export type TutorialTarget =
  | { kind: "code"; code: string }
  | { kind: "move"; notation: string }
  | { kind: "command"; command: Command };

export interface TutorialStep {
  id: string;
  title: string;
  lines: string[];
  targets: TutorialTarget[];
  /** 이 배치에 키가 없어 뺀 것 */
  missing: string[];
}

/** 튜토리얼 큐브 크기 */
export const TUTORIAL_N = 3;

const SEXY = ["R", "U", "R'", "U'"];
const SUNE = ["R", "U", "R'", "U", "R", "U2", "R'"];

export function tutorialSteps(keymap: Keymap): TutorialStep[] {
  const n = TUTORIAL_N;
  const k = (a: string) => keyTextFor(keymap, n, a) ?? "(키 없음)";
  const plainOf = (code: string) => {
    const l = keyLayers(keymap, n, code).plain;
    return l ? `「${l.label}」` : "아무 동작도 없음";
  };

  const moves = (...ts: string[]) => {
    const targets: TutorialTarget[] = [];
    const missing: string[] = [];
    for (const t of ts)
      if (keyTextFor(keymap, n, t) === null) missing.push(t);
      else targets.push({ kind: "move", notation: t });
    return { targets, missing };
  };

  const presetLine =
    keymap.preset === "twoHand"
      ? `「두 손」 배치는 실물에서 그 면을 돌리는 손으로 칩니다. ${faceHandLine(keymap)}`
      : keymap.preset === "notation"
        ? "「표기」 배치는 글자 그대로 칩니다. Shift를 함께 누르면 반대 방향입니다"
        : `「${PRESET_LABEL.custom}」 배치로 안내합니다. 키는 설정에서 바꾼 대로 나옵니다`;

  const right = moves("R", "R'", "U");
  const left = moves("L", "L'", "U'");
  const fdb = moves("F", "F'", "D", "D'", "B", "B'");
  const rot = moves("x", "y", "z", "y'");
  const layer = moves("M", "M'", "Rw", "Rw'");
  const formula = moves(...SEXY, ...SUNE);

  const commandTargets: TutorialTarget[] = [];
  const commandMissing: string[] = [];
  const rMove = moves("R");
  commandTargets.push(...rMove.targets);
  commandMissing.push(...rMove.missing);
  for (const c of ["undo", "scramble", "reset"] as const)
    if (keyTextFor(keymap, n, c) === null)
      commandMissing.push(COMMAND_LABEL[c]);
    else commandTargets.push({ kind: "command", command: c });

  return [
    {
      id: "home",
      title: "손 자리",
      lines: [
        `두 검지를 ${codeLabel("KeyF")}와 ${codeLabel("KeyJ")}에 올립니다. 두 키에는 작은 돌기가 있어 보지 않고도 손 자리를 찾을 수 있습니다`,
        presetLine,
        `이 배치에서 ${codeLabel("KeyF")}는 ${plainOf("KeyF")}, ${codeLabel("KeyJ")}는 ${plainOf("KeyJ")}입니다. 차례로 눌러 보세요`,
      ],
      targets: [
        { kind: "code", code: "KeyF" },
        { kind: "code", code: "KeyJ" },
      ],
      missing: [],
    },
    {
      id: "right",
      title: "R·R'·U",
      lines: [
        `R(오른쪽 면을 시계 방향)은 ${k("R")}, R'(반대 방향)은 ${k("R'")}, U(윗면)는 ${k("U")}입니다`,
        "실물에서는 R을 오른 손목으로, U를 오른 검지로 돌립니다",
      ],
      ...right,
    },
    {
      id: "left",
      title: "L·L'·U'",
      lines: [
        `L(왼쪽 면)은 ${k("L")}, L'은 ${k("L'")}, U'(윗면 반대)은 ${k("U'")}입니다`,
        "L은 오른쪽에서 보면 R'과 같은 쪽으로 돕니다. 왼쪽 면을 왼쪽에서 바라볼 때 시계 방향이기 때문입니다",
      ],
      ...left,
    },
    {
      id: "fdb",
      title: "F·D·B",
      lines: [
        `F(앞면)는 ${k("F")}, F'은 ${k("F'")}, D(아랫면)는 ${k("D")}, D'은 ${k("D'")}입니다`,
        `B(뒷면)는 ${k("B")}, B'은 ${k("B'")}입니다. 뒷면은 뒤에서 바라볼 때 시계 방향이라 앞에서 보면 거꾸로 돕니다`,
      ],
      ...fdb,
    },
    {
      id: "rotate",
      title: "큐브 돌리기",
      lines: [
        `x·y·z는 큐브 전체를 돌립니다. x는 ${k("x")}, y는 ${k("y")}, z는 ${k("z")}, y'은 ${k("y'")}입니다`,
        "x는 R, y는 U, z는 F와 같은 방향입니다. 섞인 모양은 그대로이고 보는 쪽만 바뀝니다",
      ],
      ...rot,
    },
    {
      id: "layer",
      title: "넓게·가운데 층",
      lines: [
        `M(가운데 세로 층, L과 같은 방향)은 ${k("M")}, M'은 ${k("M'")}입니다`,
        `Rw(오른쪽 두 층 함께)는 ${k("Rw")}, Rw'은 ${k("Rw'")}입니다`,
      ],
      ...layer,
    },
    {
      id: "commands",
      title: "되돌리기·섞기",
      lines: [
        `R을 한 번 친 뒤 되돌리기(${k("undo")})로 되돌려 보세요`,
        `이어서 섞기(${k("scramble")}), 맞춘 상태로(${k("reset")})를 칩니다`,
      ],
      targets: commandTargets,
      missing: commandMissing,
    },
    {
      id: "formula",
      title: "짧은 공식",
      lines: [
        `섹시 무브 R U R' U'와 수네 R U R' U R U2 R'을 이어서 칩니다. U2는 ${k("U")}를 두 번 칩니다`,
        "손이 기억할 때까지 공식 따라 치기에서 반복해 보세요",
      ],
      ...formula,
    },
  ];
}

const HAND_LABEL = { left: "왼손", right: "오른손" } as const;

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
 * 「R·R'은 오른손 I·K, L·L'은 왼손 D·E로 한 손에서 칩니다. U·U'은 J·F, …로 두 손이 나눠 칩니다.」처럼
 * 지금 배치의 키에서 만든다.
 */
export function faceHandLine(keymap: Keymap): string {
  const pair = (f: FaceHand) =>
    `${f.face}·${f.face}'은 ${f.hand ? `${HAND_LABEL[f.hand]} ` : ""}${codeLabel(f.cw)}·${codeLabel(f.ccw)}`;
  const all = faceHands(keymap);
  const one = all.filter((f) => f.hand);
  const two = all.filter((f) => !f.hand);
  const out: string[] = [];
  if (one.length > 0)
    out.push(`${one.map(pair).join(", ")}로 한 손에서 칩니다.`);
  if (two.length > 0)
    out.push(`${two.map(pair).join(", ")}로 두 손이 나눠 칩니다.`);
  return out.join(" ");
}

export type TutorialEvent =
  | { kind: "code"; code: string }
  | { kind: "move"; move: CubeMove }
  | { kind: "command"; command: Command };

/** 한 단계 진행. 키마다 `code` 사건을, 그 키가 수·명령이 되면 그 사건을 이어서 넣는다 */
export class StepRun {
  private i = 0;
  private matcher: MoveMatcher | null = null;

  constructor(
    readonly n: number,
    readonly step: TutorialStep,
  ) {
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

  feed(ev: TutorialEvent): "hit" | "partial" | "miss" | "done" | "ignore" {
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
    if (ev.kind !== "command") return "miss";
    return ev.command === t.command ? this.hit() : "miss";
  }
}

/** 칠 것을 글로(`R`, `되돌리기`, `F 키`) */
export function targetLabel(t: TutorialTarget): string {
  if (t.kind === "code") return `${codeLabel(t.code)} 키`;
  if (t.kind === "move") return t.notation;
  return COMMAND_LABEL[t.command];
}
