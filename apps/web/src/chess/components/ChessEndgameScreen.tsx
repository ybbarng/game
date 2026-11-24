"use client";

import { kingOf, type Move, squareAt } from "@game/chess-engine";
import { useRef, useState } from "react";

import { PuzzleScreen, usePuzzleRun } from "@/components/study/PuzzleScreen";
import type { ReviewRun } from "@/components/study/review-run";
import { RichText } from "@/components/tutorial/RichText";
import { obj } from "@/lib/josa";

import {
  blackReply,
  type DrillBoard,
  type DrillMiss,
  drillBest,
  drillBoard,
  drillCells,
  drillGuide,
  drillMoves,
  drillPlayed,
  ENDGAME_LIMIT,
  type EndgameDrill,
  type EndgameSet,
  endgamePages,
  findDrill,
  judgeDrill,
  methodSteps,
  PIECE_WORD,
} from "../endgame";
import { useChessStudyProgress } from "../progress";
import { useChessSettings } from "../settings";
import { ChessBoard } from "./ChessBoard";

/*
 * 기본 엔드게임(docs/23): 단원(방법 읽기)과 연습(흑 킹이 가장 오래 버티는 판에서 정해진 수 안에 메이트).
 * 처음 여는 연습은 단원부터 보이고, 한 번이라도 손댄 연습은 바로 연습판을 연다(「방법 보기」로 다시 읽는다).
 */

/** 기본 엔드게임 연습 하나 */
export function ChessEndgameScreen({
  drillId,
  onExit,
  onOpen,
  review,
}: {
  drillId: string;
  onExit: () => void;
  onOpen: (id: string) => void;
  /** 「오늘 복습」으로 열었으면 복습 줄 */
  review?: ReviewRun | undefined;
}) {
  const found = findDrill(drillId);
  const tried = useChessStudyProgress((s) => Boolean(s.records[drillId]));
  const [reading, setReading] = useState(!tried);
  if (!found) return null;
  if (reading)
    return (
      <EndgameLesson
        set={found.set}
        onStart={() => setReading(false)}
        onExit={onExit}
      />
    );
  return (
    <EndgamePractice
      set={found.set}
      index={found.index}
      drill={found.drill}
      onExit={onExit}
      onOpen={onOpen}
      onLesson={() => setReading(true)}
      review={review}
    />
  );
}

/** 단원: 쪽마다 글과 판 그림. 마지막 쪽에서 연습을 시작한다 */
function EndgameLesson({
  set,
  onStart,
  onExit,
}: {
  set: EndgameSet;
  onStart: () => void;
  onExit: () => void;
}) {
  const coordinates = useChessSettings((s) => s.coordinates);
  const pages = endgamePages(set.piece);
  const [at, setAt] = useState(0);
  const page = pages[at] ?? pages[0];
  if (!page) return null;
  const last = at === pages.length - 1;
  const board = page.fen ? drillBoard(set.piece, page.fen) : null;
  const shown = page.shows
    ? { from: squareAt(page.shows.from), to: squareAt(page.shows.to) }
    : null;
  return (
    <main
      data-game="chess"
      className="flex min-h-dvh flex-col items-center gap-3 break-keep bg-[#1c1917] px-4 py-3 text-white wrap-anywhere"
    >
      <header className="flex w-full max-w-xl items-center gap-2 text-sm">
        <button
          type="button"
          onClick={onExit}
          className="text-white/70 hover:text-white"
        >
          ← 목록
        </button>
        <span className="ml-auto font-semibold">
          {set.title} 방법 {at + 1}/{pages.length}
        </span>
      </header>
      <section
        aria-label="방법"
        className="flex w-full max-w-xl flex-col gap-3 rounded-2xl bg-white/5 p-4"
      >
        <h2 className="font-bold text-lg">{page.title}</h2>
        {board && (
          <div className="mx-auto aspect-square w-full max-w-[16rem]">
            <ChessBoard
              board={drillCells(set.piece, board)}
              flipped={false}
              legal={[]}
              selected={null}
              onSelect={() => {}}
              onMove={() => {}}
              lastMove={null}
              checkedKing={null}
              coordinates={coordinates}
              hint={shown}
            />
          </div>
        )}
        {page.body.map((line) => (
          <p key={line} className="text-sm text-white/85 leading-relaxed">
            <RichText text={line} />
          </p>
        ))}
      </section>
      <div className="flex gap-2">
        {at > 0 && (
          <button
            type="button"
            onClick={() => setAt(at - 1)}
            className="rounded-xl bg-white/10 px-4 py-2"
          >
            이전
          </button>
        )}
        <button
          type="button"
          onClick={() => (last ? onStart() : setAt(at + 1))}
          className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
        >
          {last ? "연습 시작" : "다음"}
        </button>
      </div>
    </main>
  );
}

/** 실패한 까닭마다 상태 글과 도움말 */
function missText(
  miss: DrillMiss | null,
  word: string,
  limit: number,
): { status: string; hint: string } {
  if (miss === "stalemate")
    return {
      status: "스테일메이트예요. 비겼어요.",
      hint: "흑 킹이 체크가 아닌데 갈 칸이 없으면 비겨요. 두기 전에 흑 킹이 갈 칸이 하나라도 남는지 세요.",
    };
  if (miss === "lost")
    return {
      status: `흑 킹이 ${obj(word)} 잡을 수 있어요.`,
      hint: `흑 킹 바로 옆에는 내 킹이 지킬 때만 ${obj(word)} 둬요. 킹 둘만 남으면 비겨요.`,
    };
  if (miss === "draw")
    return {
      status: "흑이 바르게 받으면 비기는 판이 됐어요.",
      hint: "방법을 1번부터 차례로 보고, 처음 맞는 단계의 수를 둬요.",
    };
  return {
    status:
      word === "폰"
        ? `${limit}수 안에 퀸을 만들지 못했어요.`
        : `${limit}수 안에 메이트하지 못했어요.`,
    hint: "방법을 1번부터 차례로 보고, 처음 맞는 단계의 수를 둬요.",
  };
}

/** 연습: 흑 킹(컴퓨터)이 가장 오래 버틴다. 정해진 수 안에 메이트하면 성공 */
function EndgamePractice({
  set,
  index,
  drill,
  onExit,
  onOpen,
  onLesson,
  review,
}: {
  set: EndgameSet;
  index: number;
  drill: EndgameDrill;
  onExit: () => void;
  onOpen: (id: string) => void;
  onLesson: () => void;
  review?: ReviewRun | undefined;
}) {
  const piece = drill.piece;
  /** 킹과 폰: 메이트 대신 폰을 무사히 퀸으로 바꾸면 성공 */
  const pawn = piece === "P";
  const word = PIECE_WORD[piece];
  const limit = ENDGAME_LIMIT[piece];
  const coordinates = useChessSettings((s) => s.coordinates);
  const solve = useChessStudyProgress((s) => s.solve);
  const miss = useChessStudyProgress((s) => s.miss);
  const [selected, setSelected] = useState<number | null>(null);
  // 「수 보기」로 본 방법의 수. 한 번이라도 보면 푼 것으로 치지 않는다
  const [shown, setShown] = useState<ReturnType<typeof drillGuide>>(null);
  const helped = useRef(false);
  const lastMiss = useRef<DrillMiss | null>(null);
  // 지금까지 둔 내 수(판정할 때 센다, 해설에 쓴다)
  const played = useRef(0);
  const start = drillBoard(piece, drill.fen);
  const run = usePuzzleRun<DrillBoard, Move>({
    initial: () => start,
    judge: (state, move, step) => {
      const verdict = judgeDrill(piece, state, move, step);
      played.current = step + 1;
      lastMiss.current = verdict.verdict === "wrong" ? verdict.miss : null;
      return verdict.verdict;
    },
    apply: (state, move) => ({
      state: drillPlayed(piece, state, move),
      capture: false,
    }),
    reply: (state) => {
      const reply = blackReply(piece, state);
      if (!reply) return null;
      return {
        state: reply.board,
        move: { from: reply.from, to: reply.to },
        capture: false,
      };
    },
    explain: (): string[] => {
      const best = drillBest(piece, start);
      return [
        pawn
          ? `${played.current}수 만에 퀸을 만들었어요.`
          : `${played.current}수 만에 메이트했어요.`,
        ...(best ? [`이 시작 판은 가장 빠르면 ${best}수예요.`] : []),
      ];
    },
    solve: () => {
      if (!helped.current) solve(drill.id);
    },
    miss: () => miss(drill.id),
  });
  const { state, status } = run;
  const legal: Move[] = status === "play" ? drillMoves(piece, state) : [];
  const guide = status === "play" ? drillGuide(piece, state) : null;
  const step = shown
    ? methodSteps(piece).findIndex((s) => s.rule === shown.rule)
    : -1;
  const failed = missText(lastMiss.current, word, limit);
  const nextId = set.drills[index + 1]?.id ?? null;

  const play = (move: Move) => {
    setSelected(null);
    setShown(null);
    run.play(move);
  };

  return (
    <PuzzleScreen
      game="chess"
      setTitle={set.title}
      index={index}
      total={set.drills.length}
      boardClassName="aspect-square w-[min(100%,calc(100dvh-18rem))] split:w-[min(calc(100dvh-1.5rem),36rem)]"
      board={
        <ChessBoard
          board={drillCells(piece, state)}
          flipped={false}
          legal={
            shown
              ? legal.filter((m) => m.from === shown.from && m.to === shown.to)
              : legal
          }
          selected={selected}
          onSelect={setSelected}
          onMove={play}
          lastMove={run.lastMove}
          checkedKing={
            status === "solved" && !pawn
              ? kingOf(drillCells(piece, state), "b")
              : null
          }
          coordinates={coordinates}
          hint={shown ? { from: shown.from, to: shown.to } : null}
        />
      }
      status={status}
      prompt={
        pawn
          ? `폰을 ${limit}수 안에 퀸으로 만드세요. 지금 ${run.step + 1}수째예요.`
          : `흑 킹을 ${limit}수 안에 메이트하세요. 지금 ${run.step + 1}수째예요.`
      }
      waitingText="흑 킹이 받는 중…"
      solvedText={pawn ? "퀸이 됐어요!" : "체크메이트!"}
      wrongText={failed.status}
      wrongHint={failed.hint}
      shown={helped.current}
      explain={run.explain}
      canHint={guide !== null}
      onHint={() => setSelected(guide?.from ?? null)}
      revealLabel="수 보기"
      onReveal={() => {
        if (status !== "play") {
          // 틀린 뒤에는 처음 판으로 돌려 첫 수를 보인다
          run.restart();
          lastMiss.current = null;
          helped.current = true;
          setShown(drillGuide(piece, start));
          setSelected(null);
          return;
        }
        helped.current = true;
        setShown(guide);
        setSelected(guide?.from ?? null);
      }}
      onRestart={() => {
        run.restart();
        lastMiss.current = null;
        setShown(null);
        setSelected(null);
      }}
      onNext={nextId ? () => onOpen(nextId) : null}
      onExit={onExit}
      review={review}
      extraButtons={
        <>
          {shown && step >= 0 && (
            <p
              data-testid="endgame-step"
              className="w-full rounded-xl bg-white/5 p-3 text-left text-sm text-white/85"
            >
              {`${step + 1}. ${methodSteps(piece)[step]?.name}: ${methodSteps(piece)[step]?.text}`}
            </p>
          )}
          <button
            type="button"
            onClick={onLesson}
            className="rounded-xl bg-white/10 px-4 py-2"
          >
            방법 보기
          </button>
        </>
      }
    />
  );
}
