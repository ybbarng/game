"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { actionLabel } from "../input/actions";
import {
  chordLabel,
  chordsFor,
  codeLabel,
  type KeyChord,
  type Keymap,
  PRESET_LABEL,
} from "../input/keymaps";

import { handLayersText } from "../keys/hand-layers";
import type { Orient } from "../keys/key-colors";
import { FINGER_HOMES, facePairs, pairPath } from "../keys/key-pairs";
import { keyLayers } from "../keys/layout";
import type { HandLayers } from "../keys/reach";
import { hexColor, useCubeSettings } from "../settings";
import { SweepBar, useKeyLook } from "./KeyPaint";

/**
 * 키 그림(지금 배치). 칸의 굵은 글은 그냥 칠 때, 아래 작은 글은 Shift와 함께 칠 때. Shift를 누르고 있는 동안은
 * 굵은 글이 Shift 층으로 바뀐다. 면 돌리기 키는 들고 있는 방향의 그 면 색(설정 「키 그림에 면 색」, `KeyPaint`)
 */

const KEY_ROWS = [
  [
    "Digit1",
    "Digit2",
    "Digit3",
    "Digit4",
    "Digit5",
    "Digit6",
    "Digit7",
    "Digit8",
    "Digit9",
    "Digit0",
  ],
  [
    "KeyQ",
    "KeyW",
    "KeyE",
    "KeyR",
    "KeyT",
    "KeyY",
    "KeyU",
    "KeyI",
    "KeyO",
    "KeyP",
  ],
  [
    "KeyA",
    "KeyS",
    "KeyD",
    "KeyF",
    "KeyG",
    "KeyH",
    "KeyJ",
    "KeyK",
    "KeyL",
    "Semicolon",
  ],
  [
    "KeyZ",
    "KeyX",
    "KeyC",
    "KeyV",
    "KeyB",
    "KeyN",
    "KeyM",
    "Comma",
    "Period",
    "Slash",
  ],
];

const COMMAND_KEYS = [
  "undo",
  "reset",
  "scramble",
  "inspectionSkip",
  "peekBack",
  "peekDown",
] as const;

export function KeyGuide({
  n,
  keymap,
  lit,
  want,
  orient,
  layers,
}: {
  n: number;
  keymap: Keymap;
  /** 들고 있는 방향(키 색의 기준). 없으면 처음 방향 */
  orient?: Orient | undefined;
  /** 방금 누른 키(잠깐 빛난다) */
  lit: string | null;
  /** 칠 키(배우기 힌트·따라 하기 단계의 다음 수). Shift·Alt와 함께 칠 키는 칸에 ⇧·Alt를 붙인다 */
  want?: readonly KeyChord[] | null | undefined;
  /** 큰 큐브 「두 손」의 지금 층 수(csTimer의 3·4·7·8 키). 없으면 보이지 않는다 */
  layers?: HandLayers | null | undefined;
}) {
  const look = useKeyLook(n, orient);
  const { keyPairs, keyFingers } = useCubeSettings();
  // Shift를 누르고 있는 동안은 Shift 층을 굵게 보인다
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => setHeld(e.shiftKey);
    const off = () => setHeld(false);
    window.addEventListener("keydown", on);
    window.addEventListener("keyup", on);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("keydown", on);
      window.removeEventListener("keyup", on);
      window.removeEventListener("blur", off);
    };
  }, []);
  const cell = (code: string) => {
    const kl = keyLayers(keymap, n, code);
    const plain = held ? kl.shift : kl.plain;
    const shift = held ? undefined : kl.shift;
    const w = want?.find((c) => c.code === code);
    const paint = look(plain?.usable ? plain.action : undefined);
    const tinted = paint?.paint.kind === "face" && lit !== code && !w;
    return (
      <div
        key={code}
        data-key={code}
        data-key-want={w ? "" : undefined}
        data-key-paint={
          paint
            ? paint.paint.kind === "face"
              ? `${paint.paint.color}${paint.paint.prime ? "'" : ""}`
              : "sweep"
            : undefined
        }
        style={tinted ? { ...paint.style, color: paint.ink } : undefined}
        className={`relative flex h-10 min-w-0 flex-1 flex-col items-center justify-center rounded border text-[10px] leading-tight transition-colors ${
          lit === code
            ? "border-amber-300 bg-amber-300/30"
            : w
              ? "border-sky-300 bg-sky-400/30"
              : tinted
                ? "border-2"
                : "border-white/15 bg-white/5"
        }`}
      >
        {w && (w.shift || w.alt) && (
          <span className="absolute top-0 right-0.5 font-bold text-[9px] text-sky-200">
            {w.alt ? "Alt" : ""}
            {w.shift ? "⇧" : ""}
          </span>
        )}
        <span className={tinted ? "opacity-60" : "text-white/40"}>
          {codeLabel(code)}
        </span>
        <span className="font-semibold text-xs">
          {plain?.usable ? plain.label : ""}
        </span>
        <span className={tinted ? "opacity-70" : "text-white/50"}>
          {shift?.usable ? shift.label : ""}
        </span>
        <SweepBar look={paint} />
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-1" data-cube-keys>
      <div className="relative flex flex-col gap-1">
        {KEY_ROWS.map((row, i) => (
          <div
            key={row[0]}
            className="flex gap-1"
            style={{ paddingLeft: `${i * 2}%` }}
          >
            {row.map(cell)}
          </div>
        ))}
        {(keyPairs || keyFingers) && (
          <KeyOverlay
            keymap={keymap}
            n={n}
            orient={orient}
            pairs={keyPairs}
            fingers={keyFingers}
          />
        )}
      </div>
      <p className="mt-1 break-keep text-white/55 text-xs">
        {layers && (
          <span data-key-layers={`${layers.left}-${layers.right}`}>
            <b className="text-sky-300">{handLayersText(layers)}</b>
            {" (3·4 왼손, 7·8 오른손) · "}
          </span>
        )}
        배치 「{PRESET_LABEL[keymap.preset]}」
        {COMMAND_KEYS.map((c) => {
          const chords = chordsFor(keymap, c);
          if (chords.length === 0) return null;
          return (
            <span key={c}>
              {" · "}
              {chords.map(chordLabel).join("/")} {actionLabel(c)}
            </span>
          );
        })}
      </p>
    </div>
  );
}

/**
 * 키 그림 위에 옅게 겹치는 그림(SVG): 같은 면 두 키를 잇는 선(면 색), 가운데 줄 손가락 자리(손 색).
 * 칸 자리를 그려진 칸에서 재어 그린다. 누르기를 가로채지 않는다
 */
export function KeyOverlay({
  keymap,
  n,
  orient,
  pairs,
  fingers,
}: {
  keymap: Keymap;
  n: number;
  orient?: Orient | undefined;
  pairs: boolean;
  fingers: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const look = useKeyLook(n, orient);
  const { colors } = useCubeSettings();
  const [boxes, setBoxes] = useState<
    Record<string, { x: number; y: number; w: number; h: number }>
  >({});
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const svg = ref.current;
    const host = svg?.parentElement;
    if (!svg || !host) return;
    const measure = () => {
      const base = host.getBoundingClientRect();
      const out: Record<
        string,
        { x: number; y: number; w: number; h: number }
      > = {};
      for (const el of host.querySelectorAll<HTMLElement>("[data-key]")) {
        const r = el.getBoundingClientRect();
        out[el.dataset.key ?? ""] = {
          x: r.left - base.left,
          y: r.top - base.top,
          w: r.width,
          h: r.height,
        };
      }
      setBoxes(out);
      setSize({ w: base.width, h: base.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);
  const list = pairs ? facePairs(keymap) : [];
  return (
    <svg
      ref={ref}
      aria-hidden
      data-key-overlay
      className="pointer-events-none absolute inset-0 overflow-visible"
      width={size.w}
      height={size.h}
    >
      {list.map((p) => {
        const a = boxes[p.cw];
        const b = boxes[p.ccw];
        if (!a || !b) return null;
        const paint = look(p.face)?.paint;
        const color =
          paint?.kind === "face" ? hexColor(colors[paint.color] ?? 0) : "#fff";
        return (
          <path
            key={p.face}
            data-key-pair={`${p.face}:${p.cw}-${p.ccw}`}
            d={pairPath(a, b, 4)}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.75}
          />
        );
      })}
      {fingers &&
        FINGER_HOMES.map((f) => {
          const b = boxes[f.code];
          if (!b) return null;
          const color = f.hand === "left" ? "#38bdf8" : "#fbbf24";
          return (
            <g key={f.code} data-key-finger={`${f.hand}-${f.finger}`}>
              <title>
                {f.hand === "left" ? "왼" : "오른"} {f.finger}
              </title>
              <rect
                x={b.x + b.w * 0.22}
                y={b.y - 3}
                width={b.w * 0.56}
                height={7}
                rx={3.5}
                fill={color}
                opacity={0.45}
              />
            </g>
          );
        })}
    </svg>
  );
}
