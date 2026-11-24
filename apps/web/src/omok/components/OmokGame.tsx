"use client";

import { createRng } from "@game/mighty-engine";
import {
  type Action,
  type OmokView,
  pointName,
  seatToMove,
  stoneOfSeat,
  timeControlOf,
} from "@game/omok-engine";
import { useState } from "react";
import { BoardSeat, BoardTable } from "@/components/board-game/BoardTable";
import { ChatBox } from "@/components/ChatBox";
import { GameClock } from "@/components/GameClock";
import { GameHeader } from "@/components/GameHeader";
import { BoardSettingsButton } from "@/components/GameSettingsMenu";
import { HintButton, useHint } from "@/components/HintButton";
import { BoardOnlineAlerts } from "@/components/OnlineAlerts";
import { ResignButton } from "@/components/ResignButton";
import { ResultBanner } from "@/components/ResultBanner";
import { RoundEndButtons } from "@/components/RoundEndButtons";
import { RoundOutcome } from "@/components/RoundOutcome";
import {
  MissionOverlay,
  type MissionProps,
} from "@/components/tutorial/MissionOverlay";
import { adviseWith } from "@/game/bot-runner";
import type { ResultBanner as Banner } from "@/game/result-banner";
import { useAutoClear } from "@/lib/use-auto-clear";
import { omokKit } from "../kit";
import { OMOK_LEVELS, useOmokSettings, VARIANT_INFO } from "../settings";
import { useOmok } from "../store";
import { OmokBoard } from "./OmokBoard";

/** 자리판: 돌 색, 이름, 이긴 판 수, 대국 시계, 차례 빛 */
function PlayerPlate({
  view,
  seat,
  name,
  who,
}: {
  view: OmokView;
  seat: number;
  name: string;
  who: "me" | "opponent";
}) {
  const black = stoneOfSeat(view, seat) === 1;
  const turn = view.phase === "play" && seatToMove(view) === seat;
  const control = timeControlOf(view.rules);
  return (
    <BoardSeat
      who={who}
      turn={turn}
      name={name}
      score={`${view.wins[seat] ?? 0}승`}
      token={
        // 판 위 돌과 같은 빛(왼쪽 위)과 그림자
        <span
          className="block size-6 rounded-full shadow-[1px_2px_2px_rgba(0,0,0,0.5)]"
          style={{
            background: black
              ? "radial-gradient(circle at 36% 32%, #6b6b6b, #2a2a2a 35%, #050505)"
              : "radial-gradient(circle at 36% 32%, #ffffff, #f1f0ec 55%, #b9b6ae)",
          }}
        />
      }
      clock={
        control &&
        view.clocks?.[seat] && (
          <GameClock
            clock={view.clocks[seat]}
            control={control}
            running={turn}
            className="px-2.5 py-1 text-lg"
          />
        )
      }
    />
  );
}

/** 대국 화면 */
export function OmokGame({
  onExit,
  onRestart,
  mission,
}: {
  onExit: () => void;
  /** 혼자 하기: 같은 설정으로 새 판(게임이 끝났을 때 「다시 하기」) */
  onRestart?: () => void;
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
    invalid,
    events,
  } = useOmok();
  const submit = useOmok((s) => s.submit);
  const undo = useOmok((s) => s.undo);
  const canUndo = useOmok((s) => s.canUndo());
  const clearNotice = useOmok((s) => s.clearNotice);
  const showForbidden = useOmokSettings((s) => s.showForbidden);
  const [aim, setAim] = useState<number | null>(null);
  const played = view?.moves.length ?? 0;
  // 힌트: 고수가 이 판에서 고르는 자리(수가 오가면 저절로 지운다, 공통 useHint)
  const { hint, showHint, thinking, ask } = useHint<number>(played);

  useAutoClear(notice, clearNotice);

  if (!view || !host) return null;
  const me = host.seat;
  const myStone = stoneOfSeat(view, me);
  const myTurn = view.phase === "play" && seatToMove(view) === me;
  const levelName = OMOK_LEVELS.find((l) => l.value === level)?.label ?? "";
  const online = local === null;
  const opponent = online
    ? (seatNames?.[1 - me] ?? "상대")
    : `컴퓨터(${levelName})`;
  const result = view.result;
  const lastMove = view.moves.at(-1) ?? null;

  let status: string;
  if (view.phase === "play")
    status = myTurn
      ? aim !== null
        ? hint === aim
          ? `힌트 ${pointName(aim)}: 초록 고리가 고수가 고른 자리예요.`
          : `내 차례 · ${pointName(aim)}`
        : "내 차례예요."
      : online
        ? `${opponent}의 차례`
        : "컴퓨터가 생각하는 중…";
  else if (view.retired) status = "게임을 끝냈어요.";
  else if (result?.kind === "draw") status = "비겼어요.";
  else if (result?.seat === me)
    status =
      result.kind === "resign"
        ? "상대가 기권했어요."
        : result.kind === "time"
          ? "상대 시간이 다 돼 이겼어요!"
          : "이겼어요!";
  else
    status =
      result?.kind === "resign"
        ? "기권했어요."
        : result?.kind === "time"
          ? "시간이 다 돼 졌어요."
          : "졌어요.";

  // 판이 막 끝난 장면이면 마이티·하트처럼 가운데에 크게 띄운다(미션은 결과 창이 따로 있다).
  const ended = events.find((e) => e.type === "roundEnded");
  const banner: Banner | null =
    ended?.type === "roundEnded" && !mission
      ? {
          won: ended.result.kind !== "draw" && ended.result.seat === me,
          draw: ended.result.kind === "draw",
          detail:
            ended.result.kind === "five"
              ? "다섯!"
              : ended.result.kind === "time"
                ? ended.result.seat === me
                  ? "상대 시간 끝"
                  : "시간패"
                : ended.result.kind === "resign"
                  ? ended.result.seat === me
                    ? "상대 기권"
                    : "기권"
                  : null,
        }
      : null;
  const outcome =
    result === null || view.retired
      ? null
      : result.kind === "draw"
        ? "draw"
        : result.seat === me
          ? "win"
          : "loss";

  const gameOver = view.phase === "gameOver";
  const variantLabel = VARIANT_INFO.find(
    (v) => v.value === view.rules.variant,
  )?.label;

  return (
    <BoardTable
      game="omok"
      mission={!!mission}
      overlay={mission && <MissionOverlay mission={mission} top={8} />}
      header={
        <GameHeader
          exitLabel="← 오목"
          onExit={onExit}
          info={`${variantLabel} · ${view.roundNumber}판째`}
          settings={
            <BoardSettingsButton
              useStore={useOmokSettings}
              levels={OMOK_LEVELS}
              solo={!online && !mission}
              onQuit={
                !gameOver && !online && !mission
                  ? () => submit(omokKit.quitAction ?? omokKit.retireAction)
                  : undefined
              }
            />
          }
        />
      }
      alerts={
        online &&
        (invalid || reconnecting || hostLeft) && (
          <BoardOnlineAlerts
            invalid={invalid}
            reconnecting={reconnecting}
            hostLeft={hostLeft}
            onExit={onExit}
          />
        )
      }
      opponent={
        <PlayerPlate view={view} seat={1 - me} name={opponent} who="opponent" />
      }
      me={<PlayerPlate view={view} seat={me} name="나" who="me" />}
      board={
        <>
          <OmokBoard
            board={view.board}
            myStone={myStone}
            canPlay={myTurn}
            lastMove={lastMove}
            winLine={result?.kind === "five" ? result.line : null}
            forbidden={showForbidden ? view.forbidden : []}
            aim={aim}
            onAim={setAim}
            onPlace={(at) => submit({ type: "place", at })}
            hint={hint}
            coords={!!mission}
          />
          <ResultBanner banner={banner} seq={view.roundNumber} />
        </>
      }
      status={
        <RoundOutcome
          outcome={outcome}
          status={notice ?? status}
          summary={`나 ${view.wins[me] ?? 0} : ${view.wins[1 - me] ?? 0} ${opponent}${view.rules.winsToFinish > 1 ? ` · ${view.rules.winsToFinish}승 먼저` : ""}`}
        />
      }
      actions={
        // 방장이 나가 끝난 판에서는 판 단추를 두지 않는다(알림의 「처음으로」만)
        !hostLeft && (
          <div className="flex w-full flex-wrap justify-center gap-2">
            {view.phase === "play" && (
              <>
                {aim !== null && myTurn && (
                  <button
                    type="button"
                    onClick={() => {
                      setAim(null);
                      submit({ type: "place", at: aim });
                    }}
                    className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
                  >
                    여기 두기
                  </button>
                )}
                {!online && !mission && (
                  <button
                    type="button"
                    disabled={!canUndo}
                    onClick={() => {
                      setAim(null);
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
                  myTurn={myTurn}
                  thinking={thinking}
                  onHint={() =>
                    // 고수가 이 판에서 고르는 자리를 보여 주고 겨눠 둔다(한 번 더 누르면 둔다). 워커에서 센다.
                    ask(
                      () =>
                        adviseWith<Action>(
                          { game: "omok", name: "advisor" },
                          view,
                          createRng(played + 1).seed,
                        ),
                      (action) => {
                        if (action.type !== "place") return;
                        showHint(action.at);
                        setAim(action.at);
                      },
                    )
                  }
                />
                {/* 온라인 참가자는 내 차례에만 행동을 보낼 수 있다 */}
                {(!online || myTurn) && (
                  <ResignButton
                    resetKey={played}
                    onAsk={() => setAim(null)}
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
              <RoundEndButtons
                onRestart={online ? undefined : onRestart}
                onHome={onExit}
              />
            )}
          </div>
        )
      }
      chat={online && <ChatBox mySeat={me} />}
    />
  );
}
