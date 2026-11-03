"use client";

import { actionLabel, isAvailable } from "../input/actions";
import {
  chordLabel,
  chordsFor,
  codeLabel,
  type Keymap,
  PRESET_LABEL,
  resolveAction,
} from "../input/keymaps";

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

const key = (code: string, shift = false) => ({
  code,
  shiftKey: shift,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
});

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
}: {
  n: number;
  keymap: Keymap;
  /** 방금 누른 키(잠깐 빛난다) */
  lit: string | null;
}) {
  const cell = (code: string) => {
    const plain = resolveAction(keymap, key(code));
    const shift = resolveAction(keymap, key(code, true));
    const usable = (a: string | null): a is string =>
      a !== null && isAvailable(n, a);
    return (
      <div
        key={code}
        data-key={code}
        className={`flex h-10 min-w-0 flex-1 flex-col items-center justify-center rounded border text-[10px] leading-tight transition-colors ${
          lit === code
            ? "border-amber-300 bg-amber-300/30"
            : "border-white/15 bg-white/5"
        }`}
      >
        <span className="text-white/40">{codeLabel(code)}</span>
        <span className="font-semibold text-xs">
          {usable(plain) ? actionLabel(plain) : ""}
        </span>
        <span className="text-white/50">
          {usable(shift) ? actionLabel(shift) : ""}
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
        배치 「{PRESET_LABEL[keymap.preset]}」 · 흐린 글은 Shift와 함께
        {keymap.preset === "notation" ? " · Alt는 넓게(w)" : ""}
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
