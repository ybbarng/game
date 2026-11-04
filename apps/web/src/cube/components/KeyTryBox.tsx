"use client";

import { useEffect, useRef, useState } from "react";

import { actionLabel, PRESET_LABEL, resolveAction } from "../input";
import { KeyGuide } from "./KeyGuide";
import { KeyCaps, useMoveKeys } from "./MoveChip";

/**
 * 처음 안내의 키 단계(docs/47 4-4): 지금 고른 키 배치(설정, 키 익히기 `/cube/keys/learn`과 같은 `loadKeymap`)로
 * 「R은 이 키」를 직접 쳐 본다. 칠 키가 키 그림에서 빛난다. 키보드가 없을 기기에는 보이지 않는다.
 */

const TARGETS = ["R", "R'", "U", "U'"] as const;

export function KeyTryBox() {
  const { keymap, keysOf } = useMoveKeys(3);
  const [at, setAt] = useState(0);
  const [miss, setMiss] = useState<string | null>(null);
  const live = useRef({ keymap, at });
  live.current = { keymap, at };

  const active = !!keysOf;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const { keymap: km, at: i } = live.current;
      if (!km || i >= TARGETS.length) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const action = resolveAction(km, e);
      if (action === null) return;
      e.preventDefault();
      if (action === TARGETS[i]) {
        setMiss(null);
        setAt(i + 1);
      } else setMiss(actionLabel(action));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  if (!keymap || !keysOf) return null;
  const target = TARGETS[at];
  return (
    <div
      className="flex flex-col gap-2 rounded-xl bg-black/25 p-3"
      data-intro-try={target ?? "done"}
    >
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="text-white/60 text-xs">
          지금 배치 「{PRESET_LABEL[keymap.preset]}」
        </span>
        {TARGETS.map((m, i) => (
          <span
            key={m}
            data-intro-try-move={m}
            className={
              i < at
                ? "rounded bg-emerald-500/40 px-1.5 py-0.5"
                : i === at
                  ? "rounded bg-amber-400 px-1.5 py-0.5 font-bold text-black"
                  : "rounded bg-white/5 px-1.5 py-0.5 text-white/60"
            }
          >
            <span className="mr-1 font-mono">{m}</span>
            <KeyCaps keys={keysOf(m)} link />
          </span>
        ))}
        <span
          role="status"
          className="text-white/70 text-xs"
          data-intro-try-status
        >
          {target === undefined
            ? "다 쳤어요"
            : miss
              ? `그 키는 ${miss}`
              : "노란 수의 키를 쳐 보세요"}
        </span>
      </p>
      <KeyGuide
        n={3}
        keymap={keymap}
        lit={null}
        want={target ? keysOf(target) : null}
      />
    </div>
  );
}
