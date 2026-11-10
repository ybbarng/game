"use client";

import {
  applyMove,
  applyMoves,
  type CubeMove,
  invertMove,
  isRotation,
  parseMoves,
  type StickerMask,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { stickersFromState } from "../bridge";
import type { Command } from "../input";
import {
  focusMask,
  focusPieces,
  lookMet,
  marksForPieces,
  marksForSlots,
  type PlayCount,
  pickPiece,
  pieceAtSticker,
  pieceIdentityAt,
  pieceName,
  playChoices,
  playCount,
  playPassed,
  revealFound,
  slotCenterColors,
  turnProgress,
} from "../learn/interact";
import { algTokens as algTokensOf } from "../learn/notation";
import type { Lesson, LessonStep } from "../learn/types";
import type { CubeSettings } from "../settings";
import { type CubeView, loadCubeView, type MarkTone } from "../view";
import { CubeHero } from "./CubeHero";
import { CubePlay, playCubeCue } from "./CubePlay";
import { CubePosterPair } from "./CubePosterPair";
import { MoveChip, useMoveKeys } from "./MoveChip";
import { StillCube } from "./StillCube";
import { ViewHome } from "./ViewHome";

/**
 * 배우기 단계의 상호작용(docs/47 8-1·8-4): 정지 그림(글), 조각 찾기·세기, 고르기 문제, 둘러보기, 한 수 해 보기,
 * 놀이판(보고 싶은 조각만 색을 넣고 마음대로 돌려 보기).
 * 판정은 모두 `learn/interact.ts`의 순수 함수가 한다.
 */

const COLOR_NAME = ["흰", "빨강", "초록", "노랑", "주황", "파랑"];

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

// ── 조각 찾기·세기 ─────────────────────────────────────

/** 맞음·틀림 표시를 잠깐 보이는 시간(판정과 상관없는 보기용이라 시험은 이 시간을 기다리지 않는다) */
const FLASH_MS = 700;

function colorNames(colors: readonly number[]): string {
  return colors.map((c) => COLOR_NAME[c]).join("-");
}

export function FindPanel({
  lesson,
  step,
  start,
  mask,
  settings,
  onPassed,
  explore = false,
}: {
  lesson: Lesson;
  step: LessonStep;
  start: PuzzleState;
  mask: StickerMask | null;
  settings: CubeSettings;
  onPassed: () => void;
  /** 둘러보며 눌러 보기(처음 안내): 아무 조각이나 누르면 통과하고, 그 뒤로도 누를 때마다 무슨 조각인지 알린다 */
  explore?: boolean;
}) {
  const n = lesson.size;
  const target = step.find ?? {};
  const need = step.count ?? 1;
  const counting = need > 1;
  const [found, setFound] = useState<number[]>([]);
  const [flash, setFlash] = useState<{
    piece: number;
    tone: MarkTone;
    at: number;
  } | null>(null);
  const [miss, setMiss] = useState<string | null>(null);
  const [passed, setPassed] = useState(false);

  // 틀림 표시는 잠깐만 보인다
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(
      () => setFlash((f) => (f?.at === flash.at ? null : f)),
      FLASH_MS,
    );
    return () => window.clearTimeout(t);
  }, [flash]);

  // 고른 조각은 하늘색, 다 찾으면(하나 찾기는 바로) 초록, 틀린 조각은 빨강(잠깐)
  const marks = useMemo(() => {
    const tones: [number, MarkTone][] = found.map((p) => [
      p,
      passed || !counting ? "right" : "pick",
    ]);
    if (flash) tones.push([flash.piece, flash.tone]);
    return marksForSlots(n, start, tones);
  }, [found, flash, passed, counting, n, start]);
  // 가린 큐브에서 고른 조각은 3D·큐브 그림 모두 색을 드러낸다
  const shown = useMemo(
    () => revealFound(n, start, mask, found),
    [n, start, mask, found],
  );

  const onSticker = (sticker: number) => {
    if (explore) {
      const p = pieceAtSticker(n, start, sticker);
      if (!p) return;
      setFound([p.piece]);
      setMiss(
        `그건 ${colorNames(p.colors)} ${pieceName(p.type)}이에요(색 ${p.colors.length}개).`,
      );
      playCubeCue(settings, "cubeTurn");
      if (!passed) {
        setPassed(true);
        onPassed();
      }
      return;
    }
    if (passed) return;
    const r = pickPiece(n, start, sticker, target, found, need);
    if (r.kind === "none") return;
    if (r.kind === "wrong") {
      const p = pieceAtSticker(n, start, sticker);
      // 자리 찾기는 조각 대신 그 자리가 어느 센터 사이인지 알린다
      const slot = target.at ? slotCenterColors(n, start, sticker) : [];
      // 가린 칸이면 색 이름 없이 종류만 알린다(답을 미리 알려 주지 않게)
      const id = start.perm[sticker];
      const hidden =
        shown !== null && id !== undefined && shown[id] !== "visible";
      // 제자리가 아닌 블럭 세기: 같은 종류인데 틀렸으면 그 블럭은 제자리다
      const home =
        target.misplaced && p && (!target.piece || p.type === target.piece);
      setMiss(
        home
          ? "그 블럭은 제자리예요. 색이 닿은 센터 블럭 색과 같아요."
          : slot.length > 1
            ? `그 자리는 ${slot.map((c) => COLOR_NAME[c]).join("·")} 센터 사이예요. 다시 찾아보세요.`
            : p
              ? `그건 ${hidden ? "" : `${colorNames(p.colors)} `}${pieceName(p.type)}이에요. 다시 찾아보세요.`
              : "다시 찾아보세요.",
      );
      if (r.piece !== null)
        setFlash({ piece: r.piece, tone: "wrong", at: Date.now() });
      playCubeCue(settings, "invalid");
      return;
    }
    if (r.kind === "again") {
      setMiss("이미 찾은 조각이에요.");
      return;
    }
    setFlash(null);
    setFound(r.found);
    if (r.kind === "remove") {
      setMiss("고르기를 풀었어요.");
      playCubeCue(settings, "cubeTurn");
      return;
    }
    setMiss(null);
    const done = r.found.length >= need;
    playCubeCue(settings, done ? "cubeSolved" : "cubeTurn");
    if (done) {
      setPassed(true);
      onPassed();
    }
  };

  return (
    <div
      className="flex flex-col items-center gap-2"
      data-act="find"
      data-act-passed={passed ? "" : undefined}
    >
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Status passed={passed && !explore}>
          {explore
            ? (miss ?? "칸을 눌러 보세요")
            : passed
              ? counting
                ? "다 찾았어요!"
                : "찾았어요!"
              : (miss ??
                (counting ? "하나씩 눌러 세어 보세요" : "칸을 눌러 보세요"))}
        </Status>
        {counting && (
          <span
            data-find-count={`${found.length}/${need}`}
            className={cn(
              "rounded-full px-3 py-1 font-bold font-mono text-black text-sm tabular-nums",
              passed ? "bg-emerald-400" : "bg-sky-400",
            )}
          >
            {found.length} / {need}
          </span>
        )}
      </div>
      <StillCube
        n={n}
        state={start}
        mask={shown}
        settings={settings}
        onSticker={onSticker}
        marks={marks}
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
  const n = lesson.size;
  const pictures = useMemo(
    () =>
      quiz?.pictures?.map((p) => applyMoves(n, start, parseMoves(n, p.alg))) ??
      null,
    [quiz, n, start],
  );
  if (!quiz) return null;
  const right = choice === quiz.answer;
  return (
    <div
      className="flex flex-col items-center gap-3"
      data-act="quiz"
      data-act-passed={right ? "" : undefined}
    >
      {pictures ? (
        <div className="grid w-full max-w-2xl grid-cols-2 gap-2">
          {pictures.map((s, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: 고를 것 차례가 곧 열쇠다
              key={i}
              data-quiz-picture={i}
              className={cn(
                "flex flex-col items-center rounded-xl p-2",
                choice === i
                  ? i === quiz.answer
                    ? "bg-emerald-500/20"
                    : "bg-red-500/20"
                  : "bg-white/5",
              )}
            >
              <MiniCube n={n} state={s} mask={mask} settings={settings} />
              <span className="font-bold text-sm">{quiz.choices[i]}</span>
            </div>
          ))}
        </div>
      ) : (
        <StillCube
          n={lesson.size}
          state={start}
          mask={mask}
          settings={settings}
        />
      )}
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
        flow="large"
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

/** 공식의 수에서 방향 표시(' 2)를 뗀 단추 이름들(겹침 없이) */
function baseMoves(tokens: readonly string[]): string[] {
  return [...new Set(tokens.map((t) => t.replace(/['2]+$/, "")))];
}

export function TurnPanel({
  n,
  start,
  alg,
  mask,
  settings,
  onPassed,
  axes = false,
  passedText,
}: {
  n: number;
  start: PuzzleState;
  alg: string;
  mask: StickerMask | null;
  settings: CubeSettings;
  onPassed: () => void;
  /** 다 쳤을 때 보일 말(없으면 칭찬) */
  passedText?: string | undefined;
  /** 세 축 화살표(처음 안내의 x·y·z) */
  axes?: boolean;
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
          ? (passedText ?? "잘했어요! 같은 모양이 됐어요.")
          : progress.step < 0
            ? "공식과 다른 모양이 됐어요. 되돌리기나 「처음 상황으로」로 다시 해 보세요."
            : "노란 칸의 수를 직접 돌려 보세요."}
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
        flow="large"
        n={n}
        state={play.state}
        mask={mask}
        syncToken={play.syncToken}
        settings={settings}
        onMove={onMove}
        onCommand={play.onCommand}
        want={want}
        axes={axes}
        extraButtons={baseMoves(tokens)}
      />
    </div>
  );
}

// ── 놀이판 ────────────────────────────────────────────

/**
 * 놀이판(docs/47 8-4): 보고 싶은 조각만 색을 넣고 나머지는 까맣게 가린 큐브를 모든 키·밀기·단추로 마음대로 돌린다.
 * 정해진 수는 없다. 층을 몇 번 돌리거나 그 조각이 자리를 몇 번 옮기면 통과(`playPassed`).
 * 「다른 조각 보기」로 색 넣을 조각을 바꾸고(단추나 칸 누르기), 「모두 보기」면 나머지 색도 보이고 따라가는 조각에
 * 노란 테가 붙는다.
 */
export function PlayPanel({
  lesson,
  step,
  start,
  settings,
  onPassed,
}: {
  lesson: Lesson;
  step: LessonStep;
  start: PuzzleState;
  settings: CubeSettings;
  onPassed: () => void;
}) {
  const n = lesson.size;
  const spec = useMemo(() => step.play ?? { focus: {}, turns: 1 }, [step.play]);
  const [focus, setFocus] = useState<number[]>(() =>
    focusPieces(n, spec.focus),
  );
  const [centers, setCenters] = useState(spec.centers ?? false);
  const [showAll, setShowAll] = useState(false);
  const [count, setCount] = useState<PlayCount>({ turns: 0, moved: 0 });
  const [passed, setPassed] = useState(false);
  const [paint, setPaint] = useState(0);
  const play = usePlay(n, start);
  const live = useRef({ passed, onPassed, settings, focus, count });
  live.current.onPassed = onPassed;
  live.current.settings = settings;

  const mask = useMemo(
    () => (showAll ? null : focusMask(n, focus, centers)),
    [showAll, n, focus, centers],
  );
  const marks = useMemo(
    () => (showAll ? marksForPieces(n, focus, "focus") : null),
    [showAll, n, focus],
  );

  /** 수 하나를 셈에 넣는다(키·밀기·단추·되돌리기 모두) */
  const tally = useCallback(
    (before: PuzzleState, after: PuzzleState, m: CubeMove) => {
      const c = live.current;
      const next = playCount(n, before, after, m, c.focus, c.count);
      c.count = next;
      setCount(next);
      if (!c.passed && playPassed(spec, next)) {
        c.passed = true;
        setPassed(true);
        playCubeCue(c.settings, "cubeSolved");
        c.onPassed();
      }
    },
    [n, spec],
  );

  const onMove = useCallback(
    (m: CubeMove) => {
      const before = play.live.current.state;
      const after = play.push(m);
      tally(before, after, m);
      return true;
    },
    [play, tally],
  );

  const onCommand = useCallback(
    (cmd: Command): CubeMove | null => {
      const before = play.live.current.state;
      const back = play.onCommand(cmd);
      if (back) tally(before, play.live.current.state, back);
      return back;
    },
    [play, tally],
  );

  const choose = (pieces: number[]) => {
    setFocus(pieces);
    setCenters(false);
    live.current.focus = pieces;
    setPaint((t) => t + 1);
  };

  const goal =
    spec.moved !== undefined
      ? `조각이 자리를 옮긴 횟수 ${Math.min(count.moved, spec.moved)} / ${spec.moved}`
      : `돌린 횟수 ${Math.min(count.turns, spec.turns ?? 0)} / ${spec.turns ?? 0}`;

  return (
    <div
      className="flex flex-col items-center gap-2"
      data-act="play"
      data-act-passed={passed ? "" : undefined}
      data-play-turns={count.turns}
      data-play-moved={count.moved}
    >
      <Status passed={passed}>
        {passed ? "잘했어요! 더 돌려 봐도 돼요." : goal}
      </Status>
      <div className="flex flex-wrap items-center justify-center gap-1.5 text-sm">
        {spec.choose && (
          <>
            <span className="text-white/60 text-xs">다른 조각 보기</span>
            {playChoices(n).map((c) => (
              <button
                key={c.label}
                type="button"
                data-play-choose={c.label}
                onClick={(e) => {
                  choose(focusPieces(n, c.focus));
                  e.currentTarget.blur();
                }}
                className="rounded-lg bg-white/10 px-3 py-1 hover:bg-white/15"
              >
                {c.label}
              </button>
            ))}
          </>
        )}
        <button
          type="button"
          data-play-all
          aria-pressed={showAll}
          onClick={(e) => {
            setShowAll((v) => !v);
            setPaint((t) => t + 1);
            e.currentTarget.blur();
          }}
          className={cn(
            "rounded-lg px-3 py-1",
            showAll
              ? "bg-white/25 font-semibold"
              : "bg-white/10 hover:bg-white/15",
          )}
        >
          모두 보기
        </button>
        <button
          type="button"
          data-play-reset
          onClick={(e) => {
            play.restart();
            e.currentTarget.blur();
          }}
          className="rounded-lg bg-white/10 px-3 py-1 hover:bg-white/15"
        >
          처음으로
        </button>
      </div>
      {spec.choose && (
        <p className="text-white/50 text-xs">
          큐브의 칸을 누르면 그 조각을 따라가요.
        </p>
      )}
      <CubePlay
        flow="large"
        n={n}
        state={play.state}
        mask={mask}
        marks={marks}
        syncToken={play.syncToken + paint}
        settings={settings}
        onMove={onMove}
        onCommand={onCommand}
        onSticker={
          spec.choose
            ? (sticker) => {
                const id = pieceIdentityAt(n, play.live.current.state, sticker);
                if (id !== null) choose([id]);
              }
            : undefined
        }
      />
    </div>
  );
}

// ── 작은 그림 큐브(그림 고르기) ───────────────────────────

/** 3D 정지 그림 하나(끌면 둘러보기만). 3D를 못 그리면 비스듬한 큐브 그림 둘 */
function MiniCube({
  n,
  state,
  mask,
  settings,
}: {
  n: number;
  state: PuzzleState;
  mask: StickerMask | null;
  settings: CubeSettings;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<CubeView | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const live = useRef({ state, mask });
  live.current = { state, mask };
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
  return failed ? (
    <div data-cube-no3d className="w-full p-2">
      <CubePosterPair
        n={n}
        state={state}
        mask={mask}
        settings={settings}
        captions={false}
        className="w-full"
      />
    </div>
  ) : (
    <div className="relative aspect-square w-full max-w-[240px]">
      <canvas
        ref={canvasRef}
        data-cube-canvas
        data-cube-ready={ready ? "" : undefined}
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
      />
      <ViewHome viewRef={viewRef} ready={ready} />
    </div>
  );
}

// ── 환영 ────────────────────────────────────────────

/** 환영: 섞였다가 해법대로 맞춰지는 큐브(첫 화면 연출을 그대로 쓴다)와 「따라오세요」 */
export function WelcomePanel({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3" data-act="welcome">
      <div className="w-full max-w-sm">
        <CubeHero />
      </div>
      <button
        type="button"
        data-welcome-start
        onClick={onStart}
        className="rounded-xl bg-sky-500 px-6 py-2.5 font-bold text-black"
      >
        큐브를 맞춰 보고 싶다면, 따라오세요 →
      </button>
    </div>
  );
}
