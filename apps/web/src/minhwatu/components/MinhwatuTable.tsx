"use client";

import { cardOf, sortCards } from "@game/hwatu";
import {
  DEAL_SIZES,
  floorMatches,
  type MinhwatuView,
  type PlayerCount,
  type RoundResult,
  sumPoints,
  type TurnRecord,
  YAK_NAMES,
  yaksOf,
} from "@game/minhwatu-engine";
import { useEffect, useState } from "react";

import { ResultBanner } from "@/components/ResultBanner";
import { type Outcome, RoundOutcome } from "@/components/RoundOutcome";
import { SeatPlateFrame } from "@/components/SeatPlate";
import type { MissionProps } from "@/components/tutorial/MissionOverlay";
import { botName } from "@/game/bot-names";
import type { ResultBanner as Banner } from "@/game/result-banner";
import { useSettings } from "@/game/settings";
import { playUiCue } from "@/game/ui-sound";
import { HwatuCardView } from "@/hwatu/components/HwatuCard";
import { HwatuFan } from "@/hwatu/components/HwatuFan";
import {
  HwatuCaptured,
  HwatuDeck,
  HwatuFloor,
} from "@/hwatu/components/HwatuLayout";
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
import {
  endBoxRect,
  type HwatuLayout,
  handStepFor,
  hwatuLayout,
} from "@/hwatu/table-layout";
import type { Rect } from "@/layout/compute-layout";
import { useStageSize } from "@/layout/stage-size";
import { cn } from "@/lib/cn";

import { MINHWATU_LEVELS } from "../settings";
import { useMinhwatu } from "../store";

/** 민화투 화면 바탕 */
export const MINHWATU_BG =
  "bg-[radial-gradient(ellipse_at_top,#166534_0%,#052e16_75%)]";

/** 이 자리의 이름 */
export function useSeatName(view: MinhwatuView | null) {
  const seatNames = useMinhwatu((s) => s.seatNames);
  const botNames = useSettings((s) => s.botNames);
  return (seat: number) =>
    view && seat === view.seat
      ? "나"
      : (seatNames?.[seat] ?? botName(botNames, seat));
}

/** 방금 한 차례를 한 줄로 */
function turnText(turn: TurnRecord, name: (seat: number) => string): string {
  const parts = [`${name(turn.seat)}: ${cardOf(turn.played).name}`];
  parts.push(
    turn.playTook.length > 0
      ? `→ ${turn.playTook.length}장 먹음`
      : "→ 바닥에 놓음",
  );
  if (turn.flipped) {
    parts.push(`· 뒤집어 ${cardOf(turn.flipped).name}`);
    if (turn.flipTook.length > 0)
      parts.push(`→ ${turn.flipTook.length}장 먹음`);
  }
  return parts.join(" ");
}

/** 먹은 패 요약: 카드 점수와 이룬 약 */
function CapturedSummary({ view, seat }: { view: MinhwatuView; seat: number }) {
  const ids = view.captured[seat] ?? [];
  const yaks = yaksOf(ids, view.rules);
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs">
      <span className="tabular-nums" data-points={sumPoints(ids)}>
        {sumPoints(ids)}점
      </span>
      {yaks.map((y) => (
        <span
          key={y.id}
          className="rounded bg-amber-300 px-1 font-bold text-[10px] text-black"
        >
          {YAK_NAMES[y.id]}
        </span>
      ))}
    </span>
  );
}

/** 판 점수표: 자리마다 광·열끗·띠, 약 주고받기, 본, 판 점수, 합계 */
export function ScoreTable({
  result,
  totals,
  name,
}: {
  result: RoundResult;
  totals: readonly number[];
  name: (seat: number) => string;
}) {
  const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
  return (
    <table className="mt-2 w-full text-xs tabular-nums [&_td]:px-1 [&_td]:text-right [&_th]:px-1 [&_th]:text-right">
      <thead className="text-white/60">
        <tr>
          <th className="!text-left font-normal">이름</th>
          <th className="font-normal">광</th>
          <th className="font-normal">열끗</th>
          <th className="font-normal">띠</th>
          <th className="font-normal">약</th>
          <th className="font-normal">본</th>
          <th className="font-normal">판</th>
          <th className="font-normal">합계</th>
        </tr>
      </thead>
      <tbody>
        {result.scores.map((s, seat) => (
          <tr
            // biome-ignore lint/suspicious/noArrayIndexKey: 자리 번호가 곧 정체다
            key={seat}
            data-seat-score={seat}
            className={cn(result.winners.includes(seat) && "text-amber-200")}
          >
            <td className="!text-left">
              {name(seat)}
              {s.yaks.length > 0 && (
                <span className="ml-1 text-[10px] text-amber-300">
                  {s.yaks.map((y) => YAK_NAMES[y.id]).join("·")}
                </span>
              )}
            </td>
            <td>{s.gwang}</td>
            <td>{s.animal}</td>
            <td>{s.ribbon}</td>
            <td>{signed(s.yakNet)}</td>
            <td>−{s.base}</td>
            <td className="font-bold">{signed(s.total)}</td>
            <td>{signed(totals[seat] ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * 자리 판(둘러앉은 판의 `SeatPlateFrame`): 이름, 선, 카드 점수·약, 남은 손패 장수, 먹은 패.
 * 내 자리는 손패가 보이므로 장수를 빼고 손패 옆(좁으면 손패 위)에 둔다
 */
function SeatPlate({
  view,
  seat,
  name,
  rect,
  layout,
  mine = false,
}: {
  view: MinhwatuView;
  seat: number;
  name: string;
  rect: Rect;
  layout: HwatuLayout;
  mine?: boolean;
}) {
  const turn =
    (view.phase === "play" || view.phase === "pick") && view.turn === seat;
  return (
    <SeatPlateFrame
      rect={rect}
      active={turn}
      label={mine ? "내 먹은 패" : `${name} 자리`}
      className="justify-start gap-1 py-1.5"
    >
      <div
        data-seat={seat}
        data-turn={turn || undefined}
        className="flex min-w-0 items-center gap-1.5"
      >
        <span className="min-w-0 truncate font-semibold text-sm">{name}</span>
        {view.dealer === seat && (
          <span className="shrink-0 rounded bg-white/15 px-1 text-[10px]">
            선
          </span>
        )}
        <CapturedSummary view={view} seat={seat} />
        {!mine && (
          <span
            className="ml-auto shrink-0 tabular-nums text-white/70"
            title="남은 손패"
            data-hand-count={seat}
          >
            {view.handCounts[seat] ?? 0}장
          </span>
        )}
      </div>
      <HwatuCaptured
        piCount="cards"
        ids={view.captured[seat] ?? []}
        width={layout.captured}
        label={name}
        fitWidth={rect.w - 16}
      />
    </SeatPlateFrame>
  );
}

/** 내 손패. 마우스는 올리면 짝이 보이고 누르면 낸다. 터치는 한 번 눌러 겨누고 다시 눌러 낸다 */
function MyHand({
  ids,
  width,
  step,
  enabled,
  selected,
  onPreview,
  onAct,
}: {
  ids: readonly string[];
  width: number;
  /** 카드 사이 간격(왼쪽 끝에서 다음 카드 왼쪽 끝까지) */
  step: number;
  enabled: boolean;
  selected: string | null;
  onPreview: (id: string | null) => void;
  onAct: (id: string, touch: boolean) => void;
}) {
  const [touch, setTouch] = useState(false);
  return (
    <section aria-label="내 손패" className="flex justify-center">
      {sortCards(ids).map((id, i) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: 누르기는 안쪽 카드 단추가 받고, 여기서는 마우스 올림(미리 보기)과 누른 도구(터치·마우스)만 본다
        <span
          key={id}
          className="inline-flex"
          style={i > 0 ? { marginLeft: step - width } : undefined}
          onPointerDown={(e) => setTouch(e.pointerType !== "mouse")}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse" && enabled) onPreview(id);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") onPreview(null);
          }}
          onFocus={() => enabled && onPreview(id)}
        >
          <HwatuCardView
            id={id}
            width={width}
            selected={selected === id}
            dim={!enabled}
            {...(enabled ? { onClick: () => onAct(id, touch) } : {})}
          />
        </span>
      ))}
    </section>
  );
}

/**
 * 대국 화면. 둘러앉은 판(docs/05 4.11, `hwatuLayout`): 다른 사람은 판 위 끝(넷이면 양옆과 맞은편) 자리 판에
 * 앉아 손패 뒷면을 판 쪽으로 펼치고, 가운데 넓은 판에 바닥과 더미, 아래에 내 손패, 그 양옆에 내 자리 판과 단추.
 * 판이 끝나면 결과 띠가 먼저 뜨고, 사라진 뒤 점수표 상자를 판 위에 띄운다
 */
export function MinhwatuTable({
  onExit,
  mission,
  hints = false,
}: {
  onExit: () => void;
  /** 튜토리얼 미션이면 목표 띠를 얹는다 */
  mission?: MissionProps;
  /** 추천 카드를 보인다(튜토리얼 실전) */
  hints?: boolean;
}) {
  const { view, host, local, notice, level, reconnecting, hostLeft, events } =
    useMinhwatu();
  const submit = useMinhwatu((s) => s.submit);
  const undo = useMinhwatu((s) => s.undo);
  const canUndo = useMinhwatu((s) => s.canUndo());
  const clearNotice = useMinhwatu((s) => s.clearNotice);
  const name = useSeatName(view);
  const stage = useStageSize();
  /** 터치로 겨눈 카드, 또는 같은 달 둘 중 고르기를 기다리는 카드 */
  const [selected, setSelected] = useState<string | null>(null);
  const [needTarget, setNeedTarget] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  /** 보낸 행동의 결과(다음 장면이나 거절)를 기다리는 동안은 결정을 다시 보이지 않는다 */
  const sent = useSentLock(view, notice);
  /** 판 끝 결과 띠가 떠 있는 동안은 점수표 상자를 띄우지 않는다(띠가 사라진 뒤 차례로) */
  const [bannerUp, setBannerUp] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 1800);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  // 차례가 바뀌면 고른 카드를 놓는다.
  const turnKey = `${view?.roundNumber}-${view?.hand.length}-${view?.phase}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 차례가 바뀔 때만 푼다
  useEffect(() => {
    setSelected(null);
    setNeedTarget(false);
    setPreview(null);
  }, [turnKey]);

  const shell = (children: React.ReactNode) => (
    <HwatuStage
      game="minhwatu"
      background={MINHWATU_BG}
      mission={mission}
      stageRef={stage.ref}
    >
      {children}
    </HwatuStage>
  );
  if (!view || !host) return null;
  if (stage.width === 0) return shell(null);
  const me = view.seat;
  const n = view.handCounts.length;
  const online = local === null;
  const layout = hwatuLayout(
    stage.width,
    stage.height,
    n,
    Math.max(DEAL_SIZES[n as PlayerCount]?.hand ?? 7, view.hand.length),
  );
  // 행동을 보낸 뒤 다음 장면이 오기 전에는 손패·바닥 고르기를 닫는다(두 번 내기 방지)
  const decision = sent.waiting ? null : view.decision;
  const myPlay = decision?.kind === "play";
  const myPick = decision?.kind === "pick";
  const levelName = MINHWATU_LEVELS.find((l) => l.value === level)?.label ?? "";
  const others = Array.from({ length: n - 1 }, (_, i) => (me + 1 + i) % n);

  // 바닥 강조: 고를 때는 고를 수 있는 패, 아니면 미리 보는 손패와 같은 달
  const focus = selected ?? preview;
  const targets = myPick
    ? (view.pending?.options ?? [])
    : focus && myPlay
      ? floorMatches(view.floor, focus)
      : [];

  const play = (card: string, target?: string) => {
    const result = submit({
      type: "play",
      card,
      ...(target ? { target } : {}),
    });
    if (result.ok) {
      sent.mark();
      setSelected(null);
      setNeedTarget(false);
    }
  };

  const onAct = (id: string, touch: boolean) => {
    if (!myPlay) return;
    // 터치: 처음 누르면 겨누기만 한다
    if (touch && selected !== id) {
      playUiCue("pickCard");
      setSelected(id);
      setNeedTarget(false);
      return;
    }
    const matches = floorMatches(view.floor, id);
    if (matches.length === 2) {
      setSelected(id);
      setNeedTarget(true);
      return;
    }
    play(id);
  };

  const onFloorPick = (target: string) => {
    if (myPick) {
      if (submit({ type: "pick", target }).ok) sent.mark();
      return;
    }
    if (myPlay && selected && targets.includes(target)) play(selected, target);
  };

  const result = view.result;
  const gameOver = view.phase === "gameOver";
  const over = view.phase === "roundEnd" || gameOver;

  let status: string;
  if (sent.waiting && (view.phase === "pick" || view.phase === "play"))
    status = "보내는 중…";
  else if (view.phase === "pick")
    status = myPick
      ? `뒤집은 ${cardOf(view.pending?.flipped ?? "01g").name}와 짝: 먹을 바닥 패를 고르세요`
      : `${name(view.turn)}가 먹을 패를 고르는 중`;
  else if (view.phase === "play")
    status = myPlay
      ? needTarget
        ? "같은 달 바닥 패가 둘이에요. 먹을 패를 누르세요"
        : selected
          ? "한 번 더 누르면 냅니다"
          : "내 차례 — 낼 패를 누르세요"
      : online
        ? `${name(view.turn)}의 차례`
        : `${name(view.turn)}(컴퓨터)가 생각하는 중…`;
  else if (view.retired) status = "게임을 끝냈어요";
  else if (gameOver) {
    const best = Math.max(...view.totals);
    const winners = view.totals.flatMap((t, s) => (t === best ? [s] : []));
    status = winners.includes(me)
      ? winners.length > 1
        ? "공동 1등!"
        : "게임 1등!"
      : `${winners.map(name).join("·")} 1등`;
  } else {
    const mine = result?.scores[me]?.total ?? 0;
    status = result?.winners.includes(me)
      ? `판 1등! ${mine > 0 ? "+" : ""}${mine}점`
      : `이번 판 ${mine > 0 ? "+" : ""}${mine}점`;
  }

  // 판이 막 끝난 장면이면 모든 게임처럼 가운데에 크게 띄운다(미션은 결과 창이 따로 있다).
  const roundEnded = events.find((e) => e.type === "roundEnded");
  const gameEnded = events.find((e) => e.type === "gameEnded");
  let banner: Banner | null = null;
  if (!mission && gameEnded?.type === "gameEnded" && !gameEnded.retired) {
    const top = gameEnded.winners;
    banner = {
      won: top.includes(me),
      ...(top.includes(me) && top.length > 1 ? { draw: true } : {}),
      detail: `합계 ${view.totals[me] ?? 0}점`,
    };
  } else if (!mission && roundEnded?.type === "roundEnded") {
    const top = roundEnded.result.winners;
    const mine = roundEnded.result.scores[me]?.total ?? 0;
    banner = {
      won: top.includes(me),
      ...(top.includes(me) && top.length > 1 ? { draw: true } : {}),
      detail: `${mine > 0 ? "+" : ""}${mine}점`,
    };
  }
  let outcome: Outcome | null = null;
  if (over && !view.retired) {
    const winners = gameOver
      ? view.totals.flatMap((t, s) =>
          t === Math.max(...view.totals) ? [s] : [],
        )
      : (result?.winners ?? []);
    outcome = winners.includes(me)
      ? winners.length > 1
        ? "draw"
        : "win"
      : "loss";
  }

  const lastTurn = view.current ?? view.last;
  const hint =
    hints && myPlay
      ? view.hand.find((id) => floorMatches(view.floor, id).length > 0)
      : undefined;
  const { center, hud } = layout;
  const outcomeView = (
    <RoundOutcome
      outcome={outcome}
      status={notice ?? status}
      {...(over ? { className: "max-w-md px-4 py-2" } : {})}
    />
  );
  const endButtons = (
    <div className="flex flex-wrap justify-center gap-2">
      {view.phase === "roundEnd" && !view.continued[me] && (
        <button
          type="button"
          onClick={() => submit({ type: "continue" })}
          className={HWATU_PRIMARY}
        >
          다음 판
        </button>
      )}
      {view.phase === "roundEnd" && view.continued[me] && (
        <span className="py-2 text-sm text-white/70">
          다른 사람을 기다리는 중…
        </span>
      )}
      {gameOver && !mission && (
        <>
          <button type="button" onClick={onExit} className={HWATU_PRIMARY}>
            다시 하기
          </button>
          <a href="/" className={HWATU_SECONDARY}>
            게임 목록
          </a>
        </>
      )}
    </div>
  );

  return shell(
    <>
      <HwatuHud
        rect={hud}
        title="← 민화투"
        onExit={onExit}
        online={online}
        mySeat={me}
        info={
          <>
            {online ? "친구와" : `컴퓨터(${levelName})`} · {view.roundNumber}/
            {view.rules.rounds}판
          </>
        }
      />

      {/* 다른 사람 손패 뒷면(자리 판 뒤에서 판 쪽으로)과 자리 판 */}
      {others.map((seat, i) => (
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
            layout={layout}
          />
        ) : null;
      })}

      <HwatuBoard
        rect={center}
        dim={over}
        footer={
          !over && (
            <>
              <p
                aria-live="polite"
                className="max-w-full truncate text-[11px] text-white/65"
              >
                {lastTurn ? turnText(lastTurn, name) : ""}
              </p>
              {outcomeView}
            </>
          )
        }
        overlay={
          <ResultBanner
            banner={banner}
            seq={view.roundNumber * 2 + (gameOver ? 1 : 0)}
            onShowChange={setBannerUp}
          />
        }
      >
        <div className="flex shrink-0 flex-col items-center gap-2">
          <HwatuDeck count={view.deckCount} width={layout.deck} />
          {view.pending && (
            <div className="flex flex-col items-center gap-0.5 text-[10px] text-amber-200">
              <HwatuCardView
                id={view.pending.flipped}
                width={layout.deck}
                highlight
              />
              뒤집은 패
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
          <HwatuFloor
            ids={view.floor}
            width={layout.floor}
            highlight={(id) => targets.includes(id)}
            {...(myPick || needTarget ? { onPick: onFloorPick } : {})}
          />
        </div>
      </HwatuBoard>

      {/* 판 끝 결과 상자(판이 낮으면 비는 손패 줄까지 넓힌다) */}
      {over && !bannerUp && (
        <HwatuEndBox
          rect={endBoxRect(layout, stage.height)}
          main={
            <>
              {outcomeView}
              {endButtons}
            </>
          }
          side={
            <>
              {result && (
                <div className="rounded-2xl border border-white/15 bg-black/60 px-3 py-1">
                  <ScoreTable
                    result={result}
                    totals={view.totals}
                    name={name}
                  />
                </div>
              )}
              {online && <HwatuVerifyLines />}
            </>
          }
        />
      )}

      {online && (
        <HwatuOnlineNotes
          rect={center}
          reconnecting={reconnecting}
          hostLeft={hostLeft}
        >
          <HwatuFairBar me={me} over={gameOver} />
        </HwatuOnlineNotes>
      )}

      {/* 내 자리 */}
      <SeatPlate
        view={view}
        seat={me}
        name="나"
        rect={layout.myPlate}
        layout={layout}
        mine
      />

      {/* 내 단추 */}
      {layout.actions && (
        <div
          className="absolute flex flex-wrap content-center items-center justify-center gap-2"
          style={at(layout.actions)}
        >
          {hint && (
            <p className="w-full text-center text-amber-200 text-xs">
              추천: {cardOf(hint).name}(바닥에 짝이 있어요)
            </p>
          )}
          {!over && !online && !mission && (
            <>
              <button
                type="button"
                disabled={!canUndo}
                onClick={() => {
                  setSelected(null);
                  undo();
                }}
                className={HWATU_SECONDARY}
              >
                무르기
              </button>
              <button
                type="button"
                onClick={() => submit({ type: "retire" })}
                className={HWATU_SECONDARY}
              >
                그만하기
              </button>
            </>
          )}
        </div>
      )}

      {/* 내 손패 */}
      <div
        className="pointer-events-none absolute inset-x-0 flex items-end justify-center [&>*]:pointer-events-auto"
        style={{ top: layout.hand.top, bottom: layout.gutter, zIndex: 30 }}
      >
        <MyHand
          ids={view.hand}
          width={layout.hand.card.w}
          step={handStepFor(layout, view.hand.length)}
          enabled={myPlay}
          selected={selected}
          onPreview={setPreview}
          onAct={onAct}
        />
      </div>
    </>,
  );
}
