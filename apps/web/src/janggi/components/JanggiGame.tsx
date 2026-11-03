"use client";

import { janggiBotFor, masterPlanFor } from "@game/janggi-ai";
import {
  type JanggiView,
  type Kind,
  kingOf,
  MOVE_LIMIT,
  type Move,
  materialScore,
  other,
  type ScoreReason,
  SETUPS,
  SIDE_NAMES,
  seatToMove,
  sideOfSeat,
  timeControlOf,
} from "@game/janggi-engine";
import { useEffect, useMemo, useState } from "react";

import { ChatBox } from "@/components/ChatBox";
import { GameClock } from "@/components/GameClock";
import { HintButton, useHint } from "@/components/HintButton";
import { ResignButton } from "@/components/ResignButton";
import { ResultBanner } from "@/components/ResultBanner";
import { type Outcome, RoundOutcome } from "@/components/RoundOutcome";
import {
  MissionOverlay,
  type MissionProps,
} from "@/components/tutorial/MissionOverlay";
import type { ResultBanner as Banner } from "@/game/result-banner";
import { cn } from "@/lib/cn";

import { piecesInDanger } from "../danger";
import { planText } from "../plan-text";
import { BIKJANG_INFO, JANGGI_LEVELS, useJanggiSettings } from "../settings";
import { useJanggi } from "../store";
import { JanggiBoard, pieceLabel, SIDE_COLOR } from "./JanggiBoard";

const REASON_LABEL: Record<ScoreReason, string> = {
  bikjang: "빅장",
  repetition: "같은 수 되풀이",
  limit: "수 한도",
  passes: "둘 다 쉼",
};

/** 자리 표: 편(楚·漢), 이름, 남은 기물 점수, 이긴 판 수, 차례 표시 */
function PlayerPlate({
  view,
  seat,
  name,
  note,
}: {
  view: JanggiView;
  seat: number;
  name: string;
  /** 자리 표 아래 한 줄(초고수의 노림) */
  note?: string | null;
}) {
  const labels = useJanggiSettings((s) => s.labels);
  const side = sideOfSeat(view, seat);
  const turn = seatToMove(view) === seat;
  const control = timeControlOf(view.rules);
  // 이 편이 잡은 상대 기물(큰 기물부터)
  const captured = view.played
    .flatMap((p) =>
      "captured" in p && p.side === side && p.captured ? [p.captured] : [],
    )
    .sort((a, b) => CAPTURE_ORDER.indexOf(a) - CAPTURE_ORDER.indexOf(b));
  return (
    <div
      data-turn={turn || undefined}
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-1 rounded-xl border px-3 py-2",
        turn
          ? "border-amber-300 bg-amber-300/15"
          : "border-white/10 bg-white/5",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#f1e2c0] font-bold font-serif text-sm shadow-[1px_2px_2px_rgba(0,0,0,0.5)]"
          style={{ color: SIDE_COLOR[side] }}
        >
          {pieceLabel("K", side, labels)}
        </span>
        <span className="truncate font-semibold text-sm">{name}</span>
        {control && view.clocks?.[seat] && (
          <span className="ml-auto">
            <GameClock
              clock={view.clocks[seat]}
              control={control}
              running={turn && view.phase === "play"}
            />
          </span>
        )}
      </div>
      <div className="flex min-h-5 items-center gap-1 text-white/70 text-xs">
        <span className="whitespace-nowrap">
          {materialScore(view.board, side)}점 · {view.wins[seat] ?? 0}승
        </span>
        {captured.length > 0 && (
          <span
            className="ml-auto flex min-w-0 flex-wrap justify-end gap-0.5"
            role="img"
            aria-label={`잡은 기물: ${captured.map((k) => pieceLabel(k, other(side), "hangul")).join(" ")}`}
            data-captured={captured.join("")}
          >
            {captured.map((kind, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: 같은 기물이 여럿일 수 있다
                key={i}
                aria-hidden
                className="flex size-4 items-center justify-center rounded-sm bg-[#f1e2c0] font-bold font-serif text-[0.6rem] leading-none"
                style={{ color: SIDE_COLOR[other(side)] }}
              >
                {pieceLabel(kind, other(side), "hangul")}
              </span>
            ))}
          </span>
        )}
      </div>
      {note && (
        <p data-plan className="truncate text-sky-200/90 text-xs">
          {note}
        </p>
      )}
    </div>
  );
}

/** 이만큼 두면 수 한도가 다가온다고 알린다 */
const MOVE_LIMIT_WARN = MOVE_LIMIT - 40;

/** 잡은 기물을 늘어놓는 차례(큰 기물부터) */
const CAPTURE_ORDER: readonly Kind[] = ["R", "C", "N", "E", "A", "P", "K"];

/** 대국 화면 */
export function JanggiGame({
  onExit,
  mission,
}: {
  onExit: () => void;
  /** 튜토리얼 미션이면 목표 띠를 얹는다 */
  mission?: MissionProps;
}) {
  const {
    view,
    host,
    local,
    notice,
    level,
    seatNames,
    reconnecting,
    hostLeft,
    events,
  } = useJanggi();
  const submit = useJanggi((s) => s.submit);
  const undo = useJanggi((s) => s.undo);
  const canUndo = useJanggi((s) => s.canUndo());
  const clearNotice = useJanggi((s) => s.clearNotice);
  const labels = useJanggiSettings((s) => s.labels);
  const dangerHint = useJanggiSettings((s) => s.dangerHint);
  const [selected, setSelected] = useState<number | null>(null);
  const played = view?.played.length ?? 0;
  // 힌트: 고수가 고른 수, 또는 쉬기("pass"). 수가 오가면 저절로 지운다(공통 useHint)
  const { hint: hinted, showHint } = useHint<Move | "pass">(played);
  const hint = hinted === "pass" ? null : hinted;
  /** 힌트로 고수가 쉬기를 골랐다 */
  const hintPass = hinted === "pass";

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 1800);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  // 수가 오가면 고른 기물을 놓는다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 둔 수가 늘 때만 푼다
  useEffect(() => {
    setSelected(null);
  }, [played]);

  // 잡힐 위험 표시는 판이 바뀔 때만 다시 센다.
  const danger = useMemo(
    () =>
      view && host && dangerHint && view.phase === "play" && !mission
        ? piecesInDanger(view.board, sideOfSeat(view, host.seat), {
            bikjangForbidden: view.rules.bikjang === "forbidden",
          })
        : [],
    [view, host, dangerHint, mission],
  );

  if (!view || !host) return null;
  const me = host.seat;
  const mySide = sideOfSeat(view, me);
  const myMove = view.decision?.kind === "move";
  const mySetup = view.decision?.kind === "setup";
  const levelName = JANGGI_LEVELS.find((l) => l.value === level)?.label ?? "";
  const online = local === null;
  const opponent = online
    ? (seatNames?.[1 - me] ?? "상대")
    : `컴퓨터(${levelName})`;
  const result = view.result;
  const last = view.played.at(-1);
  const lastMove = last && "from" in last ? last : null;
  const checkedKing = view.check ? kingOf(view.board, view.check) : null;

  let status: string;
  if (view.phase === "setup")
    status = mySetup
      ? "상차림을 고르세요(마·상 자리)"
      : online
        ? `${opponent}가 상차림을 고르는 중`
        : "컴퓨터가 상차림을 고르는 중…";
  else if (view.phase === "play")
    status = myMove
      ? view.check === mySide
        ? "장군! 궁을 지키세요"
        : selected !== null
          ? hint && selected === hint.from
            ? "힌트: 초록 고리 자리로 옮기면 고수가 고른 수예요"
            : "갈 곳을 누르세요"
          : hintPass
            ? "힌트: 지금은 쉬어도 돼요(「한 수 쉬기」)"
            : "내 차례 — 옮길 기물을 누르세요"
      : online
        ? `${opponent}의 차례`
        : "컴퓨터가 생각하는 중…";
  else if (result?.seat === me)
    status =
      result.kind === "checkmate"
        ? "외통으로 이겼어요!"
        : result.kind === "resign"
          ? "상대가 기권했어요"
          : result.kind === "time"
            ? "상대 시간이 다 돼 이겼어요!"
            : "점수로 이겼어요!";
  else
    status =
      result?.kind === "checkmate"
        ? "외통당해 졌어요"
        : result?.kind === "resign"
          ? "기권했어요"
          : result?.kind === "time"
            ? "시간이 다 돼 졌어요"
            : "점수로 졌어요";

  // 판이 막 끝난 장면이면 모든 게임처럼 가운데에 크게 띄운다(미션은 결과 창이 따로 있다).
  const ended = events.find((e) => e.type === "roundEnded");
  const detailOf = (r: NonNullable<JanggiView["result"]>) =>
    r.kind === "checkmate"
      ? "외통!"
      : r.kind === "resign"
        ? r.seat === me
          ? "상대 기권"
          : "기권"
        : r.kind === "time"
          ? r.seat === me
            ? "상대 시간 끝"
            : "시간패"
          : `${REASON_LABEL[r.reason]} · 초 ${r.scores.c} : 한 ${r.scores.h}`;
  const banner: Banner | null =
    ended?.type === "roundEnded" && !mission
      ? { won: ended.result.seat === me, detail: detailOf(ended.result) }
      : null;
  const outcome: Outcome | null =
    result === null ? null : result.seat === me ? "win" : "loss";

  const gameOver = view.phase === "gameOver";
  const bikjangLabel = BIKJANG_INFO.find(
    (b) => b.value === view.rules.bikjang,
  )?.label;

  return (
    <main
      data-game="janggi"
      className={cn(
        "relative flex min-h-dvh flex-col items-center gap-3 bg-[#1c1917] px-4 py-3 text-white short-landscape:grid short-landscape:grid-cols-[auto_minmax(0,18rem)] short-landscape:grid-rows-[auto_auto_auto_1fr] short-landscape:content-center short-landscape:justify-center short-landscape:gap-x-6",
        // 미션 띠가 위에 놓일 자리를 비워 둔다.
        mission && "pt-16",
      )}
    >
      {mission && <MissionOverlay mission={mission} top={8} />}
      <header className="flex w-full max-w-xl items-center gap-2 text-sm short-landscape:col-start-2 short-landscape:row-start-1">
        <button
          type="button"
          onClick={onExit}
          className="text-white/70 hover:text-white"
        >
          ← 장기
        </button>
        <span className="ml-auto text-white/60">
          나는 {SIDE_NAMES[mySide]} · {bikjangLabel} · {view.roundNumber}판째
          {view.phase === "play" && played > 0 && (
            <span
              data-move-count={played}
              className={cn(played >= MOVE_LIMIT_WARN && "text-amber-300")}
            >
              {" "}
              · {played}수
              {played >= MOVE_LIMIT_WARN && `(${MOVE_LIMIT}수에서 점수로)`}
            </span>
          )}
        </span>
      </header>

      {online && (reconnecting || hostLeft) && (
        <p
          role="alert"
          className="w-full max-w-xl rounded-xl bg-rose-700/80 px-3 py-2 text-center text-sm short-landscape:col-start-2"
        >
          {hostLeft
            ? "방장이 방을 나갔습니다"
            : "방장과 연결이 끊겼습니다. 다시 연결하는 중…"}
        </p>
      )}

      <div className="flex w-full max-w-xl gap-2 short-landscape:col-start-2 short-landscape:row-start-2 short-landscape:flex-col">
        <PlayerPlate view={view} seat={me} name="나" />
        <PlayerPlate
          view={view}
          seat={1 - me}
          name={opponent}
          note={
            !online && level >= 3 && view.phase === "play"
              ? `노림: ${planText(masterPlanFor(view.board, other(mySide), view.played.length).id)}`
              : null
          }
        />
      </div>

      {/* 판은 세로로 길다(9×10). 휴대폰 가로는 판이 화면 높이를 채우고 나머지는 오른쪽에 */}
      <div
        className={cn(
          "relative aspect-[924/1024] w-[min(100%,calc((100dvh-16rem)*0.9))] max-w-xl short-landscape:col-start-1 short-landscape:row-span-4 short-landscape:row-start-1 short-landscape:w-[calc((100dvh-1.5rem)*0.9)]",
          // 미션 띠 자리만큼 줄여 판 아래가 화면 밖으로 밀리지 않게 한다.
          mission &&
            "w-[min(100%,calc((100dvh-20rem)*0.9))] short-landscape:w-[calc((100dvh-5.5rem)*0.9)]",
        )}
      >
        <JanggiBoard
          board={view.board}
          flipped={mySide === "h"}
          legal={view.legal}
          selected={selected}
          onSelect={setSelected}
          onMove={(m) => submit({ type: "move", from: m.from, to: m.to })}
          lastMove={lastMove}
          checkedKing={checkedKing}
          labels={labels}
          hint={hint}
          danger={danger}
        />
        <ResultBanner banner={banner} seq={view.roundNumber} />
      </div>

      <RoundOutcome
        outcome={outcome}
        status={notice ?? status}
        summary={`나 ${view.wins[me] ?? 0} : ${view.wins[1 - me] ?? 0} ${opponent}${result?.kind === "score" ? ` · 초 ${result.scores.c}점, 한 ${result.scores.h}점` : ""}`}
        className="short-landscape:col-start-2 short-landscape:row-start-3"
      />

      <div className="flex w-full max-w-xl flex-wrap justify-center gap-2 short-landscape:col-start-2 short-landscape:row-start-4 short-landscape:content-start">
        {mySetup && (
          <fieldset className="grid w-full grid-cols-2 gap-2">
            <legend className="sr-only">상차림</legend>
            {SETUPS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => submit({ type: "setup", setup: s.value })}
                className="rounded-xl border border-amber-300/60 bg-amber-300/10 px-3 py-2 font-semibold hover:bg-amber-300/20"
              >
                {s.label}
              </button>
            ))}
          </fieldset>
        )}
        {view.phase === "play" && (
          <>
            {!online && !mission && (
              <button
                type="button"
                disabled={!canUndo}
                onClick={() => {
                  setSelected(null);
                  undo();
                }}
                className="rounded-xl bg-white/10 px-4 py-2 disabled:opacity-40"
              >
                무르기
              </button>
            )}
            <HintButton
              online={online}
              mission={!!mission}
              myTurn={myMove}
              onHint={() => {
                // 고수가 이 판에서 고르는 수를 보여 준다(그 기물을 골라 갈 곳도 함께). 쉬기면 상태 줄로 알린다.
                const action = janggiBotFor(2).decide(view, {
                  seed: played + 1,
                });
                if (action.type === "pass") {
                  showHint("pass");
                  return;
                }
                if (action.type !== "move") return;
                showHint({ from: action.from, to: action.to });
                setSelected(action.from);
              }}
            />
            {myMove && view.check !== mySide && (
              <button
                type="button"
                onClick={() => submit({ type: "pass" })}
                className="rounded-xl bg-white/10 px-4 py-2"
              >
                한 수 쉬기
              </button>
            )}
            {/* 온라인 참가자는 내 차례에만 행동을 보낼 수 있다 */}
            {(!online || myMove) && (
              <ResignButton
                resetKey={played}
                onResign={() => submit({ type: "resign" })}
              />
            )}
          </>
        )}
        {view.phase === "roundEnd" && !view.continued[me] && (
          <button
            type="button"
            onClick={() => submit({ type: "continue" })}
            className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
          >
            다음 판
          </button>
        )}
        {/* 미션은 결과 창이 다음·다시 하기를 맡는다 */}
        {gameOver && !mission && (
          <>
            <button
              type="button"
              onClick={onExit}
              className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
            >
              다시 하기
            </button>
            <a href="/" className="rounded-xl bg-white/10 px-4 py-2">
              게임 목록
            </a>
          </>
        )}
      </div>

      {online && (
        <div className="w-full max-w-xl short-landscape:col-start-2">
          <ChatBox mySeat={me} />
        </div>
      )}
    </main>
  );
}
