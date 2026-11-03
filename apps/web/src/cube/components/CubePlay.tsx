"use client";

import type { CubeMove, StickerMask } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { useEffect, useMemo, useRef, useState } from "react";

import { useSettings } from "@/game/settings";
import { type Cue, play } from "@/game/sound";

import { faceGrid, stickersFromState } from "../bridge";
import {
  attachKeyboard,
  type Command,
  KeyInterpreter,
  type Keymap,
  type KeyResult,
  loadKeymap,
} from "../input";
import type { CubeSettings } from "../settings";
import { type CubeView, loadCubeView } from "../view";
import { CubeNet } from "./CubeNet";
import { KeyGuide } from "./KeyGuide";

/**
 * 큐브 한 판의 화면 조각(혼자 맞추기·블라인드·나중에 배우기·경주가 함께 쓴다).
 *
 * 엔진 상태가 기준이다. 키를 누르면 `onMove`가 엔진에 수를 넣고(그 순간이 시간 기준), 받아들였으면 이 조각이
 * 3D 장면에 같은 수를 넣어 따라 돌린다. 섞기·맞춘 상태로·가리기처럼 한꺼번에 바뀌면 부모가 `syncToken`을 바꿔
 * 장면을 엔진 상태로 다시 칠한다.
 */

const DEFAULT_VIEW = { yaw: 32, pitch: 26 };
const PEEK: Record<"peekBack" | "peekDown", { yaw: number; pitch: number }> = {
  peekBack: { yaw: 212, pitch: 26 },
  peekDown: { yaw: 32, pitch: -55 },
};

export function playCubeCue(settings: CubeSettings, cue: Cue): void {
  if (settings.sound && useSettings.getState().sound) play(cue);
}

export interface CubePlayProps {
  n: number;
  state: PuzzleState;
  mask: StickerMask | null;
  /** 바뀌면 장면을 `state`·`mask`로 다시 칠한다 */
  syncToken: number;
  settings: CubeSettings;
  /** 수 하나. 받아들였으면 true(장면이 따라 돈다) */
  onMove: (move: CubeMove, notation: string) => boolean;
  /** 명령. 되돌리기는 장면에 넣을 수를 돌려준다 */
  onCommand: (command: Command) => CubeMove | null | undefined;
  /** 키를 받지 않는다(섞기 준비 중, 다시 보기 중) */
  locked?: boolean;
  /** 장면이 준비되면 받는다(다시 보기처럼 장면을 직접 움직일 때) */
  onView?: (view: CubeView | null) => void;
}

export function CubePlay({
  n,
  state,
  mask,
  syncToken,
  settings,
  onMove,
  onCommand,
  locked = false,
  onView,
}: CubePlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<CubeView | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [keymap, setKeymap] = useState<Keymap | null>(null);
  const [lit, setLit] = useState<string | null>(null);
  const [depth, setDepth] = useState<number | null>(null);
  const [showKeys, setShowKeys] = useState(true);
  const [showNet, setShowNet] = useState(true);
  const [prime, setPrime] = useState(false);

  // 바뀌는 값은 ref로 넘겨 키 연결을 한 번만 건다
  const live = useRef({
    state,
    mask,
    settings,
    onMove,
    onCommand,
    locked,
    onView,
  });
  live.current = { state, mask, settings, onMove, onCommand, locked, onView };

  useEffect(() => setKeymap(loadKeymap()), []);
  const interpreter = useMemo(
    () => (keymap ? new KeyInterpreter(n, keymap) : null),
    [n, keymap],
  );
  const interpreterRef = useRef(interpreter);
  interpreterRef.current = interpreter;

  // 장면: 크기·품질이 바뀌면 다시 만든다
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
        view.setStickers(
          stickersFromState(n, live.current.state, live.current.mask),
        );
        viewRef.current = view;
        ro.observe(canvas);
        setReady(true);
        live.current.onView?.(view);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      ro.disconnect();
      live.current.onView?.(null);
      viewRef.current?.dispose();
      viewRef.current = null;
    };
  }, [n, quality]);

  useEffect(() => {
    viewRef.current?.setOptions({
      colors: settings.colors,
      stickerless: settings.stickerless,
      moveMs: settings.moveMs,
      hidden: settings.hidden,
    });
  }, [settings.colors, settings.stickerless, settings.moveMs, settings.hidden]);

  // 한꺼번에 바뀐 상태로 다시 칠하기
  // biome-ignore lint/correctness/useExhaustiveDependencies: syncToken이 바뀔 때만 다시 칠한다
  useEffect(() => {
    viewRef.current?.setStickers(
      stickersFromState(n, live.current.state, live.current.mask),
    );
  }, [syncToken, n]);

  /** 수·명령 하나를 처리한다(키보드와 화면 단추가 함께 쓴다) */
  const handleRef = useRef((r: KeyResult) => {
    const c = live.current;
    setDepth(interpreterRef.current?.pendingDepth ?? null);
    if (r.kind === "move") {
      if (!c.onMove(r.move, r.notation)) {
        playCubeCue(c.settings, "invalid");
        return;
      }
      viewRef.current?.enqueue(r.move);
      playCubeCue(c.settings, "cubeTurn");
      return;
    }
    if (r.kind !== "command") return;
    if (r.command === "peekBack" || r.command === "peekDown") {
      const p = PEEK[r.command];
      viewRef.current?.setView(p.yaw, p.pitch);
      return;
    }
    const m = c.onCommand(r.command);
    if (m) {
      viewRef.current?.enqueue(m);
      playCubeCue(c.settings, "cubeTurn");
    }
  });

  useEffect(() => {
    const flash = (code: string) => {
      setLit(code);
      window.setTimeout(() => setLit((c) => (c === code ? null : c)), 160);
    };
    const detach = attachKeyboard(
      window,
      () => {
        const it = interpreterRef.current;
        // 잠겨 있으면 아무 키도 먹지 않는 해석기를 넘긴다
        return it && !live.current.locked ? it : LOCKED;
      },
      (r, e) => {
        flash(e.code);
        handleRef.current(r);
      },
    );
    // 살짝 보기는 누르는 동안만
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code.startsWith("Arrow"))
        viewRef.current?.setView(DEFAULT_VIEW.yaw, DEFAULT_VIEW.pitch);
    };
    window.addEventListener("keyup", onKeyUp);
    return () => {
      detach();
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const tap = (base: string) => {
    if (locked || !interpreter) return;
    const r = interpreter.run(prime ? `${base}'` : base);
    if (r) handleRef.current(r);
  };

  const colors = settings.colors;
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="relative aspect-square w-full max-w-[460px]">
        {failed ? (
          <p className="p-6 text-center text-sm text-white/70">
            이 기기에서는 3D를 그릴 수 없습니다. 아래 펼친 그림을 보며 맞추세요.
          </p>
        ) : (
          <canvas
            key={`${n}-${quality}`}
            ref={canvasRef}
            data-cube-canvas
            data-cube-ready={ready ? "" : undefined}
            className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
          />
        )}
        {depth !== null && (
          <span className="absolute top-2 right-2 rounded bg-amber-400/90 px-2 py-0.5 font-semibold text-black text-xs">
            다음 수 깊이 {depth}
          </span>
        )}
        {(showNet || failed) && (
          <div className="absolute top-1 left-1 w-[30%] rounded-lg bg-black/45 p-1.5">
            <CubeNet
              n={n}
              faces={faceGrid(n, state, mask)}
              colors={colors}
              hidden={settings.hidden}
              className="h-auto w-full"
            />
          </div>
        )}
      </div>

      {/* 휴대폰·마우스용 표기 단추 줄 */}
      <div className="flex flex-wrap justify-center gap-1" data-cube-buttons>
        {["R", "L", "U", "D", "F", "B", "x", "y", "z"].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => tap(m)}
            className="h-9 w-9 rounded-lg bg-white/10 font-semibold text-sm hover:bg-white/20 active:bg-white/30"
          >
            {m}
            {prime ? "'" : ""}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={prime}
          onClick={() => setPrime((p) => !p)}
          className={`h-9 rounded-lg px-2 text-sm ${prime ? "bg-amber-400 text-black" : "bg-white/10"}`}
        >
          ′ 반대
        </button>
        <button
          type="button"
          onClick={() => {
            if (!locked)
              handleRef.current({
                kind: "command",
                action: "undo",
                command: "undo",
              });
          }}
          className="h-9 rounded-lg bg-white/10 px-2 text-sm"
        >
          되돌리기
        </button>
      </div>

      <div className="flex gap-3 text-white/60 text-xs">
        <button
          type="button"
          onClick={() => setShowKeys((v) => !v)}
          aria-expanded={showKeys}
          className="underline-offset-2 hover:underline"
        >
          {showKeys ? "키 그림 접기" : "키 그림 펴기"}
        </button>
        <button
          type="button"
          onClick={() => setShowNet((v) => !v)}
          aria-pressed={showNet}
          className="underline-offset-2 hover:underline"
        >
          {showNet ? "펼친 그림 숨기기" : "펼친 그림 보기"}
        </button>
        <a href="/cube/settings" className="underline-offset-2 hover:underline">
          키·색 설정
        </a>
      </div>
      {showKeys && keymap && (
        <div className="hidden w-full max-w-2xl sm:block">
          <KeyGuide n={n} keymap={keymap} lit={lit} />
        </div>
      )}
    </div>
  );
}

/** 잠겨 있을 때 쓰는 해석기: 어떤 키도 먹지 않는다 */
const LOCKED = {
  handle: () => null,
} as unknown as KeyInterpreter;
