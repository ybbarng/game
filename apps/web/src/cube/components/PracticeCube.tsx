"use client";

import {
  applyMove,
  type CubeMove,
  invertMove,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { stickersFromState } from "../bridge";
import {
  type KeyInput,
  KeyInterpreter,
  type Keymap,
  type KeyResult,
  notationToMove,
} from "../input";
import { readPracticeKey } from "../keys/practice-input";
import type { CubeSettings } from "../settings";
import { type CubeView, loadCubeView } from "../view";
import { playCubeCue } from "./CubePlay";
import { CubePosterPair } from "./CubePosterPair";

/**
 * 키 익히기·조작 훈련의 큐브(docs/47 4절). 혼자 맞추기의 `CubePlay`와 달리 키를 직접 받지 않고, 화면이 키를 해석해
 * 맞는지 본 뒤 `move`로 넣는다(틀린 키도 친 대로 돌아 무엇을 쳤는지 보인다). 3D를 못 그리면 그림 없이 돈다.
 */

export interface PracticeCube {
  n: number;
  state: PuzzleState;
  syncToken: number;
  onView: (view: CubeView | null) => void;
  move: (m: CubeMove) => void;
  undo: () => void;
  reset: () => void;
  scramble: () => void;
}

const FACES = ["R", "L", "U", "D", "F", "B"];
const SUFFIX = ["", "'", "2"];

export function usePracticeCube(
  n: number,
  settings: CubeSettings,
): PracticeCube {
  const [state, setState] = useState<PuzzleState>(() => solvedCube(n));
  const [syncToken, setSyncToken] = useState(0);
  const history = useRef<CubeMove[]>([]);
  const view = useRef<CubeView | null>(null);
  const live = useRef({ n, settings });
  live.current = { n, settings };

  // 크기가 바뀌면 맞춘 상태로
  useEffect(() => {
    history.current = [];
    setState(solvedCube(n));
    setSyncToken((t) => t + 1);
  }, [n]);

  const onView = useCallback((v: CubeView | null) => {
    view.current = v;
  }, []);

  const move = useCallback((m: CubeMove) => {
    history.current.push(m);
    setState((s) => applyMove(live.current.n, s, m));
    view.current?.enqueue(m);
    playCubeCue(live.current.settings, "cubeTurn");
  }, []);

  const undo = useCallback(() => {
    const m = history.current.pop();
    if (!m) return;
    const inv = invertMove(m);
    setState((s) => applyMove(live.current.n, s, inv));
    view.current?.enqueue(inv);
  }, []);

  const reset = useCallback(() => {
    history.current = [];
    setState(solvedCube(live.current.n));
    setSyncToken((t) => t + 1);
  }, []);

  const scramble = useCallback(() => {
    const size = live.current.n;
    let s = solvedCube(size);
    let last = "";
    for (let i = 0; i < 20; i++) {
      const pick = () =>
        FACES[Math.floor(Math.random() * FACES.length)] as string;
      let f = pick();
      while (f === last) f = pick();
      last = f;
      const m = notationToMove(
        size,
        `${f}${SUFFIX[Math.floor(Math.random() * 3)]}`,
      );
      if (m) s = applyMove(size, s, m);
    }
    history.current = [];
    setState(s);
    setSyncToken((t) => t + 1);
  }, []);

  return { n, state, syncToken, onView, move, undo, reset, scramble };
}

/** 3D 장면만(키·단추 없음) */
export function LiveCube({
  cube,
  settings,
  className,
}: {
  cube: PracticeCube;
  settings: CubeSettings;
  className?: string;
}) {
  const { n, state, syncToken, onView } = cube;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<CubeView | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const live = useRef({ state, settings, onView });
  live.current = { state, settings, onView };

  const quality = settings.quality;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    setReady(false);
    const ro = new ResizeObserver(() =>
      viewRef.current?.resize(canvas.clientWidth, canvas.clientHeight),
    );
    void loadCubeView()
      .then(({ CubeView }) => {
        if (disposed) return;
        const s = live.current.settings;
        const view = CubeView.create(canvas, {
          n,
          quality,
          colors: s.colors,
          stickerless: s.stickerless,
          moveMs: s.moveMs,
          hidden: s.hidden,
        });
        view.setStickers(stickersFromState(n, live.current.state, null));
        viewRef.current = view;
        ro.observe(canvas);
        setReady(true);
        live.current.onView(view);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      ro.disconnect();
      live.current.onView(null);
      viewRef.current?.dispose();
      viewRef.current = null;
    };
  }, [n, quality]);

  useEffect(() => {
    viewRef.current?.setOptions({
      colors: settings.colors,
      stickerless: settings.stickerless,
      moveMs: settings.moveMs,
    });
  }, [settings.colors, settings.stickerless, settings.moveMs]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: syncToken이 바뀔 때만 다시 칠한다
  useEffect(() => {
    viewRef.current?.setStickers(
      stickersFromState(n, live.current.state, null),
    );
  }, [syncToken, n]);

  return (
    <div className={className} data-practice-cube>
      {failed ? (
        <div data-cube-no3d className="flex flex-col items-center gap-2 p-2">
          <CubePosterPair
            n={n}
            state={state}
            settings={settings}
            className="w-full"
          />
          <p className="text-center text-white/50 text-xs">
            이 기기에서는 3D를 그릴 수 없어 그림으로 보여 드려요.
          </p>
        </div>
      ) : (
        <canvas
          key={`${n}-${quality}`}
          ref={canvasRef}
          data-cube-canvas
          data-cube-ready={ready ? "" : undefined}
          className="aspect-square h-auto w-full touch-none"
        />
      )}
    </div>
  );
}

export interface PracticeKey {
  input: KeyInput;
  result: KeyResult | null;
}

/**
 * 키 누름을 지금 배치로 해석해 넘긴다(규칙은 `readPracticeKey`). 글 입력 칸에 치는 중이면 건드리지 않는다.
 */
export function usePracticeKeys(
  n: number,
  keymap: Keymap | null,
  enabled: boolean,
  onKey: (k: PracticeKey) => void,
): KeyInterpreter | null {
  const interpreter = useMemo(
    () => (keymap ? new KeyInterpreter(n, keymap) : null),
    [n, keymap],
  );
  const live = useRef({ interpreter, enabled, onKey });
  live.current = { interpreter, enabled, onKey };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const c = live.current;
      if (!c.enabled || !c.interpreter) return;
      if (isTyping(e.target)) return;
      const interpreter = c.interpreter;
      const read = readPracticeKey(e, (input) => interpreter.handle(input));
      if (!read) return;
      if (read.prevent) e.preventDefault();
      c.onKey({ input: read.input, result: read.result });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return interpreter;
}

/** 키보드가 없을 기기(터치만 되는 휴대폰·태블릿). 첫 그림은 false */
export function useNoKeyboard(): boolean {
  const [no, setNo] = useState(false);
  useEffect(() => {
    try {
      setNo(
        window.matchMedia("(pointer: coarse)").matches &&
          !window.matchMedia("(any-pointer: fine)").matches,
      );
    } catch {
      setNo(false);
    }
  }, []);
  return no;
}

function isTyping(t: EventTarget | null): boolean {
  if (!t || typeof (t as HTMLElement).tagName !== "string") return false;
  const el = t as HTMLElement;
  if (el.tagName === "INPUT")
    return !["checkbox", "radio", "range", "button"].includes(
      (el as HTMLInputElement).type,
    );
  return (
    el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT"
  );
}
