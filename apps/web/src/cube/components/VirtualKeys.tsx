"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useRef,
  useState,
} from "react";

import type { KeyChord } from "../input/keymaps";

/**
 * 화면 키보드(2026-11-05 사용자 「폰으로도 할 수 있게 가상 키보드」). 키 그림의 칸을 누르면 진짜 키처럼 `window`에
 * `keydown`(떼면 `keyup`)을 보낸다. 그래서 혼자 맞추기·배우기·대결이 실제 키보드와 똑같은 길(해석기 → `onMove`)로
 * 받고, 사용자 키 배치도 그대로 따른다. Shift·Alt는 화면의 토글 키로 한 번 켜고, 다음 키를 치면 꺼진다(휴대폰 자판과 같음).
 * 누르는 순간(pointerdown)에 보내 빠르게 치고 두 손가락으로 함께 쳐도 빠지지 않는다. 키를 누르고 있는 동안은 눌린 채라
 * 살짝 보기(누르는 동안)도 같다.
 */

export interface VirtualMods {
  shift: boolean;
  alt: boolean;
}

const NONE: VirtualMods = { shift: false, alt: false };

/** 화면 키 하나를 보낸다(진짜 키와 같은 KeyboardEvent) */
export function sendKey(
  type: "keydown" | "keyup",
  chord: KeyChord,
  target: Pick<Window, "dispatchEvent"> = window,
): void {
  target.dispatchEvent(
    new KeyboardEvent(type, {
      code: chord.code,
      // 떼는 키는 조합 키도 뗀 상태로(진짜 키보드에서 Shift를 함께 뗀 것과 같게)
      shiftKey: type === "keydown" && !!chord.shift,
      altKey: type === "keydown" && !!chord.alt,
      ctrlKey: type === "keydown" && !!chord.ctrl,
      bubbles: true,
      cancelable: true,
    }),
  );
}

export interface VirtualKeys {
  mods: VirtualMods;
  toggle: (k: keyof VirtualMods) => void;
  /** 칸에 붙일 누르기 처리(`code` 키를 지금 켠 Shift·Alt와 함께) */
  keyProps: (code: string) => {
    onPointerDown: (e: ReactPointerEvent) => void;
    onPointerUp: (e: ReactPointerEvent) => void;
    onPointerCancel: (e: ReactPointerEvent) => void;
    onPointerLeave: (e: ReactPointerEvent) => void;
  };
  /** 조합이 정해진 키 하나(되돌리기 단추 등). 켠 Shift·Alt는 쓰지 않는다 */
  chordProps: (chord: KeyChord) => {
    onPointerDown: (e: ReactPointerEvent) => void;
    onPointerUp: (e: ReactPointerEvent) => void;
    onPointerCancel: (e: ReactPointerEvent) => void;
    onPointerLeave: (e: ReactPointerEvent) => void;
  };
}

export function useVirtualKeys(): VirtualKeys {
  const [mods, setMods] = useState<VirtualMods>(NONE);
  const live = useRef(mods);
  live.current = mods;
  /** 누르고 있는 손가락마다 보낸 키 */
  const held = useRef(new Map<number, KeyChord>());

  const down = useCallback((e: ReactPointerEvent, chord: KeyChord) => {
    // 초점·글 고르기·늦은 마우스 이벤트를 막는다(누른 칸이 초점을 받으면 Space·Enter가 칸을 누른다)
    e.preventDefault();
    if (e.button !== 0) return;
    held.current.set(e.pointerId, chord);
    sendKey("keydown", chord);
  }, []);
  const up = useCallback((e: ReactPointerEvent) => {
    const chord = held.current.get(e.pointerId);
    if (!chord) return;
    held.current.delete(e.pointerId);
    sendKey("keyup", chord);
  }, []);

  const handlers = useCallback(
    (onDown: (e: ReactPointerEvent) => void) => ({
      onPointerDown: onDown,
      onPointerUp: up,
      onPointerCancel: up,
      onPointerLeave: up,
    }),
    [up],
  );

  return {
    mods,
    toggle: (k) => setMods((m) => ({ ...m, [k]: !m[k] })),
    keyProps: (code) =>
      handlers((e) => {
        const m = live.current;
        down(e, {
          code,
          ...(m.shift ? { shift: true } : {}),
          ...(m.alt ? { alt: true } : {}),
        });
        if (m.shift || m.alt) setMods(NONE);
      }),
    chordProps: (chord) => handlers((e) => down(e, chord)),
  };
}

/** 화면 키 칸의 공통 모양: 누르는 동안 밝게, 두 번 눌러 확대·끌어 고르기를 막는다 */
export const PRESS_CLASS =
  "cursor-pointer touch-none select-none active:brightness-150";
