"use client";

import { cn } from "@/lib/cn";
import type { KeyChord, Keymap } from "../input/keymaps";
import {
  type ActionKind,
  ARROWS,
  capOf,
  type FaceLetter,
  type KeyAction,
  type KeyCell,
  keyboardCells,
  keyLayers,
  type Layer,
} from "../keys/layout";

/**
 * 키보드 그림(단축키 표·키 익히기·조작 훈련). 실제 키보드 비례로 그리고, 키마다 지금 배치의 동작을 층별로 적는다.
 * 테두리 색은 그냥 칠 때 동작의 묶음(면은 큐브 표준 색). 폭은 감싼 칸에 맞춰 줄어 휴대폰에서도 가로로 넘치지 않는다.
 */

export type LayerView = Layer | "all";

const FACE_BORDER: Record<FaceLetter, string> = {
  R: "border-red-500",
  L: "border-orange-400",
  U: "border-neutral-100 print:border-neutral-400",
  D: "border-yellow-300",
  F: "border-green-500",
  B: "border-blue-500",
};
const FACE_DOT: Record<FaceLetter, string> = {
  R: "bg-red-500",
  L: "bg-orange-400",
  U: "bg-neutral-100 ring-1 ring-neutral-400",
  D: "bg-yellow-300",
  F: "bg-green-500",
  B: "bg-blue-500",
};
const KIND_BORDER: Record<Exclude<ActionKind, "face">, string> = {
  layer: "border-violet-400",
  rotate: "border-fuchsia-400",
  command: "border-neutral-500",
};
const KIND_DOT: Record<Exclude<ActionKind, "face">, string> = {
  layer: "bg-violet-400",
  rotate: "bg-fuchsia-400",
  command: "bg-neutral-500",
};

function borderOf(a: KeyAction | undefined): string {
  if (!a) return "border-white/10 print:border-neutral-300";
  return a.kind === "face" && a.face
    ? FACE_BORDER[a.face]
    : KIND_BORDER[a.kind as Exclude<ActionKind, "face">];
}

export function dotOf(a: { kind: ActionKind; face?: FaceLetter }): string {
  return a.kind === "face" && a.face
    ? FACE_DOT[a.face]
    : KIND_DOT[a.kind as Exclude<ActionKind, "face">];
}

/** 빛낼 키: 조합 키가 붙으면 Shift·Alt·Ctrl 키도 함께 */
function litCodes(chords: readonly KeyChord[]): Set<string> {
  const out = new Set<string>();
  for (const c of chords) {
    out.add(c.code);
    if (c.shift) out.add("ShiftLeft").add("ShiftRight");
    if (c.alt) out.add("AltLeft").add("AltRight");
    if (c.ctrl) out.add("ControlLeft");
  }
  return out;
}

export interface KeyboardMapProps {
  keymap: Keymap;
  n: number;
  layer?: LayerView;
  /** 칠 키(빛난다) */
  lit?: readonly KeyChord[];
  /** 방금 누른 키 */
  pressed?: string | null;
  /** 방금 틀린 키 */
  wrong?: string | null;
  /** 동작 글을 숨긴다(키 보고 맞히기) */
  hideActions?: boolean;
  className?: string;
}

export function KeyboardMap({
  keymap,
  n,
  layer = "all",
  lit = [],
  pressed = null,
  wrong = null,
  hideActions = false,
  className,
}: KeyboardMapProps) {
  const rows = keyboardCells(keymap, n);
  const glow = litCodes(lit);

  const state = (code: string) =>
    wrong === code
      ? "wrong"
      : glow.has(code)
        ? "lit"
        : pressed === code
          ? "pressed"
          : null;

  return (
    <div
      className={cn("@container w-full select-none", className)}
      data-keyboard-map
      data-layer={layer}
    >
      <div
        className="grid gap-[0.35cqw]"
        style={{
          gridTemplateColumns: "repeat(60, minmax(0, 1fr))",
          gridAutoRows: "calc(100cqw / 15.6)",
          fontSize: "clamp(6px, 1.15cqw, 12px)",
        }}
      >
        {rows.map((row) =>
          row.map((cell, i) =>
            cell.code === ARROWS ? (
              <Arrows
                key={cell.code}
                keymap={keymap}
                n={n}
                state={state}
                hideActions={hideActions}
              />
            ) : (
              <Key
                key={cell.code}
                cell={cell}
                first={i === 0}
                layer={layer}
                state={state(cell.code)}
                hideActions={hideActions}
              />
            ),
          ),
        )}
      </div>
    </div>
  );
}

type KeyState = "lit" | "pressed" | "wrong" | null;

const STATE_CLASS: Record<Exclude<KeyState, null>, string> = {
  lit: "bg-amber-300/40 ring-2 ring-amber-300 print:bg-amber-100",
  pressed: "bg-sky-400/30",
  wrong: "bg-red-500/40 ring-2 ring-red-400",
};

function Key({
  cell,
  first,
  layer,
  state,
  hideActions,
}: {
  cell: KeyCell;
  /** 줄의 첫 키(새 줄에서 시작) */
  first: boolean;
  layer: LayerView;
  state: KeyState;
  hideActions: boolean;
}) {
  const w = Math.round(cell.width * 4);
  const span = { gridColumn: first ? `1 / span ${w}` : `span ${w}` };
  if (cell.code === "Gap") return <div style={span} aria-hidden />;
  const l = cell.layers;
  const main = layer === "all" ? l.plain : l[layer];
  const tint =
    cell.hand === "left"
      ? "bg-sky-400/[0.07]"
      : cell.hand === "right"
        ? "bg-amber-400/[0.07]"
        : "bg-white/[0.04]";
  const lines: { key: string; a: KeyAction | undefined; strong?: boolean }[] =
    layer === "all"
      ? [
          { key: "plain", a: l.plain, strong: true },
          { key: "shift", a: l.shift },
          { key: "alt", a: l.alt ?? l.altShift },
          ...(l.alt && l.altShift ? [{ key: "altShift", a: l.altShift }] : []),
        ]
      : [{ key: layer, a: main, strong: true }];
  return (
    <div
      data-key={cell.code}
      data-key-state={state ?? undefined}
      style={span}
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-[0.6cqw] border-2 px-[0.3cqw] py-[0.15cqw] leading-[1.15] transition-colors print:bg-white",
        cell.modifier
          ? "border-white/10 bg-white/[0.02] text-white/40 print:border-neutral-300 print:text-neutral-500"
          : borderOf(main),
        !cell.modifier && tint,
        state && STATE_CLASS[state],
      )}
    >
      <span className="text-white/45 print:text-neutral-500">{cell.cap}</span>
      {!cell.modifier && !hideActions && (
        <span className="flex min-w-0 flex-1 flex-col justify-end">
          {lines.map(({ key, a, strong }) =>
            a ? (
              <span
                key={key}
                data-layer-line={key}
                className={cn(
                  "truncate",
                  strong
                    ? "font-semibold text-[1.25em] text-white print:text-black"
                    : "text-white/65 print:text-neutral-700",
                  !a.usable && "opacity-30",
                )}
              >
                {a.label}
              </span>
            ) : null,
          )}
        </span>
      )}
    </div>
  );
}

function Arrows({
  keymap,
  n,
  state,
  hideActions,
}: {
  keymap: Keymap;
  n: number;
  state: (code: string) => KeyState;
  hideActions: boolean;
}) {
  const one = (code: string, pos: string) => {
    const a = keyLayers(keymap, n, code).plain;
    const s = state(code);
    return (
      <div
        key={code}
        data-key={code}
        data-key-state={s ?? undefined}
        className={cn(
          "flex min-w-0 flex-col items-center justify-center overflow-hidden rounded-[0.5cqw] border bg-white/[0.04] leading-none print:bg-white",
          borderOf(a),
          pos,
          s && STATE_CLASS[s],
        )}
      >
        <span className="text-white/45 print:text-neutral-500">
          {capOf(code)}
        </span>
        {a && !hideActions && (
          <span className="truncate text-[0.85em] text-white/80 print:text-black">
            {a.label}
          </span>
        )}
      </div>
    );
  };
  return (
    <div
      style={{ gridColumn: "span 12" }}
      className="grid grid-cols-3 grid-rows-2 gap-[0.2cqw]"
    >
      {one("ArrowUp", "col-start-2")}
      {one("ArrowLeft", "col-start-1 row-start-2")}
      {one("ArrowDown", "col-start-2 row-start-2")}
      {one("ArrowRight", "col-start-3 row-start-2")}
    </div>
  );
}

/** 색 설명 */
export function KeyLegend() {
  const items: { label: string; dot: string }[] = [
    { label: "R", dot: FACE_DOT.R },
    { label: "L", dot: FACE_DOT.L },
    { label: "U", dot: FACE_DOT.U },
    { label: "D", dot: FACE_DOT.D },
    { label: "F", dot: FACE_DOT.F },
    { label: "B", dot: FACE_DOT.B },
    { label: "넓게·안쪽·가운데 층", dot: KIND_DOT.layer },
    { label: "큐브 돌리기", dot: KIND_DOT.rotate },
    { label: "명령", dot: KIND_DOT.command },
  ];
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-white/70 text-xs print:text-neutral-700">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1">
          <span className={cn("inline-block h-2.5 w-2.5 rounded-sm", i.dot)} />
          {i.label}
        </li>
      ))}
      <li className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-4 rounded-sm bg-sky-400/30" />
        왼손
      </li>
      <li className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-4 rounded-sm bg-amber-400/30" />
        오른손
      </li>
    </ul>
  );
}
