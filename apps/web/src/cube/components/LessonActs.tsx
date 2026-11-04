"use client";

import {
  applyMove,
  type CubeMove,
  invertMove,
  isRotation,
  type StickerMask,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { faceGrid, stickersFromState } from "../bridge";
import type { Command } from "../input";
import {
  algTokens as algTokensOf,
  type Lesson,
  type LessonStep,
} from "../learn";
import {
  findHit,
  lookMet,
  pieceAtSticker,
  pieceName,
  revealFound,
  slotCenterColors,
  stickerAtHit,
  turnProgress,
} from "../learn/interact";
import type { CubeSettings } from "../settings";
import { type CubeView, loadCubeView } from "../view";
import { CubeNet } from "./CubeNet";
import { CubePlay, playCubeCue } from "./CubePlay";
import { MoveChip, useMoveKeys } from "./MoveChip";
import { StageWithNet } from "./StageWithNet";

/**
 * 배우기 단계의 상호작용(docs/47 8-1): 정지 그림(글), 조각 찾기, 고르기 문제, 둘러보기, 한 수 해 보기.
 * 판정은 모두 `learn/interact.ts`의 순수 함수가 한다.
 */

const COLOR_NAME = ["흰", "빨강", "초록", "노랑", "주황", "파랑"];

/** 정지한 큐브(돌리지 않음). 끌면 보는 각만 바뀌고, `onSticker`가 있으면 누른 칸을 알린다 */
export function StillCube({
  n,
  state,
  mask,
  settings,
  onSticker,
  marked,
}: {
  n: number;
  state: PuzzleState;
  mask: StickerMask | null;
  settings: CubeSettings;
  onSticker?: (sticker: number) => void;
  marked?: ReadonlySet<number>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<CubeView | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const live = useRef({ state, mask, onSticker });
  live.current = { state, mask, onSticker };

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
        const view = CubeView.create(canvas, {
          n,
          quality: settings.quality,
          colors: settings.colors,
          stickerless: settings.stickerless,
          hidden: settings.hidden,
          onTap: (hit) => {
            const i = stickerAtHit(n, hit.center, hit.normal);
            if (i !== null) live.current.onSticker?.(i);
          },
        });
        view.setStickers(
          stickersFromState(n, live.current.state, live.current.mask),
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
    settings.quality,
    settings.colors,
    settings.stickerless,
    settings.hidden,
  ]);

  useEffect(() => {
    viewRef.current?.setStickers(stickersFromState(n, state, mask));
  }, [n, state, mask]);

  const net = (
    <CubeNet
      n={n}
      faces={faceGrid(n, state, mask)}
      colors={settings.colors}
      hidden={settings.hidden}
      className="h-auto w-full"
      onCell={onSticker}
      marked={marked}
    />
  );
  return (
    <div className="flex w-full flex-col items-center gap-2" data-cube-still>
      {failed ? (
        <div
          data-cube-no3d
          className="flex aspect-square w-full max-w-[360px] items-center p-4"
        >
          {net}
        </div>
      ) : (
        <StageWithNet
          maxWidth={360}
          // 뒤쪽 칸도 고를 수 있게 펼친 그림을 곁에 둔다
          net={net}
          stage={
            <div className="relative aspect-square w-full">
              <canvas
                ref={canvasRef}
                data-cube-canvas
                data-cube-ready={ready ? "" : undefined}
                className={cn(
                  "h-full w-full touch-none",
                  onSticker
                    ? "cursor-pointer"
                    : "cursor-grab active:cursor-grabbing",
                )}
              />
            </div>
          }
        />
      )}
      <p className="text-white/50 text-xs">
        {onSticker
          ? "큐브나 펼친 그림에서 칸을 눌러요. 끌면 둘러볼 수 있어요."
          : "끌면 큐브를 둘러볼 수 있어요."}
      </p>
    </div>
  );
}

/** 결과 알림 한 줄 */
function Status({
  passed,
  children,
}: {
  passed: boolean;
  children: React.ReactNode;
}) {
  return (
    <p
      role="status"
      data-act-pass={passed ? "" : undefined}
      className={cn(
        "min-h-7 rounded-full px-4 py-1 text-center text-sm",
        passed
          ? "border border-emerald-400/50 bg-emerald-400/15 font-bold text-emerald-300"
          : "text-white/70",
      )}
    >
      {children}
    </p>
  );
}

// ── 조각 찾기 ────────────────────────────────────────────

export function FindPanel({
  lesson,
  step,
  start,
  mask,
  settings,
  onPassed,
}: {
  lesson: Lesson;
  step: LessonStep;
  start: PuzzleState;
  mask: StickerMask | null;
  settings: CubeSettings;
  onPassed: () => void;
}) {
  const n = lesson.size;
  const target = step.find ?? {};
  const need = step.count ?? 1;
  const [found, setFound] = useState<number[]>([]);
  const [miss, setMiss] = useState<string | null>(null);
  const passed = found.length >= need;

  const marked = useMemo(() => {
    const out = new Set<number>();
    if (found.length === 0) return out;
    for (let i = 0; i < 6 * n * n; i++) {
      const p = pieceAtSticker(n, start, i);
      if (p && found.includes(p.piece)) out.add(i);
    }
    return out;
  }, [found, n, start]);
  // 가린 큐브에서 찾은 조각은 3D·펼친 그림 모두 색을 드러낸다
  const shown = useMemo(
    () => revealFound(n, start, mask, found),
    [n, start, mask, found],
  );

  const onSticker = (sticker: number) => {
    if (passed) return;
    const hit = findHit(n, start, sticker, target);
    if (hit === null) {
      const p = pieceAtSticker(n, start, sticker);
      // 자리 찾기는 조각 대신 그 자리가 어느 가운데 사이인지 알린다
      const slot = target.at ? slotCenterColors(n, start, sticker) : [];
      setMiss(
        slot.length > 1
          ? `그 자리는 ${slot.map((c) => COLOR_NAME[c]).join("·")} 가운데 사이예요. 다시 찾아보세요.`
          : p
            ? `그건 ${p.colors.map((c) => COLOR_NAME[c]).join("-")} ${pieceName(p.type)}이에요. 다시 찾아보세요.`
            : "다시 찾아보세요.",
      );
      playCubeCue(settings, "invalid");
      return;
    }
    setMiss(null);
    if (found.includes(hit)) {
      setMiss("이미 찾은 조각이에요. 다른 것도 찾아보세요.");
      return;
    }
    const next = [...found, hit];
    setFound(next);
    playCubeCue(settings, next.length >= need ? "cubeSolved" : "cubeTurn");
    if (next.length >= need) onPassed();
  };

  return (
    <div
      className="flex flex-col items-center gap-2"
      data-act="find"
      data-act-passed={passed ? "" : undefined}
    >
      <Status passed={passed}>
        {passed
          ? "찾았어요!"
          : (miss ??
            (need > 1
              ? `찾은 조각 ${found.length}/${need}`
              : "칸을 눌러 보세요"))}
      </Status>
      <StillCube
        n={n}
        state={start}
        mask={shown}
        settings={settings}
        onSticker={onSticker}
        marked={marked}
      />
    </div>
  );
}

// ── 고르기 문제 ──────────────────────────────────────────

export function QuizPanel({
  lesson,
  step,
  start,
  mask,
  settings,
  onPassed,
}: {
  lesson: Lesson;
  step: LessonStep;
  start: PuzzleState;
  mask: StickerMask | null;
  settings: CubeSettings;
  onPassed: () => void;
}) {
  const quiz = step.quiz;
  const [choice, setChoice] = useState<number | null>(null);
  if (!quiz) return null;
  const right = choice === quiz.answer;
  return (
    <div
      className="flex flex-col items-center gap-3"
      data-act="quiz"
      data-act-passed={right ? "" : undefined}
    >
      <StillCube
        n={lesson.size}
        state={start}
        mask={mask}
        settings={settings}
      />
      <div
        className="flex w-full max-w-md flex-col gap-2 rounded-xl bg-black/25 p-3"
        data-learn-quiz
      >
        <p className="break-keep font-semibold text-sm">{quiz.question}</p>
        {quiz.choices.map((c, i) => (
          <button
            key={c}
            type="button"
            data-choice={i}
            onClick={(e) => {
              setChoice(i);
              e.currentTarget.blur();
              if (i === quiz.answer) {
                playCubeCue(settings, "cubeSolved");
                if (!right) onPassed();
              } else playCubeCue(settings, "invalid");
            }}
            className={cn(
              "break-keep rounded-lg px-3 py-2 text-left text-sm",
              choice === i
                ? i === quiz.answer
                  ? "bg-emerald-500/30"
                  : "bg-red-500/30"
                : "bg-white/5 hover:bg-white/10",
            )}
          >
            {c}
          </button>
        ))}
        {choice !== null && (
          <p
            role="status"
            data-act-pass={right ? "" : undefined}
            className="break-keep text-white/80 text-xs"
          >
            {right
              ? `맞아요! ${quiz.why}`
              : "아쉬워요. 그림을 다시 보고 골라 보세요."}
          </p>
        )}
      </div>
    </div>
  );
}

// ── 큐브를 직접 돌리는 단계(둘러보기·한 수 해 보기)의 공통 상태 ──────────

function usePlay(n: number, start: PuzzleState) {
  const [state, setState] = useState(start);
  const [syncToken, setSyncToken] = useState(0);
  const live = useRef({ state, history: [] as CubeMove[] });

  const restart = useCallback(() => {
    live.current = { state: start, history: [] };
    setState(start);
    setSyncToken((t) => t + 1);
  }, [start]);

  // 상황이 바뀌면(가리기 등) 처음으로
  useEffect(() => restart(), [restart]);

  const push = useCallback(
    (m: CubeMove) => {
      const c = live.current;
      c.state = applyMove(n, c.state, m);
      c.history = [...c.history, m];
      setState(c.state);
      return c.state;
    },
    [n],
  );

  const onCommand = useCallback(
    (cmd: Command): CubeMove | null => {
      const c = live.current;
      if (cmd === "undo") {
        const last = c.history.at(-1);
        if (!last) return null;
        const back = invertMove(last);
        c.state = applyMove(n, c.state, back);
        c.history = c.history.slice(0, -1);
        setState(c.state);
        return back;
      }
      if (cmd === "reset" || cmd === "scramble") restart();
      return null;
    },
    [n, restart],
  );

  return { state, syncToken, push, onCommand, restart, live };
}

// ── 둘러보기 ────────────────────────────────────────────

export function LookPanel({
  lesson,
  step,
  start,
  mask,
  settings,
  onPassed,
}: {
  lesson: Lesson;
  step: LessonStep;
  start: PuzzleState;
  mask: StickerMask | null;
  settings: CubeSettings;
  onPassed: () => void;
}) {
  const n = lesson.size;
  const play = usePlay(n, start);
  const [passed, setPassed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const live = useRef({ passed, onPassed, settings });
  live.current = { passed, onPassed, settings };

  const onMove = useCallback(
    (m: CubeMove) => {
      // 둘러보기는 큐브 전체 돌리기만(층은 돌리지 않는다)
      if (!isRotation(n, m)) {
        setBlocked(true);
        return false;
      }
      setBlocked(false);
      const s = play.push(m);
      const ok = step.look ? lookMet(n, s, step.look) : true;
      if (ok && !live.current.passed) {
        setPassed(true);
        playCubeCue(live.current.settings, "cubeSolved");
        live.current.onPassed();
      }
      return true;
    },
    [n, play, step.look],
  );

  return (
    <div
      className="flex flex-col items-center gap-2"
      data-act="look"
      data-act-passed={passed ? "" : undefined}
    >
      <Status passed={passed}>
        {passed
          ? "잘했어요!"
          : blocked
            ? "여기서는 층을 돌리지 않아요. x·y·z나 빈 곳을 밀어 큐브 전체를 돌려 보세요."
            : "x·y·z(또는 빈 곳 밀기)로 큐브 전체를 돌려 보세요."}
      </Status>
      <CubePlay
        n={n}
        state={play.state}
        mask={mask}
        syncToken={play.syncToken}
        settings={settings}
        onMove={onMove}
        onCommand={play.onCommand}
      />
    </div>
  );
}

// ── 한 수 해 보기 ────────────────────────────────────────

export function TurnPanel({
  n,
  start,
  alg,
  mask,
  settings,
  onPassed,
}: {
  n: number;
  start: PuzzleState;
  alg: string;
  mask: StickerMask | null;
  settings: CubeSettings;
  onPassed: () => void;
}) {
  const play = usePlay(n, start);
  const [passed, setPassed] = useState(false);
  const tokens = useMemo(() => algTokensOf(alg), [alg]);
  const progress = useMemo(
    () => turnProgress(n, start, alg, play.state),
    [n, start, alg, play.state],
  );
  const live = useRef({ passed, onPassed, settings });
  live.current = { passed, onPassed, settings };
  // 칠 수(노란 칸)의 키를 칩과 키 그림에 함께 보인다
  const { keysOf } = useMoveKeys(n);
  const next = !passed ? tokens[progress.step] : undefined;
  const want = next && keysOf ? keysOf(next) : null;

  const onMove = useCallback(
    (m: CubeMove) => {
      const s = play.push(m);
      if (!live.current.passed && turnProgress(n, start, alg, s).done) {
        setPassed(true);
        playCubeCue(live.current.settings, "cubeSolved");
        live.current.onPassed();
      }
      return true;
    },
    [n, play, start, alg],
  );

  return (
    <div
      className="flex flex-col items-center gap-2"
      data-act="turn"
      data-act-passed={passed ? "" : undefined}
    >
      <ol className="flex flex-wrap justify-center gap-1 font-mono text-sm">
        {tokens.map((t, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 되풀이된다
            key={`${i}-${t}`}
            className={cn(
              "min-w-9 rounded-md px-1.5 py-0.5 text-center",
              i < progress.step
                ? "bg-emerald-500/40 text-white"
                : i === progress.step
                  ? "bg-amber-400 font-bold text-black"
                  : "bg-white/5",
            )}
          >
            <MoveChip
              notation={t}
              keysOf={i === progress.step && !passed ? keysOf : null}
            />
          </li>
        ))}
      </ol>
      <Status passed={passed}>
        {passed
          ? "잘했어요! 같은 모양이 됐어요."
          : progress.step < 0
            ? "공식과 다른 모양이 됐어요. 되돌리기나 「처음 상황으로」로 다시 해 보세요."
            : "노란 칸의 수를 직접 쳐 보세요."}
      </Status>
      <button
        type="button"
        onClick={(e) => {
          play.restart();
          setPassed(false);
          e.currentTarget.blur();
        }}
        className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
      >
        처음 상황으로
      </button>
      <CubePlay
        n={n}
        state={play.state}
        mask={mask}
        syncToken={play.syncToken}
        settings={settings}
        onMove={onMove}
        onCommand={play.onCommand}
        want={want}
      />
    </div>
  );
}
