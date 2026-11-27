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
import { type StickerMarks, stickersFromState } from "../bridge";
import { algTokens } from "../learn/notation";
import type { BackView, CubeSettings } from "../settings";
import { type CubeView, loadCubeView } from "../view";
import { CubePosterPair } from "./CubePosterPair";
import { KeyCaps, useMoveKeys } from "./MoveChip";
import { StageBox, useBackView } from "./StageBox";
import { ViewHome } from "./ViewHome";

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
  /** 칸 표시(스티커 정체마다, 배우기의 쥐는 기준 조각). 조각을 따라 돈다 */
  marks?: StickerMarks | null;
  /**
   * 수마다 다시 정하는 칸 표시(배우기의 넣을 자리 고리처럼 층을 돌려도 자리에 남는 것, `learn/focus.ts`). 있으면
   * `marks` 대신 쓴다
   */
  marksAt?: ((state: PuzzleState) => StickerMarks | null) | undefined;
  /**
   * 쥐는 법 차례(2026-11-27 사용자 「내가 무엇을 맞추고 싶은지를 먼저 정하고 그것이 들어갈 위치를 살펴보고」): 있으면 수
   * 앞에 「맞출 조각」(이 표시)과 「들어갈 자리」(`marksAt`·`marks`) 두 칸을 두고 그 차례로 고리를 옮긴 뒤 수를 둔다
   */
  pick?: StickerMarks | null;
  /**
   * 뒷면 보기. 배우기는 해 보기 큐브와 같은 거울 판을 단다(`lessonBackView`, docs/47 16-37). 기본은 끔
   * (핑거 트릭·패턴·십자 훈련의 시연은 그대로)
   */
  backView?: BackView;
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
  marks = null,
  marksAt,
  pick = null,
  backView = "off",
}: DemoCubeProps) {
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const { keysOf } = useMoveKeys(n);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<CubeView | null>(null);
  const [failed, setFailed] = useState(false);
  /** 3D 장면을 만들었다(화면 시험이 3D 길을 확인하는 표시) */
  const [ready, setReady] = useState(false);
  /**
   * 보이는 칸(frame). 「맞출 조각」 칸이 있으면(pre 1) 0번이 그 칸, 1번이 시작 상태(「들어갈 자리」), 그 뒤가 수마다.
   * 없으면 0번이 시작 상태
   */
  const [frame, setFrame] = useState(0);
  const pre = pick ? 1 : 0;
  const index = Math.max(0, frame - pre);
  const [playing, setPlaying] = useState(autoPlay);
  const back = useBackView(backView, !failed);
  const mirror = back.mode === "mirror";
  useEffect(() => {
    if (ready) viewRef.current?.setMirror(mirror);
  }, [mirror, ready]);

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

  /** 그 칸의 표시 */
  const marksOf = useCallback(
    (f: number): StickerMarks | null => {
      if (f < pre) return pick;
      const s = states[Math.max(0, f - pre)] as PuzzleState;
      return marksAt ? marksAt(s) : marks;
    },
    [pre, pick, states, marksAt, marks],
  );
  const live = useRef({ states, mask, frame, marksOf, pre });
  live.current = { states, mask, frame, marksOf, pre };

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
          onLost: () => setFailed(true),
          n,
          quality: settings.quality,
          colors: settings.colors,
          stickerless: settings.stickerless,
          moveMs,
          hidden: settings.hidden,
        });
        const c = live.current;
        view.setStickers(
          stickersFromState(
            n,
            c.states[Math.max(0, c.frame - c.pre)] as PuzzleState,
            c.mask,
            c.marksOf(c.frame),
          ),
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
    setFrame(0);
    viewRef.current?.setStickers(
      stickersFromState(n, states[0] as PuzzleState, mask, marksOf(0)),
    );
  }, [n, states, mask, marksOf]);

  const goTo = useCallback(
    (to: number) => {
      const c = live.current;
      const lastFrame = c.states.length - 1 + pre;
      const f = Math.max(0, Math.min(lastFrame, to));
      const from = Math.max(0, c.frame - pre);
      const i = Math.max(0, f - pre);
      const view = viewRef.current;
      if (view) {
        if (i === from + 1) {
          for (const m of moves[from] ?? []) view.enqueue(m);
          view.setMarks(c.marksOf(f));
        } else if (i === from) {
          view.setMarks(c.marksOf(f));
        } else {
          view.flush();
          view.setStickers(
            stickersFromState(
              n,
              c.states[i] as PuzzleState,
              c.mask,
              c.marksOf(f),
            ),
          );
        }
      }
      setFrame(f);
      if (f === lastFrame && i > 0) onEndRef.current?.();
    },
    [n, moves, pre],
  );

  const last = states.length - 1 + pre;
  // 재생
  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(
      () => {
        if (frame < last) goTo(frame + 1);
        else if (loop) goTo(0);
        else setPlaying(false);
      },
      frame < last ? 1000 / tps : 1200,
    );
    return () => window.clearTimeout(id);
  }, [playing, frame, last, tps, loop, goTo]);

  useEffect(() => {
    if (!arrowKeys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goTo(live.current.frame + 1);
      else if (e.key === "ArrowLeft") goTo(live.current.frame - 1);
      else return;
      e.preventDefault();
      setPlaying(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [arrowKeys, goTo]);

  const current = states[index] as PuzzleState;
  /** 쥐는 법 차례의 칸 둘(맞출 조각 → 들어갈 자리). 지금 칸이 그 칸이면 밝게 */
  const cues = pick
    ? [
        { label: "맞출 조각", at: 0 },
        { label: "들어갈 자리", at: 1 },
      ]
    : [];
  return (
    <div className="flex w-full flex-col items-center gap-2" data-cube-demo>
      <StageBox
        boxRef={back.ref}
        // 거울이면 판까지 들이도록 넓힌다(StillCube와 같은 폭)
        maxWidth={mirror ? 440 : 360}
        stage={
          <div className="relative aspect-square w-full">
            {failed ? (
              <div data-cube-no3d className="flex h-full items-center p-2">
                <CubePosterPair
                  n={n}
                  state={current}
                  mask={mask}
                  marks={marksOf(frame)}
                  settings={settings}
                  className="w-full"
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
            {!failed && <ViewHome viewRef={viewRef} ready={ready} />}
          </div>
        }
      />
      <ol
        className="flex flex-wrap justify-center gap-1 font-mono text-sm"
        data-demo-index={index}
      >
        {cues.map((c) => (
          <li key={c.label}>
            <button
              type="button"
              data-demo-cue={c.at === 0 ? "pick" : "slot"}
              onClick={() => {
                setPlaying(false);
                goTo(c.at);
              }}
              aria-current={frame === c.at ? "step" : undefined}
              className={cn(
                "flex min-h-9 items-center rounded-md px-2 py-0.5 font-sans",
                frame === c.at
                  ? "bg-amber-400 font-bold text-black"
                  : frame > c.at
                    ? "bg-white/15 text-white/70"
                    : "bg-white/5 text-white",
              )}
            >
              {c.label}
            </button>
          </li>
        ))}
        {tokens.map((t, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 되풀이된다
          <li key={`${i}-${t}`}>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                goTo(i + 1 + pre);
              }}
              aria-current={i === frame - pre - 1 ? "step" : undefined}
              className={cn(
                "flex min-w-9 flex-col items-center rounded-md px-1.5 py-0.5",
                i === frame - pre - 1
                  ? "bg-amber-400 font-bold text-black"
                  : i < frame - pre
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
          disabled={frame === 0}
          onClick={() => {
            setPlaying(false);
            goTo(frame - 1);
          }}
        >
          ◀ 한 수 뒤
        </DemoButton>
        <DemoButton
          primary
          onClick={() => {
            if (!playing && frame === last) goTo(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? "⏸ 멈춤" : "▶ 재생"}
        </DemoButton>
        <DemoButton
          disabled={frame === last}
          onClick={() => {
            setPlaying(false);
            goTo(frame + 1);
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
