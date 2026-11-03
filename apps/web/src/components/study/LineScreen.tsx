"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { playUiCue } from "@/game/ui-sound";
import { cn } from "@/lib/cn";
import {
  advance,
  candidates,
  keepWays,
  type LineCursor,
  type LineNode,
  learnerToMove,
  lineDone,
  matchMove,
  opponentPick,
  type StudyLine,
  startCursor,
  waysOf,
} from "@/study/line";

import { type Applied, type MoveSounds, playMoveCue } from "./PuzzleScreen";

/*
 * 수 배우기 "수순 따라 두기" 화면의 공통 틀(docs/23 2절). 장기 포진·체스 오프닝·바둑 정석이 함께 쓴다.
 * - `useLineRun`: 수순 하나를 따라 두는 흐름(내 수가 수순에 맞나 → 상대 수 저절로 → 끝, 진행 기록)
 * - `LineScreen`: 머리줄·판 자리·안내 줄·설명·둔 수 목록·단추(힌트, 수 보기, 처음부터, 다음 수순)
 * 게임마다 다른 것(판 그림, 기보 글자를 수로 바꾸기, 수 두기)은 넘겨받는다.
 */

/** play: 내 차례, waiting: 상대가 두는 중, done: 끝까지 두었다 */
export type LineStatus = "play" | "waiting" | "done";

/** 상대 수를 보이기 전에 잠깐 기다린다 */
const REPLY_MS = 500;

export interface LineRules<S, M> {
  line: StudyLine;
  /** 수순 처음 판 */
  initial: () => S;
  /** 기보 글자를 이 판의 수로. 둘 수 없으면 null */
  parse: (state: S, notation: string) => M | null;
  /** 같은 수인가 */
  same: (a: M, b: M) => boolean;
  /** 수를 둔다. 둘 수 없으면 null */
  apply: (state: S, move: M) => Applied<S> | null;
  /** 상대 갈래 고르기에 쓰는 0 이상 1 미만의 수. 기본은 Math.random */
  roll?: () => number;
  /** 수 소리. 없으면 기물 소리(`piece`·`capture`) */
  sounds?: MoveSounds;
  /**
   * 대칭 변환(바둑 정석의 여덟 방향 등). 0번은 그대로. 배우는 사람의 첫 수가 맞은 방향으로 수순 전체를 돌려 둔다.
   * 상대가 먼저 두는 수순이면 그대로(0번) 방향이다. 없으면 그대로만 본다(`matchMove`)
   */
  transforms?: readonly ((notation: string) => string)[];
  /** 진행 기록 */
  solve: () => void;
  miss: () => void;
}

/** 둔 수 하나 */
export interface PlayedNode {
  notation: string;
  note?: string;
  /** 배우는 사람이 둔 수인가 */
  mine: boolean;
}

/** 그대로 두는 변환(대칭을 쓰지 않는 게임) */
const IDENTITY = [(s: string) => s] as const;

/** 정해진 방향으로 마디 글자를 바꾼다 */
function turned<S, M>(
  rules: LineRules<S, M>,
  orients: readonly number[] | null,
) {
  const list = rules.transforms ?? IDENTITY;
  return list[orients?.[0] ?? 0] ?? IDENTITY[0];
}

/** 지금 자리에서 마디를 판의 수로 바꾼 후보들(정해진 방향, 아직 없으면 그대로) */
function movesAt<S, M>(
  rules: LineRules<S, M>,
  state: S,
  cursor: LineCursor,
  orients: readonly number[] | null,
) {
  const turn = turned(rules, orients);
  return candidates(cursor)
    .map((node) => ({ node, move: rules.parse(state, turn(node.move)) }))
    .filter((c): c is { node: LineNode; move: M } => c.move !== null);
}

/** 수순 하나를 따라 두는 흐름. 판 그림은 부르는 쪽이 그린다 */
export function useLineRun<S, M>(rules: LineRules<S, M>) {
  const { line } = rules;
  const firstStatus = (): LineStatus =>
    learnerToMove(line, startCursor(line)) ? "play" : "waiting";
  const [state, setState] = useState<S>(rules.initial);
  const [cursor, setCursor] = useState<LineCursor>(() => startCursor(line));
  const [status, setStatus] = useState<LineStatus>(firstStatus);
  const [history, setHistory] = useState<PlayedNode[]>([]);
  const [lastMove, setLastMove] = useState<M | null>(null);
  /** 수순에 없는 수를 두었을 때 잠깐 보이는 안내 */
  const [mistake, setMistake] = useState(false);
  /** 수 보기로 보인 다음 수 */
  const [shown, setShown] = useState<M | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [missed, setMissed] = useState(false);
  /** 대칭 방향. 배우는 사람의 첫 수나 상대의 첫 수에서 정한다 */
  const [orients, setOrients] = useState<readonly number[] | null>(null);
  const latest = useRef(rules);
  latest.current = rules;

  /** 마디 하나를 두고 다음 상태로 */
  const playNode = (node: LineNode, move: M, mine: boolean) => {
    const done = latest.current.apply(state, move);
    const next = advance(cursor, node);
    if (!done || !next) return;
    setState(done.state);
    setCursor(next);
    setLastMove(move);
    setHistory((h) => [
      ...h,
      { notation: node.move, mine, ...(node.note ? { note: node.note } : {}) },
    ]);
    setShown(null);
    playMoveCue(latest.current.sounds, done.capture);
    if (lineDone(next)) {
      setStatus("done");
      playUiCue("win");
      if (!revealed) latest.current.solve();
    } else {
      setStatus(learnerToMove(line, next) ? "play" : "waiting");
    }
  };

  // 상대 차례면 수순의 수를 저절로 둔다.
  // 기다리는 상태로 바뀌었거나 판·자리가 바뀔 때만 다시 건다(다른 까닭으로 다시 그려도 기다림이 처음부터 시작하지 않게).
  // biome-ignore lint/correctness/useExhaustiveDependencies: playNode는 같은 판·자리·방향을 쓰는 함수라 이 넷으로 충분하다
  useEffect(() => {
    if (status !== "waiting") return;
    const timer = setTimeout(() => {
      const rules = latest.current;
      const node = opponentPick(cursor, (rules.roll ?? Math.random)());
      if (!node) return;
      // 아직 맞는 방향 가운데 첫 방향으로 두고, 그 수와 같은 자리가 되는 방향만 남긴다.
      const transforms = rules.transforms ?? IDENTITY;
      const ways = waysOf(transforms, orients);
      const move = rules.parse(state, turned(rules, ways)(node.move));
      if (!move) return;
      setOrients(
        keepWays(
          node,
          move,
          (n) => rules.parse(state, n),
          rules.same,
          transforms,
          ways,
        ),
      );
      playNode(node, move, false);
    }, REPLY_MS);
    return () => clearTimeout(timer);
  }, [status, state, cursor, orients]);

  const restart = () => {
    setState(rules.initial());
    setCursor(startCursor(line));
    setStatus(firstStatus());
    setHistory([]);
    setLastMove(null);
    setMistake(false);
    setShown(null);
    setOrients(null);
    // 수 보기로 본 표시도 지운다: 처음부터 다시 두어 보지 않고 끝까지 두면 푼 것으로 친다(문제 화면 usePuzzleRun과 같게)
    setRevealed(false);
  };

  /** 내 수. 수순(본줄기나 갈래)에 있으면 두고, 없으면 두지 않고 안내한다 */
  const play = (move: M) => {
    if (status !== "play") return;
    const found = matchMove(
      cursor,
      move,
      (notation) => rules.parse(state, notation),
      rules.same,
      rules.transforms ?? IDENTITY,
      orients,
    );
    if (found) {
      setMistake(false);
      setOrients(found.orients);
      playNode(found.node, found.move, true);
      return;
    }
    setMistake(true);
    playUiCue("invalid");
    if (!missed) {
      rules.miss();
      setMissed(true);
    }
  };

  /** 이 자리에서 수순이 두는 수(본줄기) */
  const expected = (): M | null =>
    status === "play"
      ? (movesAt(rules, state, cursor, orients)[0]?.move ?? null)
      : null;

  /** 수 보기: 다음 수를 판에 보인다. 본 뒤 끝까지 두어도 푼 것으로 치지 않는다 */
  const reveal = () => {
    const move = expected();
    if (!move) return;
    setShown(move);
    setRevealed(true);
  };

  return {
    state,
    status,
    history,
    lastMove,
    mistake,
    shown,
    revealed,
    expected,
    play,
    restart,
    reveal,
  };
}

/** 수순 화면 틀: 머리줄, 판, 안내, 설명, 둔 수, 단추 */
export function LineScreen({
  game,
  setTitle,
  line,
  index,
  total,
  board,
  boardClassName,
  status,
  history,
  mistake,
  revealed,
  waitingText,
  moveLabel = (ply, notation) => `${ply + 1}. ${notation}`,
  onHint,
  onReveal,
  onRestart,
  onNext,
  onExit,
  extraButtons,
}: {
  /** `data-game` 값 */
  game: string;
  setTitle: string;
  line: StudyLine;
  /** 묶음 안 번호(0부터) */
  index: number;
  total: number;
  board: ReactNode;
  boardClassName: string;
  status: LineStatus;
  history: readonly PlayedNode[];
  mistake: boolean;
  revealed: boolean;
  /** 상대가 두는 동안 안내(예: "흑이 두는 중…") */
  waitingText: string;
  /** 둔 수 목록에 보일 글자(체스는 "1. e4", "e5"처럼) */
  moveLabel?: (ply: number, notation: string) => string;
  onHint: () => void;
  onReveal: () => void;
  onRestart: () => void;
  /** 다음 수순. 묶음 끝이면 null */
  onNext: (() => void) | null;
  onExit: () => void;
  /** 판 밖에서 두는 수 단추(바둑 쉬기 등). 내 차례에만 보인다 */
  extraButtons?: ReactNode;
}) {
  // 마지막 두 수(내 수와 상대 답)의 설명. 상대가 곧바로 받아도 내 수의 설명이 사라지지 않게 한다.
  const notes = history
    .map((h, ply) => ({ ply, note: h.note, label: moveLabel(ply, h.notation) }))
    .slice(-2)
    .filter((n) => n.note);
  const statusText =
    status === "done"
      ? "수순을 끝까지 두었어요!"
      : status === "waiting"
        ? waitingText
        : mistake
          ? "이 수순에서 두는 수가 아니에요. 다시 골라 보세요"
          : "수순의 다음 수를 두세요";
  return (
    <main
      data-game={game}
      className="flex min-h-dvh flex-col items-center gap-3 bg-[#1c1917] px-4 py-3 text-white split:grid split:grid-cols-[auto_minmax(0,18rem)] split:grid-rows-[auto_auto_1fr] split:content-center split:justify-center split:gap-x-6"
    >
      <header className="flex w-full max-w-xl items-center gap-2 text-sm split:col-start-2 split:row-start-1">
        <button
          type="button"
          onClick={onExit}
          className="text-white/70 hover:text-white"
        >
          ← 목록
        </button>
        <span className="ml-auto font-semibold">
          {setTitle} {index + 1}/{total}
        </span>
      </header>

      <div
        className={cn(
          "max-w-xl split:col-start-1 split:row-span-3 split:row-start-1",
          boardClassName,
        )}
      >
        {board}
      </div>

      <div className="flex w-full max-w-xl flex-col items-center gap-3 split:col-start-2 split:row-start-2">
        <div className="w-full text-center">
          <h2 className="font-bold text-lg">{line.name}</h2>
          <p className="text-sm text-white/70">{line.summary}</p>
        </div>
        <p
          role="status"
          className={cn(
            "font-semibold",
            status === "done" && "text-amber-300",
            mistake && status === "play" && "text-rose-300",
          )}
        >
          {statusText}
        </p>
        {notes.length > 0 && (
          <ul
            data-testid="line-note"
            className="flex w-full flex-col gap-1 rounded-xl bg-white/5 p-3 text-sm text-white/85"
          >
            {notes.map((n) => (
              <li key={`${n.ply}`}>
                <span className="font-semibold">{n.label}</span> {n.note}
              </li>
            ))}
          </ul>
        )}
        {history.length > 0 && (
          <p
            data-testid="line-moves"
            className="w-full rounded-lg bg-white/5 px-2 py-1 font-mono text-white/70 text-xs"
          >
            {history.map((h, ply) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: 둔 순서가 곧 열쇠다
                key={ply}
                className={cn(h.mine && "text-white")}
              >
                {ply > 0 && " "}
                {moveLabel(ply, h.notation)}
              </span>
            ))}
          </p>
        )}
        {status === "done" && revealed && (
          <p className="text-sm text-white/70">
            수를 본 뒤 끝냈어요. 다음에 보지 않고 다시 두어 보세요
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {status === "play" && (
            <>
              {extraButtons}
              <button
                type="button"
                onClick={onHint}
                className="rounded-xl bg-white/10 px-4 py-2"
              >
                힌트
              </button>
              <button
                type="button"
                onClick={onReveal}
                className="rounded-xl bg-white/10 px-4 py-2"
              >
                수 보기
              </button>
            </>
          )}
          {history.length > 0 && (
            <button
              type="button"
              onClick={onRestart}
              className="rounded-xl bg-white/10 px-4 py-2"
            >
              처음부터
            </button>
          )}
          {status === "done" && (
            <button
              type="button"
              onClick={onNext ?? onExit}
              className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
            >
              {onNext ? "다음 수순" : "목록으로"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
