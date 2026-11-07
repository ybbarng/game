"use client";

import {
  type Board,
  createJanggiScenario,
  HEIGHT,
  inCheck,
  kingOf,
  legalMoves,
  type Move,
  pointAt,
  pseudoTargets,
  SETUPS,
  type Setup,
  type Side,
  WIDTH,
} from "@game/janggi-engine";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { paced } from "@/game/settings";
import { cn } from "@/lib/cn";

import { piecesInDanger } from "../danger";
import { canContinue, exampleState, guessRight } from "../example-play";
import {
  bestAgainst,
  drillOrder,
  FORMATION,
  GRADE_MARKS,
  GRADE_NAMES,
  isMatsang,
  matchup,
  setupLabel,
} from "../matchups";
import { openingPieces, SETUP_NAMES } from "../opening-lessons";
import {
  moveText,
  parseMove,
  replayBoards,
  sideAt,
  tallyOf,
  tallyText,
} from "../replay";
import { useJanggiSettings } from "../settings";
import { useJanggi } from "../store";
import { JANGGI_TUTORIAL_RULES, type JanggiScene } from "../tutorial";
import { JanggiBoard, pointPercent } from "./JanggiBoard";
import { JanggiGame } from "./JanggiGame";
import { SetupButtons } from "./SetupButtons";

/*
 * 장기 배우기의 판 그림들(설명·퀴즈 칸). 정지 그림·넘겨 보기는 `ReplayScene`, 직접 따라 두기는 `FollowScene`,
 * 16가지 짝 표는 `MatchupTable`, 상대 차림 보고 고르기 반복 문제는 `SetupDrill`.
 */

const startBoard = (scene: JanggiScene) =>
  createJanggiScenario({ rules: JANGGI_TUTORIAL_RULES, ...scene }).board;

/**
 * 판 바깥 여백의 칸 번호(기보 표기와 같다): 위쪽에 세로줄 번호(왼쪽부터 1~9),
 * 왼쪽에 가로줄 번호(위부터 1~9, 맨 아래 줄은 0). 자리 이름은 「가로줄 + 세로줄」이다(79 = 7째 가로줄의 9째 세로줄)
 */
const COLUMNS = Array.from({ length: WIDTH }, (_, x) => x);
const ROWS = Array.from({ length: HEIGHT }, (_, y) => y);

function BoardNumbers() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {COLUMNS.map((x) => (
        <span
          key={`c${x}`}
          data-axis-col={x + 1}
          className="-translate-x-1/2 absolute top-0 -mt-3.5 text-[10px] text-white/60 leading-none tabular-nums"
          style={{ left: `${pointPercent(x, 0)[0]}%` }}
        >
          {x + 1}
        </span>
      ))}
      {ROWS.map((y) => (
        <span
          key={`r${y}`}
          data-axis-row={(y + 1) % 10}
          className="-translate-y-1/2 absolute left-0 -ml-3.5 text-[10px] text-white/60 leading-none tabular-nums"
          style={{ top: `${pointPercent(0, y)[1]}%` }}
        >
          {(y + 1) % 10}
        </span>
      ))}
    </div>
  );
}

/** 칸 번호를 두른 판. `wide`면 따라 두기처럼 직접 누르는 판이라 조금 크게 */
function NumberedBoard({
  board,
  legal = [],
  selected = null,
  onSelect = () => {},
  onMove = () => {},
  lastMove = null,
  rings = [],
  danger = [],
  hint = null,
  wide = false,
  onPoint,
  picks = [],
  hideCheck = false,
}: {
  board: Board;
  legal?: readonly Move[];
  selected?: number | null;
  onSelect?: (at: number | null) => void;
  onMove?: (move: Move) => void;
  lastMove?: Move | null;
  rings?: readonly number[];
  danger?: readonly number[];
  hint?: Move | null;
  wide?: boolean;
  onPoint?: (at: number) => void;
  picks?: readonly { at: number; ok: boolean }[];
  /** 장군 고리를 감춘다(맞혀 보기 답을 미리 알려 주지 않게) */
  hideCheck?: boolean;
}) {
  const labels = useJanggiSettings((s) => s.labels);
  const checked = hideCheck
    ? undefined
    : (["c", "h"] as Side[]).find((side) => inCheck(board, side));
  return (
    <div
      className={cn(
        "relative mx-auto mt-3 aspect-[924/1024] w-full",
        wide ? "max-w-[19rem]" : "max-w-[16rem]",
      )}
    >
      <BoardNumbers />
      <JanggiBoard
        board={board}
        flipped={false}
        legal={legal}
        selected={selected}
        onSelect={onSelect}
        onMove={onMove}
        lastMove={lastMove}
        checkedKing={checked ? kingOf(board, checked) : null}
        labels={labels}
        rings={rings}
        danger={danger}
        hint={hint}
        {...(onPoint ? { onPoint } : {})}
        picks={picks}
      />
    </div>
  );
}

/** 넘긴 수의 말·까닭·주고받은 점수 */
function _MoveNotes({
  caption,
  note,
  tally,
}: {
  caption: string;
  note?: string | undefined;
  tally: string | null;
}) {
  return (
    <div className="flex w-full flex-col gap-1 text-sm">
      <p className="min-h-5 font-semibold" data-replay-caption>
        {caption}
      </p>
      {note && (
        <p className="leading-relaxed opacity-85" data-replay-note>
          {note}
        </p>
      )}
      {tally && (
        <p
          className="rounded-lg bg-white/5 px-2 py-1 text-xs leading-relaxed"
          data-replay-tally
        >
          {tally}
        </p>
      )}
    </div>
  );
}

const buttonClass =
  "rounded-lg bg-white/10 px-3 py-1.5 text-sm disabled:opacity-40";
const primaryClass =
  "rounded-lg bg-amber-300/25 px-3 py-1.5 font-semibold text-sm disabled:opacity-40";

/**
 * 정지 그림. `show` 자리 기물이 갈 수 있는 곳에 점, `rings`는 얇은 주황 고리, `warn`은 빨간 점선 고리.
 * `pickSetup`이면 판 위 단추로 내 상차림을 바꾼다. 판은 누를 수 없다(수순이 있는 장면은 `PlayScene`)
 */
export function ReplayScene({ scenario }: { scenario: JanggiScene }) {
  const [setup, setSetup] = useState<Setup>("NENE");
  const board = useMemo(
    () =>
      startBoard(
        scenario.pickSetup
          ? { ...scenario, pieces: openingPieces(setup, "NENE") }
          : scenario,
      ),
    [scenario, setup],
  );
  const from = scenario.show ? pointAt(scenario.show) : null;
  const shown =
    from === null || !(board[from] ?? "").startsWith("c")
      ? []
      : pseudoTargets(board, from).map((to) => ({ from, to }));

  return (
    <div className="flex flex-col items-center gap-2">
      {scenario.pickSetup && (
        <SetupButtons
          legend="내 상차림 바꿔 보기"
          picked={setup}
          onPick={setSetup}
        />
      )}
      <NumberedBoard
        board={board}
        legal={shown}
        selected={shown.length > 0 ? from : null}
        rings={(scenario.rings ?? []).map(pointAt)}
        danger={(scenario.warn ?? []).map(pointAt)}
      />
      {scenario.pickSetup && (
        <p className="text-sm" data-setup-caption>
          초 {setupLabel(setup)}: {SETUP_NAMES[setup].name} ·{" "}
          {SETUP_NAMES[setup].formation}
        </p>
      )}
    </div>
  );
}

/** 한 수를 저절로 두기 전 기다림(무슨 수인지 알아볼 만큼). 맞혀 본 바로 뒤에는 정답을 볼 틈을 더 준다 */
const HAN_DELAY_MS = 1100;
const AFTER_GUESS_DELAY_MS = 1900;

/**
 * 예시 끝 판에서 컴퓨터와 이어 두는 연습 대국. 판 화면을 페이지 위에 덮어 연다.
 * 연습 대국(`startPractice`)이라 이어하기 저장·내 기록·복기를 남기지 않는다(하던 게임을 덮어쓰지 않는다)
 */
export function ContinueButton({
  scenario,
  moves,
}: {
  scenario: JanggiScene;
  moves: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  // 장면을 떠나면 연습 대국도 닫는다.
  useEffect(
    () => () => {
      if (open) useJanggi.getState().leave();
    },
    [open],
  );
  const start = () => {
    const state = exampleState({
      pieces: scenario.pieces,
      moves,
      ...(scenario.setups ? { setups: scenario.setups } : {}),
      rules: JANGGI_TUTORIAL_RULES,
    });
    useJanggi
      .getState()
      .startPractice(state, useJanggiSettings.getState().level);
    setOpen(true);
  };
  return (
    <>
      <button
        type="button"
        onClick={start}
        className={primaryClass}
        data-continue
      >
        여기서부터 컴퓨터와 두어 보기
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 overflow-y-auto"
            data-continue-game
          >
            <JanggiGame
              exitLabel="← 배우기"
              onExit={() => {
                useJanggi.getState().leave();
                setOpen(false);
              }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * 직접 두기: `replay`의 초 수는 내가 판에서 둔다. 둘 기물(점선)과 갈 자리를 초록 고리로 보이고, 다른 수는 놓지 않고 알린다.
 * 한 수는 잠깐 뒤 저절로 둔다. `guess`가 있으면 그 순간 판의 한 자리를 누르게 묻고, 맞든 틀리든 정답을 보이고 이어 간다.
 * 끝나면 그 판에서 컴퓨터와 이어 둘 수 있다
 */
export function PlayScene({ scenario }: { scenario: JanggiScene }) {
  const moves = scenario.replay ?? [];
  const by = scenario.replayBy ?? "turns";
  const guess = scenario.guess;
  const start = useMemo(() => startBoard(scenario), [scenario]);
  const boards = useMemo(() => replayBoards(start, moves), [start, moves]);
  const [frame, setFrame] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [miss, setMiss] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const board = boards[frame] ?? start;
  const asking = !!guess && frame === guess.at && picked === null;
  const done = frame >= moves.length && !asking;
  const mover = frame >= moves.length ? null : sideAt(frame, by);
  const expected = frame >= moves.length ? null : parseMove(moves[frame] ?? "");
  const myTurn = mover === "c" && !asking;
  const last = frame > 0 ? parseMove(moves[frame - 1] ?? "") : null;

  // 한 수는 잠깐 뒤 저절로 둔다.
  useEffect(() => {
    if (mover !== "h" || asking) return;
    const wait =
      guess && picked !== null && frame === guess.at
        ? AFTER_GUESS_DELAY_MS
        : HAN_DELAY_MS;
    const id = setTimeout(() => setFrame((f) => f + 1), paced(wait));
    return () => clearTimeout(id);
  }, [mover, asking, guess, picked, frame]);

  const play = (m: Move) => {
    if (!expected || !myTurn) return;
    if (m.from !== expected.from || m.to !== expected.to) {
      setMiss(true);
      return;
    }
    setMiss(false);
    setSelected(null);
    setFrame((f) => f + 1);
  };
  const restart = () => {
    setFrame(0);
    setSelected(null);
    setMiss(false);
    setPicked(null);
  };

  // 맞혀 보기 전에는 잡힐 위험 고리가 답을 알려 주지 않게 감춘다.
  const hideDanger = !!guess && (frame < guess.at || asking);
  const right = guess && picked !== null ? guessRight(guess, picked) : null;
  const picks =
    guess && picked !== null
      ? [
          { at: picked, ok: right === true },
          ...(right ? [] : [{ at: pointAt(guess.answer), ok: true }]),
        ]
      : [];
  const notes = [frame - 2, frame - 1].filter((i) => i >= 0);
  const tally = tallyText(tallyOf(boards, moves, frame));
  // 다 두면 글이 짚는 기물(`show`)이 갈 수 있는 곳에 점
  const from = done && scenario.show ? pointAt(scenario.show) : null;
  const shown =
    from === null || !(board[from] ?? "").startsWith("c")
      ? []
      : pseudoTargets(board, from).map((to) => ({ from, to }));

  return (
    <div className="flex flex-col items-center gap-2" data-play>
      <NumberedBoard
        wide
        board={board}
        legal={myTurn ? legalMoves(board, "c") : shown}
        selected={myTurn ? selected : shown.length > 0 ? from : null}
        onSelect={setSelected}
        onMove={play}
        lastMove={last}
        rings={(scenario.rings ?? []).map(pointAt)}
        danger={hideDanger ? [] : piecesInDanger(board, "c")}
        hint={myTurn ? expected : null}
        {...(asking ? { onPoint: setPicked } : {})}
        picks={picks}
        hideCheck={asking}
      />
      <p
        className="font-semibold text-sm"
        data-play-turn={done ? "done" : asking ? "guess" : mover}
        data-replay-caption
      >
        {last
          ? `${frame}/${moves.length}수 · ${moveText(boards[frame - 1] ?? start, last)}`
          : `처음 판 · ${moves.length}수${by === "cho" ? "(초 혼자 둬요)" : ""}`}
      </p>
      {asking && guess && (
        <p
          className="w-full rounded-xl border border-amber-300/60 bg-amber-300/15 p-2 font-semibold text-sm leading-relaxed"
          data-guess
        >
          {guess.ask}
        </p>
      )}
      {guess && picked !== null && (
        <div
          className={cn(
            "w-full rounded-xl p-2 text-sm leading-relaxed",
            right ? "bg-emerald-500/15" : "bg-rose-500/15",
          )}
          data-guess-result={right ? "right" : "wrong"}
        >
          <p className="font-semibold">
            {right ? "맞아요!" : `정답은 ${guess.answer}예요.`}
          </p>
          <p className="opacity-85">{guess.why}</p>
        </div>
      )}
      {miss && (
        <p className="text-rose-200 text-sm" data-follow-miss>
          이 예시에서 두는 수가 아니에요. 초록 고리를 보세요.
        </p>
      )}
      <div className="flex w-full flex-col gap-1.5 text-sm">
        {notes.map((i) => (
          <p
            key={i}
            className={cn(
              "leading-relaxed",
              i === frame - 1 ? "opacity-90" : "opacity-60",
            )}
            {...(i === frame - 1 ? { "data-replay-note": true } : {})}
          >
            <span className="font-semibold">{i + 1}수</span>{" "}
            {scenario.notes?.[i]}
          </p>
        ))}
        {tally && (
          <p
            className="rounded-lg bg-white/5 px-2 py-1 text-xs leading-relaxed"
            data-replay-tally
          >
            {tally}
          </p>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          disabled={frame === 0 && picked === null}
          onClick={restart}
          className={buttonClass}
        >
          처음부터
        </button>
        {done && canContinue(by) && (
          <ContinueButton scenario={scenario} moves={moves} />
        )}
      </div>
    </div>
  );
}

/**
 * 따라 두기: `replay`의 초 수는 내가 판에서 두고, 한 수는 저절로 둔다.
 * 수순에 없는 수는 판에 두지 않고 알린다. 「힌트」는 둘 기물, 「수 보기」는 갈 자리를 초록 고리로 보인다
 */
export function FollowScene({ scenario }: { scenario: JanggiScene }) {
  const moves = scenario.replay ?? [];
  const start = useMemo(() => startBoard(scenario), [scenario]);
  const boards = useMemo(() => replayBoards(start, moves), [start, moves]);
  const [frame, setFrame] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [miss, setMiss] = useState(false);
  const [help, setHelp] = useState<"none" | "piece" | "move">("none");
  const board = boards[frame] ?? start;
  const done = frame >= moves.length;
  const expected = done ? null : parseMove(moves[frame] ?? "");
  const legal = done ? [] : legalMoves(board, sideAt(frame));
  const last = frame > 0 ? parseMove(moves[frame - 1] ?? "") : null;
  const myCount = moves.filter((_, i) => sideAt(i) === "c").length;
  const myDone = moves
    .slice(0, frame)
    .filter((_, i) => sideAt(i) === "c").length;

  const play = (m: Move) => {
    if (!expected) return;
    if (m.from !== expected.from || m.to !== expected.to) {
      setMiss(true);
      return;
    }
    setMiss(false);
    setHelp("none");
    // 내 수 다음 한 수는 저절로 둔다.
    setFrame((f) => Math.min(moves.length, f + (f + 1 < moves.length ? 2 : 1)));
  };

  // 지금 본 마지막 두 수(내 수와 한의 답)의 까닭
  const shownNotes = [frame - 2, frame - 1]
    .filter((i) => i >= 0)
    .map((i) => ({ i, text: scenario.notes?.[i] ?? "" }));

  return (
    <div className="flex flex-col items-center gap-2" data-follow>
      <NumberedBoard
        wide
        board={board}
        legal={legal}
        selected={selected}
        onSelect={setSelected}
        onMove={play}
        lastMove={last}
        danger={piecesInDanger(board, "c")}
        rings={help === "piece" && expected ? [expected.from] : []}
        hint={help === "move" ? expected : null}
      />
      <p
        className="font-semibold text-sm"
        data-follow-progress={`${myDone}/${myCount}`}
      >
        {done
          ? `끝까지 따라 두었어요! 내 수 ${myCount}개`
          : `내 수 ${myDone + 1}/${myCount} · 초 차례예요`}
      </p>
      {miss && (
        <p className="text-rose-200 text-sm" data-follow-miss>
          이 수순에서 두는 수가 아니에요. 「힌트」를 눌러 보세요.
        </p>
      )}
      <div className="flex w-full flex-col gap-1.5 text-sm">
        {shownNotes.map(({ i, text }) => (
          <p key={i} className="leading-relaxed opacity-85">
            <span className="font-semibold">
              {i + 1}수{" "}
              {moveText(boards[i] ?? start, parseMove(moves[i] ?? ""))}
            </span>{" "}
            {text}
          </p>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={done}
          onClick={() => setHelp("piece")}
          className={buttonClass}
        >
          힌트
        </button>
        <button
          type="button"
          disabled={done}
          onClick={() => setHelp("move")}
          className={buttonClass}
        >
          수 보기
        </button>
        <button
          type="button"
          disabled={frame === 0}
          onClick={() => {
            setFrame(0);
            setMiss(false);
            setHelp("none");
          }}
          className={buttonClass}
        >
          처음부터
        </button>
      </div>
    </div>
  );
}

const SETUP_VALUES = SETUPS.map((s) => s.value);

/** 표의 칸 단추 */
function Cell({
  pressed,
  onClick,
  label,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "rounded-md border py-1.5 text-base leading-none",
        pressed
          ? "border-amber-300 bg-amber-300/25"
          : "border-white/10 bg-white/5 hover:bg-white/10",
      )}
    >
      {children}
    </button>
  );
}

/** 짝의 판: 맞상이면 대각선으로 마주 보는 두 편 상에 고리 */
function pairBoard(cho: Setup, han: Setup) {
  const pieces = openingPieces(cho, han);
  const rings = isMatsang(cho, han)
    ? Object.entries(pieces)
        .filter(([, p]) => p === "cE" || p === "hE")
        .map(([name]) => pointAt(name))
    : [];
  return { board: startBoard({ pieces }), rings };
}

/** 16가지 짝 표: 줄은 한 차림, 칸은 초 차림. 누른 칸의 판과 까닭을 아래에 */
export function MatchupTable() {
  const [han, setHan] = useState<Setup>("NENE");
  const [cho, setCho] = useState<Setup>("NENE");
  const result = matchup(han, cho);
  const { board, rings } = pairBoard(cho, han);
  return (
    <div className="flex flex-col gap-2" data-matchups>
      <div className="grid grid-cols-[4.5rem_repeat(4,minmax(0,1fr))] gap-1 text-center text-[11px]">
        <span className="self-end text-left opacity-60">한 ↓ / 초 →</span>
        {SETUP_VALUES.map((c) => (
          <span key={c} className="self-end font-semibold leading-tight">
            {setupLabel(c)}
          </span>
        ))}
        {SETUP_VALUES.map((h) => (
          <div key={h} className="contents">
            <span className="self-center text-left font-semibold leading-tight">
              {setupLabel(h)}
              <span className="block font-normal opacity-60">
                {FORMATION[h]}
              </span>
            </span>
            {SETUP_VALUES.map((c) => {
              const grade = matchup(h, c).grade;
              return (
                <Cell
                  key={c}
                  pressed={h === han && c === cho}
                  onClick={() => {
                    setHan(h);
                    setCho(c);
                  }}
                  label={`한 ${setupLabel(h)}, 초 ${setupLabel(c)}: ${GRADE_NAMES[grade]}`}
                >
                  <span data-grade={grade}>{GRADE_MARKS[grade]}</span>
                </Cell>
              );
            })}
          </div>
        ))}
      </div>
      <NumberedBoard board={board} rings={rings} />
      <div
        className="rounded-xl bg-white/5 p-2 text-sm leading-relaxed"
        data-matchup-reason
      >
        <p className="font-semibold">
          한 {setupLabel(han)} · 초 {setupLabel(cho)} →{" "}
          {GRADE_MARKS[result.grade]} {GRADE_NAMES[result.grade]}
        </p>
        <p className="opacity-85">{result.reason}</p>
      </div>
    </div>
  );
}

/** 반복 문제: 한 차림을 보여 주고 초 차림을 고른다. 초의 마·상 자리는 비워 둔다 */
export function SetupDrill({ count }: { count: number }) {
  const [round, setRound] = useState(0);
  const [order, setOrder] = useState(() => drillOrder(count, Math.random));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<Setup | null>(null);
  const [score, setScore] = useState(0);
  const finished = index >= count;
  const han = order[index] ?? "NENE";
  const board = useMemo(() => {
    const pieces = openingPieces("NENE", han);
    for (const name of ["02", "03", "07", "08"]) delete pieces[name];
    return startBoard({ pieces });
  }, [han]);

  const pick = (cho: Setup) => {
    if (picked) return;
    setPicked(cho);
    if (matchup(han, cho).grade === "best") setScore((s) => s + 1);
  };
  const next = () => {
    setPicked(null);
    setIndex((i) => i + 1);
  };
  const restart = () => {
    setOrder(drillOrder(count, Math.random));
    setIndex(0);
    setPicked(null);
    setScore(0);
    setRound((r) => r + 1);
  };

  if (finished)
    return (
      <div
        className="flex flex-col items-center gap-2 rounded-xl bg-white/5 p-3 text-sm"
        data-drill-done={score}
      >
        <p className="font-semibold">
          {count}문제 가운데 {score}문제를 맞혔어요.
        </p>
        <button type="button" onClick={restart} className={primaryClass}>
          다시 하기
        </button>
      </div>
    );

  const result = picked ? matchup(han, picked) : null;
  const best = bestAgainst(han);
  return (
    <div
      key={round}
      className="flex flex-col items-center gap-2"
      data-drill
      data-han-setup={han}
    >
      <p className="font-semibold text-sm" data-drill-progress>
        {index + 1}/{count} · 맞힘 {score}
      </p>
      <p className="text-sm">
        한이 <b>{setupLabel(han)}</b>({FORMATION[han]})을 골랐어요. 나는?
      </p>
      <NumberedBoard board={board} />
      <div className="grid w-full grid-cols-2 gap-1.5">
        {SETUP_VALUES.map((cho) => {
          const grade = picked ? matchup(han, cho).grade : null;
          return (
            <button
              key={cho}
              type="button"
              disabled={picked !== null}
              onClick={() => pick(cho)}
              className={cn(
                "rounded-xl border px-2 py-2 font-semibold text-sm",
                !picked && "border-white/15 bg-white/5 hover:bg-white/10",
                grade === "best" && "border-emerald-300 bg-emerald-500/25",
                // 「둘 만해요」는 틀린 것이 아니라 노랑, 「피해요」만 빨강
                picked === cho &&
                  grade === "ok" &&
                  "border-amber-300 bg-amber-500/25",
                picked === cho &&
                  grade === "avoid" &&
                  "border-rose-300 bg-rose-500/25",
                picked &&
                  grade !== "best" &&
                  picked !== cho &&
                  "border-white/5 opacity-50",
              )}
            >
              {setupLabel(cho)}
              {grade && ` ${GRADE_MARKS[grade]}`}
            </button>
          );
        })}
      </div>
      {result && picked && (
        <div
          className={cn(
            "w-full rounded-xl p-2 text-sm leading-relaxed",
            result.grade === "best" && "bg-emerald-500/15",
            result.grade === "ok" && "bg-amber-500/15",
            result.grade === "avoid" && "bg-rose-500/15",
          )}
          data-drill-result={result.grade}
        >
          <p className="font-semibold">
            {result.grade === "best"
              ? "좋아요!"
              : `${GRADE_NAMES[result.grade]}. 권하는 것은 ${best.map(setupLabel).join("·")}이에요.`}
          </p>
          <p className="opacity-85">{result.reason}</p>
        </div>
      )}
      {picked && (
        <button type="button" onClick={next} className={primaryClass}>
          {index + 1 < count ? "다음 문제" : "결과 보기"}
        </button>
      )}
    </div>
  );
}
