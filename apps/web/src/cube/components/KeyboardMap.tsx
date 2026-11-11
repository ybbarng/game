"use client";

import { cn } from "@/lib/cn";
import { parseAction } from "../input/actions";
import type { KeyChord, Keymap } from "../input/keymaps";
import { capRepeats } from "../keys/key-colors";
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
import { KeyOverlay, useHeldShift } from "./KeyGuide";
import {
  type KeyLook,
  KeyMark,
  labelTone,
  paintAttr,
  useKeyLook,
} from "./KeyPaint";
import { PRESS_CLASS, useVirtualKeys, type VirtualKeys } from "./VirtualKeys";

/**
 * 키보드 그림(단축키 표·키 익히기·조작 훈련). 실제 키보드 비례로 그리고, 키마다 지금 배치의 동작을 층별로 적는다.
 * 테두리 색은 그냥 칠 때 동작의 묶음(면은 큐브 표준 색). 폭은 감싼 칸에 맞춰 줄어 휴대폰에서도 가로로 넘치지 않는다.
 */

/**
 * 칸에 보일 층. `live`(키 익히기·조작 훈련, 기본): 그냥 칠 때만, Shift·Alt를 누르는 동안 그 층으로 바뀐다.
 * `all`(단축키 표의 「모두」): 모든 층을 줄마다 적는다(찾아보는 표라서)
 */
export type LayerView = Layer | "all" | "live";

const FACE_DOT: Record<FaceLetter, string> = {
  R: "bg-red-500",
  L: "bg-orange-400",
  U: "bg-neutral-100 ring-1 ring-neutral-400",
  D: "bg-yellow-300",
  F: "bg-green-500",
  B: "bg-blue-500",
};
const KIND_DOT: Record<Exclude<ActionKind, "face">, string> = {
  layer: "bg-violet-400",
  rotate: "bg-fuchsia-400",
  command: "bg-neutral-500",
};

/** 칸 테두리: 무채색 하나(2026-11-05 「어지러움」, 예전에는 동작 묶음마다 색 테두리) */
function borderOf(a: KeyAction | undefined): string {
  return a?.usable
    ? "border-white/10 print:border-neutral-400"
    : "border-white/[0.05] print:border-neutral-200";
}

/** 층 수 키(큰 큐브의 바깥 층 수 바꾸기). 3×3 이하에서는 하는 일이 없다(`isAvailable`) */
function isLayersKey(a: KeyAction): boolean {
  return parseAction(a.action)?.kind === "layers";
}

/** 수가 아니라 낱말로 적는 동작(명령·층 수) */
function isWordy(a: KeyAction): boolean {
  return a.kind === "command" || isLayersKey(a);
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
  /** 칸을 눌러 칠 수 있다(화면 키보드, `VirtualKeys`). Shift·Alt 칸은 토글 */
  pressable?: boolean;
  className?: string;
}

export function KeyboardMap({
  keymap,
  n,
  layer: view = "live",
  lit = [],
  pressed = null,
  wrong = null,
  hideActions = false,
  pressable = false,
  className,
}: KeyboardMapProps) {
  const rows = keyboardCells(keymap, n);
  const glow = litCodes(lit);
  const look = useKeyLook(n);
  const vk = useVirtualKeys();
  const press = pressable ? vk : null;
  const held = useHeldShift();
  // `live`: 지금 누른(또는 화면에서 켠) Shift·Alt의 층
  const shiftOn = held || vk.mods.shift;
  const layer: Exclude<LayerView, "live"> =
    view !== "live"
      ? view
      : vk.mods.alt
        ? shiftOn
          ? "altShift"
          : "alt"
        : shiftOn
          ? "shift"
          : "plain";

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
        className="relative grid gap-[0.35cqw]"
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
                press={press}
              />
            ) : (
              <Key
                key={cell.code}
                cell={cell}
                first={i === 0}
                layer={layer}
                state={state(cell.code)}
                hideActions={hideActions}
                look={look}
                press={press}
              />
            ),
          ),
        )}
        {/* 손가락 자리: 이 그림을 쓰는 곳(단축키 표·키 익히기·조작 훈련)은 키를 익히는 화면이라 늘 보인다. 맞추는
            화면의 키 그림(`KeyGuide`)은 설정 「손가락 자리를 모든 화면에서도 보이기」를 켜야 보인다(2026-11-05) */}
        <KeyOverlay />
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
  hideActions,
  look,
  press,
  state: given,
}: {
  cell: KeyCell;
  /** 줄의 첫 키(새 줄에서 시작) */
  first: boolean;
  layer: Exclude<LayerView, "live">;
  state: KeyState;
  hideActions: boolean;
  look: (action: string | undefined) => KeyLook | null;
  press: VirtualKeys | null;
}) {
  const w = Math.round(cell.width * 4);
  const span = { gridColumn: first ? `1 / span ${w}` : `span ${w}` };
  if (cell.code === "Gap") return <div style={span} aria-hidden />;
  const mod = /^Shift/.test(cell.code)
    ? "shift"
    : /^Alt/.test(cell.code)
      ? "alt"
      : null;
  const modOn = !!(press && mod && press.mods[mod]);
  // 켠 화면 Shift·Alt는 빛난다
  const state: KeyState = given ?? (modOn ? "lit" : null);
  const pressProps = !press
    ? {}
    : mod
      ? {
          role: "button",
          "aria-pressed": modOn,
          "data-key-mod": mod,
          onPointerDown: (e: { preventDefault: () => void }) => {
            e.preventDefault();
            press.toggle(mod);
          },
        }
      : cell.modifier
        ? {}
        : {
            role: "button",
            "aria-label": cell.cap,
            "data-key-press": "",
            ...press.keyProps(cell.code),
          };
  const l = cell.layers;
  const main = layer === "all" ? l.plain : l[layer];
  const usable = !!main?.usable;
  const paint =
    cell.modifier || hideActions
      ? null
      : look(usable ? main?.action : undefined);
  // 동작 없는 키는 아주 흐리게(키보드 모양만 남긴다)
  const idle = !cell.modifier && !usable;
  const lines: { key: string; a: KeyAction | undefined; strong?: boolean }[] =
    layer === "all"
      ? [
          { key: "plain", a: l.plain, strong: true },
          { key: "shift", a: l.shift },
          { key: "alt", a: l.alt ?? l.altShift },
          ...(l.alt && l.altShift ? [{ key: "altShift", a: l.altShift }] : []),
        ]
      : [{ key: layer, a: main, strong: true }];
  const label = !hideActions && usable ? main?.label : undefined;
  const showCap = cell.modifier || !capRepeats(cell.cap, label);
  return (
    <div
      data-key={cell.code}
      data-key-state={state ?? undefined}
      data-key-idle={idle ? "" : undefined}
      {...pressProps}
      data-key-paint={paintAttr(paint)}
      data-key-stripe={paint?.striped ? "" : undefined}
      style={state ? span : { ...span, ...paint?.cell }}
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-[0.6cqw] border px-[0.4cqw] pt-[0.25cqw] pb-[0.8cqw] leading-[1.15] transition-colors print:bg-white",
        cell.modifier
          ? "border-white/[0.06] bg-transparent text-white/30 print:border-neutral-300 print:text-neutral-500"
          : idle
            ? "border-white/[0.05] bg-transparent print:border-neutral-200"
            : "border-white/10 bg-white/[0.04] print:border-neutral-400",
        state && STATE_CLASS[state],
        press && (mod || !cell.modifier) && PRESS_CLASS,
      )}
    >
      {showCap && (
        <span
          data-key-cap
          className={cn(
            "text-[0.8em]",
            idle ? "text-white/15" : "text-white/35",
            "print:text-neutral-500",
          )}
        >
          {cell.cap}
        </span>
      )}
      {!cell.modifier && !hideActions && (
        <span className="flex min-w-0 flex-1 flex-col justify-end">
          {lines.map(({ key, a, strong }) =>
            a && (a.usable || (layer === "all" && !isLayersKey(a))) ? (
              <span
                key={key}
                data-layer-line={key}
                className={cn(
                  // 낱말(되돌리기·왼손 층 +1)은 칸에서 잘리지 않게 줄을 접고, 수는 한 줄
                  isWordy(a) ? "break-keep" : "truncate",
                  strong
                    ? cn(
                        "font-semibold print:text-black",
                        // 수는 크게, 낱말(처음으로·되돌리기)은 칸에 들어가게
                        isWordy(a) ? "text-[1.1em]" : "text-[1.35em]",
                        labelTone(paint),
                      )
                    : "text-white/40 print:text-neutral-600",
                  !a.usable && "opacity-30",
                )}
              >
                {a.label}
              </span>
            ) : null,
          )}
        </span>
      )}
      {!state && <KeyMark look={paint} />}
    </div>
  );
}

function Arrows({
  keymap,
  n,
  state,
  hideActions,
  press,
}: {
  keymap: Keymap;
  n: number;
  state: (code: string) => KeyState;
  hideActions: boolean;
  press: VirtualKeys | null;
}) {
  const one = (code: string, pos: string) => {
    const a = keyLayers(keymap, n, code).plain;
    const s = state(code);
    return (
      <div
        key={code}
        data-key={code}
        data-key-state={s ?? undefined}
        {...(press
          ? {
              role: "button",
              "aria-label": capOf(code),
              "data-key-press": "",
              ...press.keyProps(code),
            }
          : {})}
        className={cn(
          "flex min-w-0 flex-col items-center justify-center overflow-hidden rounded-[0.5cqw] border bg-white/[0.04] leading-none print:bg-white",
          borderOf(a),
          pos,
          s && STATE_CLASS[s],
          press && PRESS_CLASS,
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
  ];
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-white/70 text-xs print:text-neutral-700">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1">
          <span className={cn("inline-block h-2.5 w-2.5 rounded-sm", i.dot)} />
          {i.label}
        </li>
      ))}
      <li>면 색 표시는 그 면을 돌리는 키, 흐린 글과 표시는 반대 방향(′)</li>
      <li>큐브 돌리기·가운데 층은 색 없음</li>
    </ul>
  );
}
