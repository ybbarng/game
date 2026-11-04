"use client";

import {
  applyMoves,
  type CubeMove,
  parseMoves,
  type StickerMask,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { faceGrid, stickersFromState } from "../bridge";
import { algTokens } from "../learn";
import type { CubeSettings } from "../settings";
import { type CubeView, loadCubeView } from "../view";
import { CubeNet } from "./CubeNet";
import { KeyCaps, useMoveKeys } from "./MoveChip";

/**
 * 시연 큐브(배우기·핑거 트릭). 시작 상황에서 공식을 한 수씩 앞뒤로 돌려 보이고, 지금 수를 강조한다.
 * 키는 받지 않는다(같은 화면에 키로 돌리는 큐브가 없을 때만 ←·→로 한 수씩).
 */
export interface DemoCubeProps {
  n: number;
  start: PuzzleState;
  alg: string;
  mask: StickerMask | null;
  settings: CubeSettings;
  /** 재생 빠르기(초당 수). 기본 1.2 */
  tps?: number;
  /** 열자마자 재생 */
  autoPlay?: boolean;
  /** 끝나면 처음부터 다시 */
  loop?: boolean;
  /** 수 아래에 붙일 글(손가락 표기) */
  labels?: readonly string[];
  /** ←·→ 키로 한 수씩 */
  arrowKeys?: boolean;
  /** 수 아래에 그 사람의 키 배치 키캡(기본 켬. 실물 큐브 핑거 트릭은 끈다) */
  showKeys?: boolean;
  /** 재생이 끝까지 가면(배우기: 「이제 해 보세요」로 넘긴다) */
  onEnd?: () => void;
}

export function DemoCube({
  n,
  start,
  alg,
  mask,
  settings,
  tps = 1.2,
  autoPlay = false,
  loop = false,
  labels,
  arrowKeys = false,
  showKeys = true,
  onEnd,
}: DemoCubeProps) {
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const { keysOf } = useMoveKeys(n);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<CubeView | null>(null);
  const [failed, setFailed] = useState(false);
  /** 3D 장면을 만들었다(화면 시험이 3D 길을 확인하는 표시) */
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);

  const tokens = useMemo(() => algTokens(alg), [alg]);
  const moves = useMemo<CubeMove[][]>(
    () => tokens.map((t) => parseMoves(n, t)),
    [n, tokens],
  );
  const states = useMemo(() => {
    const out = [start];
    let s = start;
    for (const m of moves) {
      s = applyMoves(n, s, m);
      out.push(s);
    }
    return out;
  }, [n, start, moves]);

  const live = useRef({ states, mask, index });
  live.current = { states, mask, index };

  const moveMs = Math.min(200, Math.round(600 / tps));
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    const ro = new ResizeObserver(() =>
      viewRef.current?.resize(canvas.clientWidth, canvas.clientHeight),
    );
    void loadCubeView()
      .then(({ CubeView }) => {
        if (disposed) return;
        const view = CubeView.create(canvas, {
          n,
          quality: settings.quality,
          colors: settings.colors,
          stickerless: settings.stickerless,
          moveMs,
          hidden: settings.hidden,
        });
        const c = live.current;
        view.setStickers(
          stickersFromState(n, c.states[c.index] as PuzzleState, c.mask),
        );
        viewRef.current = view;
        ro.observe(canvas);
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      ro.disconnect();
      viewRef.current?.dispose();
      viewRef.current = null;
    };
  }, [
    n,
    moveMs,
    settings.quality,
    settings.colors,
    settings.stickerless,
    settings.hidden,
  ]);

  // 상황·공식·가리기가 바뀌면 처음으로
  useEffect(() => {
    setIndex(0);
    viewRef.current?.setStickers(
      stickersFromState(n, states[0] as PuzzleState, mask),
    );
  }, [n, states, mask]);

  const goTo = useCallback(
    (to: number) => {
      const c = live.current;
      const last = c.states.length - 1;
      const i = Math.max(0, Math.min(last, to));
      const view = viewRef.current;
      if (view) {
        if (i === c.index + 1) {
          for (const m of moves[c.index] ?? []) view.enqueue(m);
        } else {
          view.flush();
          view.setStickers(
            stickersFromState(n, c.states[i] as PuzzleState, c.mask),
          );
        }
      }
      setIndex(i);
      if (i === last && i > 0) onEndRef.current?.();
    },
    [n, moves],
  );

  // 재생
  useEffect(() => {
    if (!playing) return;
    const last = states.length - 1;
    const id = window.setTimeout(
      () => {
        if (index < last) goTo(index + 1);
        else if (loop) goTo(0);
        else setPlaying(false);
      },
      index < last ? 1000 / tps : 1200,
    );
    return () => window.clearTimeout(id);
  }, [playing, index, states.length, tps, loop, goTo]);

  useEffect(() => {
    if (!arrowKeys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goTo(live.current.index + 1);
      else if (e.key === "ArrowLeft") goTo(live.current.index - 1);
      else return;
      e.preventDefault();
      setPlaying(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [arrowKeys, goTo]);

  const last = states.length - 1;
  const current = states[index] as PuzzleState;
  return (
    <div className="flex w-full flex-col items-center gap-2" data-cube-demo>
      <div className="relative aspect-square w-full max-w-[360px]">
        {failed ? (
          <div data-cube-no3d className="flex h-full items-center p-4">
            <CubeNet
              n={n}
              faces={faceGrid(n, current, mask)}
              colors={settings.colors}
              hidden={settings.hidden}
              className="h-auto w-full"
            />
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            data-cube-canvas
            data-cube-ready={ready ? "" : undefined}
            className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
          />
        )}
      </div>
      <ol
        className="flex flex-wrap justify-center gap-1 font-mono text-sm"
        data-demo-index={index}
      >
        {tokens.map((t, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 되풀이된다
          <li key={`${i}-${t}`}>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                goTo(i + 1);
              }}
              aria-current={i === index - 1 ? "step" : undefined}
              className={cn(
                "flex min-w-9 flex-col items-center rounded-md px-1.5 py-0.5",
                i === index - 1
                  ? "bg-amber-400 font-bold text-black"
                  : i < index
                    ? "bg-white/15 text-white/70"
                    : "bg-white/5 text-white",
              )}
            >
              <span data-move-chip={t}>{t}</span>
              {showKeys && keysOf && <KeyCaps keys={keysOf(t)} />}
              {labels?.[i] && (
                <span className="font-sans text-[10px] opacity-75">
                  {labels[i]}
                </span>
              )}
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap justify-center gap-1.5 text-sm">
        <DemoButton
          onClick={() => {
            setPlaying(false);
            goTo(0);
          }}
        >
          ⏮ 처음으로
        </DemoButton>
        <DemoButton
          disabled={index === 0}
          onClick={() => {
            setPlaying(false);
            goTo(index - 1);
          }}
        >
          ◀ 한 수 뒤
        </DemoButton>
        <DemoButton
          primary
          onClick={() => {
            if (!playing && index === last) goTo(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? "⏸ 멈춤" : "▶ 재생"}
        </DemoButton>
        <DemoButton
          disabled={index === last}
          onClick={() => {
            setPlaying(false);
            goTo(index + 1);
          }}
        >
          한 수 앞 ▶
        </DemoButton>
      </div>
    </div>
  );
}

function DemoButton({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg px-3 py-1.5 disabled:opacity-40",
        primary
          ? "bg-sky-500 font-semibold text-black"
          : "bg-white/10 hover:bg-white/15",
      )}
    >
      {children}
    </button>
  );
}
