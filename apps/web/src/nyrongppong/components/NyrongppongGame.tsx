"use client";

import { cardOf } from "@game/hwatu";
import {
  type GameEvent,
  HAND_SIZE,
  handValue,
  type NyrongppongView,
  type RoundResult,
  ranksOf,
  roundWinners,
  YAK_NAMES,
} from "@game/nyrongppong-engine";
import { useEffect, useRef, useState } from "react";

import { ResultBanner } from "@/components/ResultBanner";
import { type Outcome, RoundOutcome } from "@/components/RoundOutcome";
import { SeatPlateFrame } from "@/components/SeatPlate";
import type { MissionProps } from "@/components/tutorial/MissionOverlay";
import { botName } from "@/game/bot-names";
import type { ResultBanner as Banner } from "@/game/result-banner";
import { useSettings } from "@/game/settings";
import { HwatuCardView } from "@/hwatu/components/HwatuCard";
import { HwatuFan } from "@/hwatu/components/HwatuFan";
import { HwatuDeck } from "@/hwatu/components/HwatuLayout";
import {
  at,
  HWATU_PRIMARY,
  HWATU_SECONDARY,
  HwatuBoard,
  HwatuEndBox,
  HwatuHud,
  HwatuOnlineNotes,
  HwatuStage,
  HwatuVerifyLines,
} from "@/hwatu/components/HwatuTable";
import { HwatuFairBar } from "@/hwatu/fair-bar";
import { useSentLock } from "@/hwatu/sent-lock";
import { handStepFor, hwatuLayout } from "@/hwatu/table-layout";
import type { Rect } from "@/layout/compute-layout";
import { useStageSize } from "@/layout/stage-size";
import { cn } from "@/lib/cn";

import { NYRONGPPONG_LEVELS } from "../settings";
import { useNyrongppong } from "../store";

/** 나이롱뽕 화면 배경(화투 확인 화면과 같은 짙은 녹색 담요) */
export const NYRONGPPONG_BG =
  "bg-[radial-gradient(ellipse_at_top,#14532d_0%,#052e16_75%)]";

/** 뽕 응답 창에 남은 시간(ms). 화면을 받은 순간의 남은 시간에서 그 뒤 지난 시간을 뺀다 */
function useCallLeft(view: NyrongppongView | null, viewAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  const open = view?.call !== null && view?.call !== undefined;
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [open]);
  if (!view?.call) return 0;
  return Math.max(0, view.call.left - (now - viewAt));
}

/** 판이 어떻게 끝났나(한 줄) */
export function endText(
  result: RoundResult,
  name: (seat: number) => string,
  bagaji: number,
): string {
  const end = result.end;
  switch (end.kind) {
    case "yak":
      return `${name(end.seat)} ${YAK_NAMES[end.yak.kind]}(${end.yak.value}점)`;
    case "out":
      return `${name(end.seat)} 박! ${name(end.from)} 바가지 +${bagaji}`;
    case "stop":
      return end.success
        ? `${name(end.seat)} 스톱 성공`
        : `${name(end.seat)} 스톱 실패(바가지 +30)`;
    case "deckOut":
      return "더미가 떨어졌어요";
  }
}

/** 판 끝 점수표: 자리마다 이번 판 점수·합계·남은 손패 */
function RoundTable({
  view,
  name,
}: {
  view: NyrongppongView;
  name: (seat: number) => string;
}) {
  const result = view.result;
  if (!result) return null;
  const ranks = ranksOf(view.totals);
  return (
    <table aria-label="점수표" className="w-full max-w-xl text-sm tabular-nums">
      <thead className="text-white/60 text-xs">
        <tr>
          <th className="text-left font-normal">자리</th>
          <th className="text-right font-normal">이번 판</th>
          <th className="text-right font-normal">합계</th>
        </tr>
      </thead>
      <tbody>
        {result.scores.map((score, seat) => (
          <tr
            // biome-ignore lint/suspicious/noArrayIndexKey: 자리 번호가 곧 정체다
            key={seat}
            className={cn(seat === view.mySeat && "font-bold text-amber-200")}
          >
            <td className="py-0.5">
              {ranks[seat]}등 {name(seat)}
            </td>
            <td className="text-right">{score}</td>
            <td className="text-right">{result.totals[seat]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 뽕한 묶음(석 장씩 겹쳐 놓는다) */
function Melds({
  melds,
  seat,
  width,
}: {
  melds: readonly (readonly string[])[];
  seat: number;
  width: number;
}) {
  return (
    <>
      {melds.map((meld) => (
        <div key={meld[0]} className="flex -space-x-2" data-meld={seat}>
          {meld.map((id) => (
            <HwatuCardView key={id} id={id} width={width} />
          ))}
        </div>
      ))}
    </>
  );
}

/**
 * 자리 판(둘러앉은 판의 `SeatPlateFrame`): 이름, 선, 합계, 남은 손패 장수, 뽕한 묶음. 판이 끝나면 손패를 펴 보인다.
 * 손패 뒷면은 자리 판 뒤에서 판 쪽으로 펼친다(`HwatuFan`). 내 자리는 장수 대신 내 뽕을 보인다
 */
function SeatPlate({
  view,
  seat,
  name,
  rect,
  shout,
  mine = false,
}: {
  view: NyrongppongView;
  seat: number;
  name: string;
  rect: Rect;
  /** 방금 뽕을 외쳤다 */
  shout: boolean;
  mine?: boolean;
}) {
  const turn =
    (view.phase === "draw" || view.phase === "discard") && view.turn === seat;
  const revealed = mine ? undefined : view.result?.hands[seat];
  // 뽕 묶음 카드: 이름 줄(약 20px)과 위아래 여백을 뺀 높이에 맞춘다
  const card = Math.floor(Math.max(14, Math.min(30, (rect.h - 30) / 1.6)));
  return (
    <SeatPlateFrame
      rect={rect}
      active={turn}
      label={mine ? "내 자리" : `${name} 자리`}
      className="justify-start gap-1 py-1.5"
    >
      <div
        {...(mine ? {} : { "data-seat": seat })}
        data-turn={turn || undefined}
        className="flex min-w-0 items-center gap-1.5"
      >
        <span className="min-w-0 truncate font-semibold text-sm">{name}</span>
        {view.dealer === seat && (
          <span className="shrink-0 rounded bg-rose-600 px-1 text-[10px]">
            선
          </span>
        )}
        {!mine && (
          <span
            className="shrink-0 tabular-nums text-white/70"
            title="남은 손패"
            data-hand-count={seat}
          >
            {view.handCounts[seat] ?? 0}장
          </span>
        )}
        <span className="ml-auto shrink-0 tabular-nums text-white/80">
          {view.totals[seat] ?? 0}점
        </span>
      </div>
      <div className="flex min-h-0 flex-wrap items-end gap-1.5 overflow-hidden">
        {revealed && (
          <div className="flex -space-x-2" data-revealed={seat}>
            {revealed.map((id) => (
              <HwatuCardView key={id} id={id} width={card + 4} />
            ))}
          </div>
        )}
        <Melds melds={view.melds[seat] ?? []} seat={seat} width={card} />
      </div>
      {shout && (
        <span className="pop-in absolute -top-3 right-1 rounded-full bg-rose-600 px-2 py-0.5 font-black text-sm shadow-lg">
          뽕!
        </span>
      )}
    </SeatPlateFrame>
  );
}

/**
 * 대국 화면. 둘러앉은 판(docs/05 4.11, `hwatuLayout`): 다른 사람은 판 둘레 자리 판에 앉아 손패 뒷면을 판 쪽으로
 * 펼치고, 가운데 넓은 판에 더미와 버린 패, 아래에 내 손패, 그 양옆에 내 자리 판(내 뽕)과 단추(뽕·스톱·가져오기·
 * 약 내기·버리기·무르기). 판이 끝나면 결과 띠가 먼저 뜨고, 사라진 뒤 점수표 상자를 판 위에 띄운다
 */
export function NyrongppongGame({
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
    viewAt,
  } = useNyrongppong();
  const submit = useNyrongppong((s) => s.submit);
  const undo = useNyrongppong((s) => s.undo);
  const canUndo = useNyrongppong((s) => s.canUndo());
  const clearNotice = useNyrongppong((s) => s.clearNotice);
  const botNames = useSettings((s) => s.botNames);
  const stage = useStageSize();
  const [selected, setSelected] = useState<string | null>(null);
  const pointer = useRef<string>("mouse");
  const callLeft = useCallLeft(view, viewAt);
  // 방금 뽕한 자리(잠깐 "뽕!"을 띄운다)
  const [shout, setShout] = useState<number | null>(null);
  /** 보낸 행동의 결과(다음 장면이나 거절)를 기다리는 동안은 결정을 다시 보이지 않는다 */
  const sent = useSentLock(view, notice);
  /** 판 끝 결과 띠가 떠 있는 동안은 점수표 상자를 띄우지 않는다(띠가 사라진 뒤 차례로) */
  const [bannerUp, setBannerUp] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 1800);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  useEffect(() => {
    const ppong = events.find(
      (e): e is Extract<GameEvent, { type: "ppong" }> => e.type === "ppong",
    );
    if (!ppong) return;
    setShout(ppong.seat);
    const id = setTimeout(() => setShout(null), 1600);
    return () => clearTimeout(id);
  }, [events]);

  // 손패가 바뀌면 고른 카드를 놓는다.
  const handKey = view?.hand.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: 손패가 바뀔 때만 푼다
  useEffect(() => setSelected(null), [handKey]);

  const shell = (children: React.ReactNode) => (
    <HwatuStage
      game="nyrongppong"
      background={NYRONGPPONG_BG}
      mission={mission}
      stageRef={stage.ref}
    >
      {children}
    </HwatuStage>
  );
  if (!view || !host) return null;
  if (stage.width === 0) return shell(null);
  const me = host.seat;
  const online = local === null;
  const n = view.rules.players;
  const levelName =
    NYRONGPPONG_LEVELS.find((l) => l.value === level)?.label ?? "";
  const name = (seat: number) =>
    seat === me
      ? "나"
      : online
        ? (seatNames?.[seat] ?? `자리 ${seat + 1}`)
        : botName(botNames, (seat - me + n) % n);
  const others = Array.from({ length: n - 1 }, (_, i) => (me + 1 + i) % n);
  // 손패는 다섯 장에 가져온 한 장까지
  const layout = hwatuLayout(
    stage.width,
    stage.height,
    n,
    Math.max(HAND_SIZE + 1, view.hand.length),
    { compact: true },
  );
  // 행동을 보낸 뒤 다음 장면이 오기 전에는 손패·단추를 닫는다(두 번 내기 방지)
  const d = sent.waiting ? null : view.decision;
  const myDiscard = d?.kind === "discard";
  /** 행동을 보낸다. 받아들여지면 다음 장면이 올 때까지 화면을 잠근다 */
  const send = (action: Parameters<typeof submit>[0]) => {
    if (submit(action).ok) sent.mark();
  };
  const top = view.pile.at(-1) ?? null;
  const result = view.result;
  const roundOver = view.phase === "roundEnd" || view.phase === "gameOver";

  const discard = (card: string) => {
    setSelected(null);
    send({ type: "discard", card });
  };
  /** 마우스는 누르면 바로 버리고, 터치는 한 번 겨누고 다시 눌러 버린다 */
  const onCard = (card: string) => {
    const touch = pointer.current === "touch" || pointer.current === "pen";
    pointer.current = "mouse";
    if (!myDiscard) return;
    if (!touch || selected === card) discard(card);
    else setSelected(card);
  };

  let status: string;
  if (result) {
    const scores = result.scores;
    status =
      view.phase === "gameOver"
        ? view.retired
          ? "게임을 끝냈어요"
          : `게임 끝 — ${ranksOf(view.totals)[me]}등 (합계 ${view.totals[me]}점)`
        : roundWinners(scores).includes(me)
          ? `이번 판 1등! (${scores[me]}점)`
          : `이번 판 ${scores[me]}점`;
  } else if (sent.waiting) status = "보내는 중…";
  else if (d?.kind === "call")
    status = `뽕할 수 있어요! ${Math.ceil(callLeft / 1000)}초`;
  else if (d?.kind === "draw")
    // 암호화방은 뽕한 적이 있으면 늘 묻는다(방장이 손패 합을 모른다). 스톱할 수 없으면 가져오기만.
    status = d.canStop
      ? `스톱할 수 있어요(합 ${handValue(view.hand)}). 스톱하거나 한 장 가져오세요`
      : `합 ${handValue(view.hand)}라 스톱할 수 없어요. 한 장 가져오세요`;
  else if (myDiscard)
    status = d.yak
      ? `약이 됐어요: ${YAK_NAMES[d.yak.kind]}! 내거나 한 장 버리세요`
      : view.hand.length % 3 === 0 &&
          view.drawn === null &&
          view.melds[me]?.length
        ? "뽕! 한 장 더 버리세요"
        : "버릴 카드를 누르세요";
  else if (view.phase === "call") status = "뽕 응답을 기다리는 중…";
  else status = online ? `${name(view.turn)} 차례` : `${name(view.turn)} 차례…`;

  // 판이 막 끝난 장면이면 모든 게임처럼 가운데에 크게 띄운다(미션은 결과 창이 따로 있다).
  const ended = events.find(
    (e): e is Extract<GameEvent, { type: "roundEnded" }> =>
      e.type === "roundEnded",
  );
  const winners = ended ? roundWinners(ended.result.scores) : [];
  const banner: Banner | null =
    ended && !mission
      ? {
          won: winners.includes(me),
          draw: winners.includes(me) && winners.length > 1,
          detail: endText(ended.result, name, view.rules.bagaji),
        }
      : null;
  const roundWinnersNow = result ? roundWinners(result.scores) : [];
  const outcome: Outcome | null = !result
    ? null
    : roundWinnersNow.includes(me)
      ? roundWinnersNow.length > 1
        ? "draw"
        : "win"
      : "loss";

  const callOpen = view.call !== null;
  const { center, hud } = layout;
  // 가운데 판의 더미·버린 패: 판 높이에 맞추고 손패보다 크게 하지 않는다
  const pileW = Math.floor(
    Math.max(32, Math.min(layout.hand.card.w, (center.h - 80) / 1.6)),
  );
  const myHand = roundOver && result ? (result.hands[me] ?? []) : view.hand;
  const outcomeView = (
    <RoundOutcome
      outcome={outcome}
      status={notice ?? status}
      {...(result
        ? {
            summary: endText(result, name, view.rules.bagaji),
            className: "max-w-md px-4 py-2",
          }
        : {})}
    />
  );

  return shell(
    <>
      <HwatuHud
        rect={hud}
        title="← 나이롱뽕"
        onExit={onExit}
        online={online}
        mySeat={me}
        info={
          <>
            {view.roundNumber}/{view.rules.rounds}판
            {online ? "" : ` · 컴퓨터(${levelName})`} · 뽕{" "}
            {view.rules.callSeconds}초
          </>
        }
      />

      {/* 다른 사람 손패 뒷면(자리 판 뒤에서 판 쪽으로)과 자리 판 */}
      {!roundOver &&
        others.map((seat, i) => (
          <HwatuFan
            key={`fan-${seat}`}
            layout={layout}
            offset={i + 1}
            count={view.handCounts[seat] ?? 0}
          />
        ))}
      {others.map((seat, i) => {
        const rect = layout.seats[i + 1]?.plate;
        return rect ? (
          <SeatPlate
            key={seat}
            view={view}
            seat={seat}
            name={name(seat)}
            rect={rect}
            shout={shout === seat}
          />
        ) : null;
      })}

      <HwatuBoard
        rect={center}
        label="가운데"
        dim={roundOver}
        footer={
          !roundOver && (
            <>
              {outcomeView}
              <p className="text-white/60 text-xs">
                손패 합 {handValue(view.hand)}
                {view.drawn ? ` · 가져온 카드: ${cardOf(view.drawn).name}` : ""}
              </p>
            </>
          )
        }
        overlay={
          <>
            {roundOver && !bannerUp && (
              <HwatuEndBox
                rect={center}
                main={
                  <>
                    {outcomeView}
                    <div className="flex flex-wrap justify-center gap-2">
                      {view.phase === "roundEnd" && !view.continued[me] && (
                        <button
                          type="button"
                          onClick={() => send({ type: "continue" })}
                          className={HWATU_PRIMARY}
                        >
                          다음 판
                        </button>
                      )}
                      {view.phase === "gameOver" && !mission && (
                        <>
                          <button
                            type="button"
                            onClick={onExit}
                            className={HWATU_PRIMARY}
                          >
                            다시 하기
                          </button>
                          <a href="/" className={HWATU_SECONDARY}>
                            게임 목록
                          </a>
                        </>
                      )}
                    </div>
                  </>
                }
                side={
                  <>
                    <div className="rounded-2xl border border-white/15 bg-black/60 px-3 py-1">
                      <RoundTable view={view} name={name} />
                    </div>
                    {online && <HwatuVerifyLines />}
                  </>
                }
              />
            )}
            <ResultBanner
              banner={banner}
              seq={view.roundNumber}
              onShowChange={setBannerUp}
            />
          </>
        }
      >
        <div className="flex w-full items-center justify-center gap-8">
          <HwatuDeck count={view.deckCount} width={pileW * 0.85} />
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "relative rounded-lg",
                callOpen &&
                  "ring-4 ring-rose-500 ring-offset-2 ring-offset-transparent",
              )}
            >
              {top ? (
                <HwatuCardView id={top} width={pileW} className="pile-top" />
              ) : (
                <div
                  className="rounded-md border border-white/20 border-dashed"
                  style={{ width: pileW, height: (pileW * 8) / 5 }}
                />
              )}
            </div>
            <span className="text-white/70 text-xs">
              버린 패 {view.pile.length}장
            </span>
          </div>
        </div>
      </HwatuBoard>

      {online && (
        <HwatuOnlineNotes
          rect={center}
          reconnecting={reconnecting}
          hostLeft={hostLeft}
        >
          <HwatuFairBar me={me} over={view.phase === "gameOver"} />
        </HwatuOnlineNotes>
      )}

      {/* 내 자리: 내 뽕 */}
      <SeatPlate
        view={view}
        seat={me}
        name="나"
        rect={layout.myPlate}
        shout={false}
        mine
      />

      {/* 내 단추 */}
      {layout.actions && (
        <div
          className="absolute flex flex-wrap content-center items-center justify-center gap-2"
          style={at(layout.actions)}
        >
          {d?.kind === "call" && view.call && (
            <div className="flex w-full items-center gap-2">
              <button
                type="button"
                onClick={() => send({ type: "call" })}
                className="ppong-button relative flex-1 overflow-hidden rounded-2xl bg-rose-600 py-2 font-black text-2xl shadow-[0_0_24px_rgba(244,63,94,0.7)] hover:bg-rose-500"
              >
                뽕!
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-1.5 bg-amber-300"
                  style={{
                    width: `${(callLeft / (view.rules.callSeconds * 1000)) * 100}%`,
                  }}
                />
              </button>
              <button
                type="button"
                onClick={() => send({ type: "pass" })}
                className="rounded-2xl bg-white/10 px-3 py-3 text-sm"
              >
                넘기기
              </button>
            </div>
          )}
          {d?.kind === "draw" && (
            <>
              {d.canStop && (
                <button
                  type="button"
                  onClick={() => send({ type: "stop" })}
                  className={HWATU_PRIMARY}
                >
                  스톱
                </button>
              )}
              <button
                type="button"
                onClick={() => send({ type: "draw" })}
                className={cn(HWATU_SECONDARY, "bg-white/15")}
              >
                한 장 가져오기
              </button>
            </>
          )}
          {myDiscard && d.yak && (
            <button
              type="button"
              onClick={() => send({ type: "declare" })}
              className={HWATU_PRIMARY}
            >
              약 내기: {YAK_NAMES[d.yak.kind]}({d.yak.value}점)
            </button>
          )}
          {myDiscard && selected && (
            <button
              type="button"
              onClick={() => discard(selected)}
              className={cn(HWATU_SECONDARY, "bg-white/15")}
            >
              {cardOf(selected).name} 버리기
            </button>
          )}
          {!online && !mission && !roundOver && (
            <button
              type="button"
              disabled={!canUndo}
              onClick={() => undo()}
              className={HWATU_SECONDARY}
            >
              무르기
            </button>
          )}
        </div>
      )}

      {/* 내 손패 */}
      <div
        className="pointer-events-none absolute inset-x-0 flex items-end justify-center [&>*]:pointer-events-auto"
        style={{ top: layout.hand.top, bottom: layout.gutter, zIndex: 30 }}
      >
        <section
          aria-label="내 손패"
          onPointerDownCapture={(e) => {
            pointer.current = e.pointerType;
          }}
          className="flex justify-center"
        >
          {myHand.map((id, i) => (
            <HwatuCardView
              key={id}
              id={id}
              width={layout.hand.card.w}
              selected={selected === id}
              highlight={
                view.drawn === id ||
                (d?.kind === "call" &&
                  view.call !== null &&
                  cardOf(id).month === cardOf(view.call.card).month)
              }
              {...(i > 0
                ? {
                    style: {
                      marginLeft:
                        handStepFor(layout, myHand.length) - layout.hand.card.w,
                    },
                  }
                : {})}
              {...(myDiscard ? { onClick: () => onCard(id) } : {})}
            />
          ))}
        </section>
      </div>
    </>,
  );
}
