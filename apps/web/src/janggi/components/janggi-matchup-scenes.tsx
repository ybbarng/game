"use client";

import {
  applyMove,
  type Board,
  legalMoves,
  type Move,
  pointAt,
  SETUPS,
  type Setup,
} from "@game/janggi-engine";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { paced } from "@/game/settings";
import { cn } from "@/lib/cn";

import { choReply, firstMoves, pairExample } from "../matchup-examples";
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
import { openingPieces } from "../opening-lessons";
import { moveText, parseMove } from "../replay";
import type { JanggiScene } from "../tutorial";
import {
  buttonClass,
  NumberedBoard,
  PlayScene,
  primaryClass,
  startBoard,
} from "./janggi-scenes";
import { SetupButtons } from "./SetupButtons";

/*
 * 「상대 차림 보고 고르기」 단원의 판 그림(2026-11-08, docs/23 「실제 순서대로 겪어 보기」).
 * 실제 판의 차례 그대로다: 한이 먼저 상차림을 고르고, 초가 그것을 보고 고르고, 초가 첫 수를 둔다(엔진 `sideToAct`).
 * 짝마다 그 짝의 처음 판에서 직접 두고 맞혀 보는 예시(`matchup-examples.ts`)로 이어진다
 */

/** 한 차림이 놓이는 것을 알아볼 틈 */
const SETUP_DELAY_MS = 1100;

/** 마·상 자리(두 편). 차림을 고르기 전 판은 이 자리가 빈다 */
const SETUP_POINTS = {
  c: ["02", "03", "07", "08"],
  h: ["12", "13", "17", "18"],
} as const;

/** 차림을 고른 편만 마·상을 놓은 판. 고르지 않은 편은 그 자리를 비운다 */
function setupBoard(cho: Setup | null, han: Setup | null): Board {
  const pieces = openingPieces(cho ?? "NENE", han ?? "NENE");
  if (!cho) for (const p of SETUP_POINTS.c) delete pieces[p];
  if (!han) for (const p of SETUP_POINTS.h) delete pieces[p];
  return startBoard({ pieces });
}

/** 짝의 예시 장면 */
function pairScene(han: Setup, cho: Setup): JanggiScene {
  const example = pairExample(han, cho);
  return {
    pieces: openingPieces(cho, han),
    setups: { cho, han },
    replay: example.moves,
    notes: example.notes,
    ...(example.guess ? { guess: example.guess } : {}),
  };
}

/** 짝의 예시를 판에서 직접 둔다(장면은 짝마다 하나라 다시 열면 처음부터) */
function PairPlay({ han, cho }: { han: Setup; cho: Setup }) {
  const scene = useMemo(() => pairScene(han, cho), [han, cho]);
  return (
    <div
      className="flex w-full flex-col gap-1"
      data-pair-example={pairExample(han, cho).kind}
    >
      <p className="text-center font-semibold text-sm">
        {pairExample(han, cho).title}
      </p>
      <PlayScene key={`${han}-${cho}`} scenario={scene} />
    </div>
  );
}

/** 차례 흐름 칸: ① 한 차림 → ② 초 차림 → ③ 초 첫 수 */
function OrderSteps({ now }: { now: number }) {
  const steps = ["한이 차려요", "초가 보고 차려요", "초가 먼저 둬요"];
  return (
    <ol className="flex w-full items-center justify-center gap-1 text-[11px]">
      {steps.map((label, i) => (
        <li key={label} className="flex items-center gap-1">
          {i > 0 && <span className="opacity-40">→</span>}
          <span
            className={cn(
              "rounded-full px-2 py-0.5",
              i < now
                ? "bg-white/10 opacity-70"
                : i === now
                  ? "bg-amber-300/30 font-semibold"
                  : "bg-white/5 opacity-40",
            )}
            data-order-step={i}
            aria-current={i === now ? "step" : undefined}
          >
            {i + 1}. {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** 차례 그림의 짝: 한 마상마상, 초는 그것을 보고 다른 이름의 상마상마, 첫 수는 상 쪽 졸 */
const ORDER_HAN: Setup = "NENE";
const ORDER_CHO: Setup = "ENEN";

/**
 * 실제 판의 차례를 그림으로 먼저 보인다: 빈 마·상 자리 → 한 차림 → 초 차림 → 초 첫 수.
 * 다 보이면 글을 붙인다
 */
export function OrderScene() {
  const [frame, setFrame] = useState(0);
  const first = parseMove(firstMoves(ORDER_CHO)[0] ?? "");
  const last = 3;
  useEffect(() => {
    if (frame >= last) return;
    const id = setTimeout(() => setFrame((f) => f + 1), paced(1400));
    return () => clearTimeout(id);
  }, [frame]);
  const before = setupBoard(
    frame >= 2 ? ORDER_CHO : null,
    frame >= 1 ? ORDER_HAN : null,
  );
  const board = frame >= 3 ? applyMove(before, first) : before;
  const caption = [
    "판을 놓으면 마·상 자리가 비어 있어요.",
    `한이 먼저 ${setupLabel(ORDER_HAN)}을 골랐어요.`,
    `초가 한의 차림을 보고 ${setupLabel(ORDER_CHO)}를 골랐어요.`,
    `초가 첫 수를 둬요. ${moveText(before, first)}.`,
  ][frame];
  return (
    <div className="flex flex-col items-center gap-2" data-order={frame}>
      <OrderSteps now={Math.max(0, frame - 1)} />
      <NumberedBoard board={board} lastMove={frame >= 3 ? first : null} />
      <p className="font-semibold text-sm" data-order-caption>
        {caption}
      </p>
      {frame >= last && (
        <div
          className="flex w-full flex-col gap-1.5 text-[15px] leading-relaxed"
          data-order-done
        >
          <p>
            상차림은 <b>한이 먼저</b> 고르고, <b>초가 한의 차림을 보고</b>{" "}
            골라요. 두기는 <b>초가 먼저</b> 둬요.
          </p>
          <p>
            그래서 초는 상대 차림에 맞춰 고를 수 있어요. 한은 그 몫으로 덤
            1.5점을 받아요.
          </p>
          <button
            type="button"
            onClick={() => setFrame(0)}
            className={cn(buttonClass, "self-center")}
          >
            다시 보기
          </button>
        </div>
      )}
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

/** 16가지 짝 표: 줄은 한 차림, 칸은 초 차림. 누른 칸의 판과 까닭, 그 짝 예시를 판에서 둬 보기 */
export function MatchupTable() {
  const [han, setHan] = useState<Setup>("NENE");
  const [cho, setCho] = useState<Setup>("NENE");
  const [playing, setPlaying] = useState(false);
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
                    setPlaying(false);
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
      {playing ? (
        <PairPlay han={han} cho={cho} />
      ) : (
        <>
          <NumberedBoard board={board} rings={rings} />
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className={cn(primaryClass, "self-center")}
            data-pair-open
          >
            판에서 두어 보기
          </button>
        </>
      )}
    </div>
  );
}

/** 반복 문제 단추 색: 「둘 만해요」는 틀린 것이 아니라 노랑, 「피해요」만 빨강 */
function gradeTone(han: Setup, picked: Setup | null) {
  return (cho: Setup) => {
    if (!picked) return "border-white/15 bg-white/5 hover:bg-white/10";
    const grade = matchup(han, cho).grade;
    if (grade === "best") return "border-emerald-300 bg-emerald-500/25";
    if (picked !== cho) return "border-white/5 opacity-50";
    return grade === "ok"
      ? "border-amber-300 bg-amber-500/25"
      : "border-rose-300 bg-rose-500/25";
  };
}

/** 내(초) 첫 수를 판에서 둔다. 권하는 첫 수(`firstMoves`)인지 알려 준다 */
function FirstMove({
  board,
  cho,
  onDone,
}: {
  board: Board;
  cho: Setup;
  onDone: (move: Move) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <NumberedBoard
      wide
      board={board}
      legal={legalMoves(board, "c")}
      selected={selected}
      onSelect={setSelected}
      onMove={(m) => {
        setSelected(null);
        onDone(m);
      }}
      key={cho}
    />
  );
}

/**
 * 반복 문제(초): 실제 판의 차례대로 한이 먼저 차리고(판에 한 마·상이 놓인다), 내가 그것을 보고 차림을 고르고,
 * 초라 첫 수를 둔다. 맞힘은 차림으로 센다. 그 짝 예시를 판에서 둬 볼 수 있다
 */
export function SetupDrill({ count }: { count: number }) {
  const [round, setRound] = useState(0);
  const [order, setOrder] = useState(() => drillOrder(count, Math.random));
  const [index, setIndex] = useState(0);
  /**
   * 한 차림이 놓인 문제(`round`·`index`). 문제마다 열쇠로 견줘, 다음 문제로 넘어가는 렌더에
   * 앞 문제의 「놓였음」이 남지 않게 한다(남으면 단추가 잠깐 켜졌다 꺼져 누른 것이 무시된다)
   */
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [picked, setPicked] = useState<Setup | null>(null);
  const [first, setFirst] = useState<Move | null>(null);
  const [example, setExample] = useState(false);
  const [score, setScore] = useState(0);
  const finished = index >= count;
  const han = order[index] ?? "NENE";
  const problem = `${round}-${index}`;
  const hanShown = shownFor === problem;

  // 한이 먼저 차린다: 마·상 자리가 빈 판에 잠깐 뒤 한 차림이 놓인다.
  useEffect(() => {
    const id = setTimeout(() => setShownFor(problem), paced(SETUP_DELAY_MS));
    return () => clearTimeout(id);
  }, [problem]);

  const pick = (cho: Setup) => {
    if (picked || !hanShown) return;
    setPicked(cho);
    if (matchup(han, cho).grade === "best") setScore((s) => s + 1);
  };
  const next = () => {
    setPicked(null);
    setFirst(null);
    setExample(false);
    setIndex((i) => i + 1);
  };
  const restart = () => {
    setOrder(drillOrder(count, Math.random));
    setIndex(0);
    setPicked(null);
    setFirst(null);
    setExample(false);
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
  const board = setupBoard(picked, hanShown ? han : null);
  const recommended = picked ? firstMoves(picked) : [];
  const firstText = first ? `${moveText(board, first)}` : null;
  const goodFirst =
    first !== null &&
    recommended.some((t) => {
      const m = parseMove(t);
      return m.from === first.from && m.to === first.to;
    });
  return (
    <div
      key={round}
      className="flex flex-col items-center gap-2"
      data-drill
      data-han-setup={han}
      data-drill-stage={
        !hanShown ? "han" : !picked ? "pick" : !first ? "first" : "done"
      }
    >
      <p className="font-semibold text-sm" data-drill-progress>
        {index + 1}/{count} · 맞힘 {score}
      </p>
      <OrderSteps now={!hanShown ? 0 : !picked ? 1 : 2} />
      <p className="text-sm" data-drill-caption>
        {hanShown ? (
          <>
            한이 <b>{setupLabel(han)}</b>({FORMATION[han]})을 골랐어요. 나는?
          </>
        ) : (
          "한이 먼저 차리는 중이에요."
        )}
      </p>
      {example && picked ? (
        <PairPlay han={han} cho={picked} />
      ) : picked && !first ? (
        <FirstMove board={board} cho={picked} onDone={(m) => setFirst(m)} />
      ) : (
        <NumberedBoard
          wide
          board={first ? applyMove(board, first) : board}
          lastMove={first}
          {...(first && !goodFirst
            ? { hint: parseMove(recommended[0] ?? "") }
            : {})}
        />
      )}
      {!example && (
        <SetupButtons
          legend="내 상차림"
          picked={picked}
          disabled={picked !== null || !hanShown}
          onPick={pick}
          tone={gradeTone(han, picked)}
          mark={(cho) =>
            picked ? GRADE_MARKS[matchup(han, cho).grade] : undefined
          }
        />
      )}
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
          <p
            className="mt-1 opacity-85"
            data-first-move={goodFirst ? "good" : first ? "other" : "wait"}
          >
            {!first
              ? "초라서 내가 먼저 둬요. 첫 수를 판에 둬 보세요."
              : goodFirst
                ? `첫 수 ${firstText}. 차 앞 졸을 옆으로 쓸어 찻길을 열었어요.`
                : `첫 수 ${firstText}. 첫 수로는 흔히 ${recommended.join(" 또는 ")}처럼 차 앞 졸을 옆으로 쓸어 찻길을 열어요.`}
          </p>
        </div>
      )}
      {first && picked && (
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => setExample((e) => !e)}
            className={buttonClass}
            data-pair-open
          >
            {example ? "예시 닫기" : "이 짝 예시 두어 보기"}
          </button>
          <button type="button" onClick={next} className={primaryClass}>
            {index + 1 < count ? "다음 문제" : "결과 보기"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 한으로 겪어 보기: 내가 한이라 먼저 차림을 고르면, 초(컴퓨터)가 그것을 보고 고르고 첫 수를 둔다.
 * 한이 무엇을 골라도 초는 맞상을 피할 수 있다(맞상은 귀마끼리 같은 이름일 때만 생기고, 초가 나중에 고른다)
 */
export function HanDrill({ count }: { count: number }) {
  const [index, setIndex] = useState(0);
  const [han, setHan] = useState<Setup | null>(null);
  const [cho, setCho] = useState<Setup | null>(null);
  const [moved, setMoved] = useState(false);
  const [round, setRound] = useState(0);
  const finished = index >= count;

  // 내가 고르면 초가 잠깐 뒤 보고 고르고, 다시 잠깐 뒤 첫 수를 둔다.
  useEffect(() => {
    if (!han || cho) return;
    const id = setTimeout(
      () => setCho(choReply(han, Math.random)),
      paced(SETUP_DELAY_MS),
    );
    return () => clearTimeout(id);
  }, [han, cho]);
  useEffect(() => {
    if (!cho || moved) return;
    const id = setTimeout(() => setMoved(true), paced(SETUP_DELAY_MS));
    return () => clearTimeout(id);
  }, [cho, moved]);

  const next = () => {
    setHan(null);
    setCho(null);
    setMoved(false);
    setIndex((i) => i + 1);
  };

  if (finished)
    return (
      <div
        className="flex flex-col items-center gap-2 rounded-xl bg-white/5 p-3 text-sm"
        data-han-drill-done
      >
        <p className="font-semibold">
          {count}판 모두 초가 맞상을 피했어요. 한이 먼저 고르니, 한은 무엇을
          골라도 초가 맞상을 피할 수 있어요.
        </p>
        <button
          type="button"
          onClick={() => {
            setIndex(0);
            setRound((r) => r + 1);
          }}
          className={primaryClass}
        >
          다시 하기
        </button>
      </div>
    );

  const before = setupBoard(cho, han);
  const first = cho ? parseMove(firstMoves(cho)[0] ?? "") : null;
  const board = moved && first ? applyMove(before, first) : before;
  const stage = !han ? "pick" : !cho ? "cho" : !moved ? "first" : "done";
  return (
    <div
      key={round}
      className="flex flex-col items-center gap-2"
      data-han-drill={stage}
    >
      <p className="font-semibold text-sm">
        {index + 1}/{count} · 나는 한
      </p>
      <OrderSteps now={!han ? 0 : !cho ? 1 : 2} />
      <NumberedBoard flipped board={board} lastMove={moved ? first : null} />
      <SetupButtons
        legend="내(한) 상차림"
        picked={han}
        disabled={han !== null}
        onPick={setHan}
      />
      <p className="text-sm" data-han-drill-caption>
        {!han
          ? "내가 한이라 먼저 골라요."
          : !cho
            ? "초가 내 차림을 보고 고르는 중이에요."
            : `초가 ${setupLabel(cho)}(${FORMATION[cho]})를 골랐어요.`}
      </p>
      {han && cho && moved && first && (
        <div
          className="w-full rounded-xl bg-white/5 p-2 text-sm leading-relaxed"
          data-han-drill-result={isMatsang(cho, han) ? "matsang" : "avoided"}
        >
          <p className="font-semibold">
            {FORMATION[han] === "귀마"
              ? `내 이름(${setupLabel(han)})과 다른 귀마라 맞상이 아니에요.`
              : "맞상은 귀마끼리 같은 이름일 때만 생겨요. 이번에는 맞상이 될 수 없어요."}
          </p>
          <p className="opacity-85">
            그리고 초가 먼저 둬요. {moveText(before, first)}.
          </p>
        </div>
      )}
      {stage === "done" && (
        <button type="button" onClick={next} className={primaryClass}>
          {index + 1 < count ? "다음 판" : "결과 보기"}
        </button>
      )}
    </div>
  );
}
