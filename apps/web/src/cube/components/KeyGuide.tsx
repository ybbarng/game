"use client";

import { actionLabel } from "../input/actions";
import {
  chordLabel,
  chordsFor,
  codeLabel,
  type KeyChord,
  type Keymap,
  PRESET_LABEL,
} from "../input/keymaps";
import { keyLayers } from "../keys/layout";

/** 키 그림(지금 배치). 칸의 굵은 글은 그냥 칠 때, 흐린 글은 Shift와 함께 칠 때 */

const KEY_ROWS = [
  ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7"],
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
}: {
  n: number;
  keymap: Keymap;
  /** 방금 누른 키(잠깐 빛난다) */
  lit: string | null;
  /** 칠 키(배우기 힌트·따라 하기 단계의 다음 수). Shift·Alt와 함께 칠 키는 칸에 ⇧·Alt를 붙인다 */
  want?: readonly KeyChord[] | null | undefined;
}) {
  const cell = (code: string) => {
    const { plain, shift } = keyLayers(keymap, n, code);
    const w = want?.find((c) => c.code === code);
    return (
      <div
        key={code}
        data-key={code}
        data-key-want={w ? "" : undefined}
        className={`relative flex h-10 min-w-0 flex-1 flex-col items-center justify-center rounded border text-[10px] leading-tight transition-colors ${
          lit === code
            ? "border-amber-300 bg-amber-300/30"
            : w
              ? "border-sky-300 bg-sky-400/30"
              : "border-white/15 bg-white/5"
        }`}
      >
        {w && (w.shift || w.alt) && (
          <span className="absolute top-0 right-0.5 font-bold text-[9px] text-sky-200">
            {w.alt ? "Alt" : ""}
            {w.shift ? "⇧" : ""}
          </span>
        )}
        <span className="text-white/40">{codeLabel(code)}</span>
        <span className="font-semibold text-xs">
          {plain?.usable ? plain.label : ""}
        </span>
        <span className="text-white/50">
          {shift?.usable ? shift.label : ""}
        </span>
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-1" data-cube-keys>
      {KEY_ROWS.map((row, i) => (
        <div
          key={row[0]}
          className="flex gap-1"
          style={{ paddingLeft: `${i * 2}%` }}
        >
          {row.map(cell)}
        </div>
      ))}
      <p className="mt-1 break-keep text-white/55 text-xs">
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
