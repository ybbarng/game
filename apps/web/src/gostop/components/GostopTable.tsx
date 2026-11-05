"use client";

import {
  BAK_NAMES,
  dealSizes,
  type GameEvent,
  type GostopView,
  goThreshold,
  type Settlement,
  SPECIAL_NAMES,
  settlementLines,
} from "@game/gostop-engine";
import { cardOf, MONTH_NAMES, monthOf } from "@game/hwatu";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

import { ChatBox } from "@/components/ChatBox";
import { useHandControls } from "@/components/hand-controls";
import { ResultBanner } from "@/components/ResultBanner";
import { type Outcome, RoundOutcome } from "@/components/RoundOutcome";
import { SeatPlateFrame } from "@/components/SeatPlate";
import {
  MissionOverlay,
  type MissionProps,
} from "@/components/tutorial/MissionOverlay";
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
  HwatuHand,
} from "@/hwatu/components/HwatuLayout";
import { HwatuFairBar } from "@/hwatu/fair-bar";
import { useSentLock } from "@/hwatu/sent-lock";
import {
  type HwatuLayout,
  handStepFor,
  hwatuLayout,
} from "@/hwatu/table-layout";
import type { Rect } from "@/layout/compute-layout";
import { useStageSize } from "@/layout/stage-size";
import { cn } from "@/lib/cn";
import { useChat } from "@/net/chat";

import { GOSTOP_LEVELS } from "../settings";
import { useGostop } from "../store";

/** 튜토리얼 미션 띠 자리(판 위에 따로 둔다) */
const MISSION_INSET = 64;

const at = (r: Rect): CSSProperties => ({
  left: r.x,
  top: r.y,
  width: r.w,
  height: r.h,
});

/** 이름 고르기: 온라인은 방 이름, 혼자 하기는 나·컴퓨터 이름 */
export function useSeatName(me: number): (seat: number) => string {
  const seatNames = useGostop((s) => s.seatNames);
  const botNames = useSettings((s) => s.botNames);
  return (seat) =>
    seat === me ? "나" : (seatNames?.[seat] ?? botName(botNames, seat));
}

/**
 * 자리 판(둘러앉은 판의 SeatPlateFrame): 이름, 손패 뒷면, 고·흔들기·뻑, 지금 점수·게임 점수, 먹은 패.
 * 내 자리는 손패가 보이므로 뒷면을 빼고 손패 옆(좁으면 손패 위)에 둔다
 */
function SeatPlate({
  view,
  seat,
  name,
  rect,
  layout,
  mine = false,
}: {
  view: GostopView;
  seat: number;
  name: string;
  rect: Rect;
  layout: HwatuLayout;
  mine?: boolean;
}) {
  const turn = view.phase === "play" && view.turn === seat;
  const tags = [
    view.dealer === seat ? "선" : null,
    view.goCount[seat] ? `${view.goCount[seat]}고` : null,
    view.shakes[seat] ? `흔들 ${view.shakes[seat]}` : null,
    view.ppeok[seat] ? `뻑 ${view.ppeok[seat]}` : null,
  ].filter(Boolean);
  const revealed = mine ? [] : (view.revealed[seat] ?? []);
  return (
    <SeatPlateFrame
      rect={rect}
      active={turn}
      label={`${name} 자리`}
      className="justify-start gap-1 py-1.5"
    >
      <div
        data-seat={seat}
        data-turn={turn || undefined}
        className="flex min-w-0 items-center gap-1.5"
      >
        <span className="min-w-0 truncate font-semibold text-sm">{name}</span>
        {tags.map((t) => (
          <span
            key={t}
            className="shrink-0 rounded bg-white/15 px-1 text-[10px] text-white/90"
          >
            {t}
          </span>
        ))}
        {!mine && (
          <span
            className="shrink-0 tabular-nums text-white/70"
            title="남은 손패"
            data-hand-count={seat}
          >
            {view.handCounts[seat] ?? 0}장
          </span>
        )}
        {revealed.length > 0 && (
          <span
            className="flex shrink-0 -space-x-1"
            title="흔들어 보인 패"
            data-revealed={seat}
          >
            {revealed.map((id) => (
              <HwatuCardView key={id} id={id} width={14} />
            ))}
          </span>
        )}
        <span className="ml-auto shrink-0 whitespace-nowrap tabular-nums text-white/80">
          <b data-live-score={seat} className="text-amber-200">
            {view.liveScores[seat] ?? 0}점
          </b>{" "}
          · 합 {view.scores[seat] ?? 0}
        </span>
      </div>
      <HwatuCaptured
        ids={view.captured[seat] ?? []}
        width={layout.captured}
        label={name}
        fitWidth={rect.w - 16}
      />
    </SeatPlateFrame>
  );
}

/** 지난 걸음 한 줄 요약: 누가 무엇을 내고 무엇을 뒤집었나, 뻑·쪽… */
function lastStepText(
  events: readonly GameEvent[],
  name: (seat: number) => string,
): string | null {
  const parts: string[] = [];
  for (const e of events) {
    if (e.type === "played")
      parts.push(
        `${name(e.seat)}: ${cardOf(e.card).name}${e.shake ? " 흔들기" : ""}`,
      );
    else if (e.type === "bombed")
      parts.push(
        `${name(e.seat)}: ${MONTH_NAMES[monthOf(e.cards[0] as string)]} 폭탄`,
      );
    else if (e.type === "flipOnly") parts.push(`${name(e.seat)}: 뒤집기만`);
    else if (e.type === "flipped") parts.push(`뒤집기 ${cardOf(e.card).name}`);
    else if (e.type === "special") parts.push(`${SPECIAL_NAMES[e.kind]}!`);
    else if (e.type === "stolen")
      parts.push(`${name(e.from)} → ${name(e.to)} 피 한 장`);
    else if (e.type === "go") parts.push(`${name(e.seat)} ${e.count}고!`);
    else if (e.type === "stopped") parts.push(`${name(e.seat)} 스톱!`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** 판 끝 정산 상자: 점수 내역, 박, 자리마다 점수 변화 */
function SettlementBox({
  s,
  name,
  players,
  className,
}: {
  s: Settlement;
  name: (seat: number) => string;
  players: number;
  className?: string;
}) {
  return (
    <section
      aria-label="판 정산"
      className={cn(
        "w-full max-w-xl rounded-2xl border border-white/15 bg-black/40 px-4 py-2 text-sm",
        className,
      )}
    >
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {settlementLines(s).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <ul className="mt-1.5 flex flex-col gap-0.5">
        {Array.from({ length: players }, (_, seat) => {
          const baks = s.baks[seat] ?? [];
          const delta = s.deltas[seat] ?? 0;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: 자리 번호가 곧 정체다
            <li key={seat} className="flex justify-between gap-2">
              <span>
                {name(seat)}
                {baks.length > 0 && (
                  <span className="ml-1 text-rose-300">
                    {baks.map((b) => BAK_NAMES[b]).join("·")}
                  </span>
                )}
                {s.payer === seat && (
                  <span className="ml-1 text-rose-300">(독박)</span>
                )}
              </span>
              <span
                className={cn(
                  "tabular-nums",
                  delta > 0 && "text-amber-300",
                  delta < 0 && "text-white/70",
                )}
              >
                {delta > 0 ? `+${delta}` : delta}점
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 가운데에 띄우는 물음 창(고·스톱, 고르기, 흔들기·폭탄) */
function Prompt({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/45 p-4">
      <div
        role="dialog"
        aria-label={label}
        className="pop-in flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border border-amber-300/50 bg-[#0a3622] p-4 text-center shadow-2xl"
      >
        {children}
      </div>
    </div>
  );
}

const BUTTON = "rounded-xl px-4 py-2 text-sm";
const PRIMARY = cn(BUTTON, "bg-amber-300 font-semibold text-black");
const SECONDARY = cn(BUTTON, "bg-white/10 disabled:opacity-40");

/**
 * 대국 화면. 둘러앉은 판(docs/05 4절, `gostopLayout`): 상대는 맞은편(2인)·위 양옆(3인) 자리 판에 손패 뒷면과
 * 먹은 패를 보이고, 가운데 넓은 판에 더미와 바닥 패를 펼치고, 아래에 내 손패, 그 양옆에 내 자리 판과 단추.
 * 판이 끝나면 결과와 정산을 가운데 판 위에 띄운다
 */
export function GostopTable({
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
    reconnecting,
    hostLeft,
    events,
    seq,
  } = useGostop();
  const submit = useGostop((s) => s.submit);
  const undo = useGostop((s) => s.undo);
  const canUndo = useGostop((s) => s.canUndo());
  const clearNotice = useGostop((s) => s.clearNotice);
  const stage = useStageSize();
  const controls = useHandControls<string>();
  const chatOpen = useChat((s) => s.open);
  const setChatOpen = useChat((s) => s.setOpen);
  const chatUnread = useChat((s) => s.unread);
  const chatMessages = useChat((s) => s.messages);
  const [selected, setSelected] = useState<string | null>(null);
  /** 흔들기·폭탄을 물을 카드 */
  const [asking, setAsking] = useState<string | null>(null);
  /** 보낸 행동의 결과(다음 장면이나 거절)를 기다리는 동안은 결정을 다시 보이지 않는다 */
  const sent = useSentLock(seq, notice);
  /** 판 끝 결과 띠가 떠 있는 동안은 결과·정산 상자를 띄우지 않는다(띠가 사라진 뒤 차례로) */
  const [bannerUp, setBannerUp] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 1800);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  // 새 장면이 오면 고른 카드를 놓는다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 장면 번호가 바뀔 때만 푼다
  useEffect(() => {
    setSelected(null);
    setAsking(null);
  }, [seq]);

  const name = useSeatName(view?.mySeat ?? 0);
  const inset = mission ? MISSION_INSET : 0;
  const stageStyle: CSSProperties | undefined =
    inset > 0
      ? { marginTop: inset, height: `calc(100dvh - ${inset}px)` }
      : undefined;
  const shell = (children: React.ReactNode) => (
    <main
      data-game="gostop"
      className="relative h-dvh w-full overflow-hidden bg-[radial-gradient(ellipse_at_center,#166534_0%,#0a3622_75%)] text-white"
    >
      {mission && <MissionOverlay mission={mission} top={8} />}
      <div
        ref={stage.ref}
        className="relative h-dvh w-full"
        style={stageStyle}
        {...controls.handlers}
      >
        {children}
      </div>
    </main>
  );
  if (!view || !host) return null;
  if (stage.width === 0) return shell(null);

  const me = host.seat;
  const n = view.rules.players;
  const others = Array.from({ length: n - 1 }, (_, i) => (me + 1 + i) % n);
  const online = local === null;
  const layout = hwatuLayout(
    stage.width,
    stage.height,
    n,
    Math.max(dealSizes(view.rules).hand, view.hand.length),
  );
  // 행동을 보낸 뒤 다음 장면이 오기 전에는 손패·물음 창·단추를 닫는다(두 번 내기 방지)
  const d = sent.waiting ? null : view.decision;
  const myPlay = d?.kind === "play" ? d : null;
  const levelName = GOSTOP_LEVELS.find((l) => l.value === level)?.label ?? "";
  const result = view.result;
  const ended = view.phase !== "play" && result !== null;

  /** 행동을 보낸다. 받아들여지면 다음 장면이 올 때까지 화면을 잠그고, 고른 카드와 물음 창을 닫는다 */
  const send = (action: Parameters<typeof submit>[0]) => {
    const result = submit(action);
    if (result.ok) {
      sent.mark();
      setSelected(null);
      setAsking(null);
    }
  };
  const play = (card: string, extra?: { shake?: true; bomb?: boolean }) => {
    if (extra?.bomb) send({ type: "bomb", month: monthOf(card) });
    else send({ type: "play", card, ...(extra?.shake ? { shake: true } : {}) });
  };
  /** 고른 카드를 낸다. 흔들기·폭탄이 되면 먼저 묻는다 */
  const commit = (card: string) => {
    if (!myPlay) return;
    const canShake = myPlay.shakeable.includes(card);
    const canBomb = myPlay.bombs.includes(monthOf(card));
    if (canShake || canBomb) setAsking(card);
    else play(card);
  };
  /** 손패를 누른다: 처음엔 고르고(짝 맞는 바닥 강조), 다시 누르면 낸다 */
  const pick = (card: string) => {
    if (!myPlay || controls.gestureMoved()) return;
    if (selected !== card) {
      playUiCue("click");
      setSelected(card);
      return;
    }
    commit(card);
  };
  // 손패 훑기·위로 끌어 내기·←→ Enter(마이티·하트와 같은 손패 조작)
  controls.update({
    stage: stage.ref.current,
    hand: view.hand,
    playable: myPlay && !asking ? new Set(view.hand) : null,
    selected,
    setSelected,
    canPlay: myPlay !== null && asking === null,
    handTop: layout.hand.top,
    cardHeight: layout.hand.card.h,
    play: commit,
    cancel: () => setSelected(null),
  });

  let status: string;
  if (view.phase === "play") {
    if (sent.waiting) status = "보내는 중…";
    else if (d?.kind === "play")
      status = selected
        ? "한 번 더 누르면 냅니다"
        : d.cards.length === 0
          ? "뒤집기만 하세요"
          : "내 차례 — 낼 카드를 고르세요";
    else if (d?.kind === "choose") status = "먹을 바닥 카드를 고르세요";
    else if (d?.kind === "goStop") status = `${d.score}점! 고 또는 스톱`;
    else status = `${name(view.turn)} 차례…`;
  } else if (result?.winner === me)
    status = result.kind === "chongtong" ? "총통으로 이겼어요!" : "이겼어요!";
  else if (result?.winner === null) status = "나가리";
  else status = `${name(result?.winner ?? 0)} 승리`;

  // 판이 막 끝난 장면이면 가운데에 크게 띄운다(미션은 결과 창이 따로 있다).
  const endedNow = events.find((e) => e.type === "roundEnded");
  const banner: Banner | null =
    endedNow?.type === "roundEnded" && !mission
      ? {
          won: endedNow.settlement.winner === me,
          ...(endedNow.settlement.winner === null ? { draw: true } : {}),
          detail:
            endedNow.settlement.winner === null
              ? "다음 판 두 배"
              : `${(endedNow.settlement.deltas[me] ?? 0) > 0 ? "+" : ""}${endedNow.settlement.deltas[me] ?? 0}점`,
        }
      : null;
  const outcome: Outcome | null = !ended
    ? null
    : result?.winner === null
      ? "draw"
      : result?.winner === me
        ? "win"
        : "loss";

  const highlightMonth =
    d?.kind === "play" && selected ? monthOf(selected) : null;
  const chooseOptions = d?.kind === "choose" ? d.options : [];
  const pendingCard = view.pending?.card ?? null;
  const pendingFlip =
    view.pending && d?.kind === "choose" && view.pending.flipped;
  const last = lastStepText(events, name);
  const threshold = goThreshold(view.rules);
  const { center, hud } = layout;
  // 가운데 판이 낮고 넓으면(휴대폰 가로) 판 끝 결과를 옆으로 나란히 놓는다
  const wideCenter = center.w > center.h * 2.4;

  const outcomeView = (
    <RoundOutcome
      outcome={outcome}
      status={notice ?? status}
      summary={
        result
          ? `나 ${view.scores[me] ?? 0}점 · ${others.map((s) => `${name(s)} ${view.scores[s] ?? 0}점`).join(" · ")}`
          : undefined
      }
      {...(ended ? { className: "max-w-md px-4 py-2" } : {})}
    />
  );
  const endButtons = (
    <div className="flex flex-wrap justify-center gap-2">
      {view.phase === "roundEnd" && !view.continued[me] && (
        <button
          type="button"
          onClick={() => send({ type: "continue" })}
          className={PRIMARY}
        >
          다음 판
        </button>
      )}
      {view.phase === "gameOver" && !mission && (
        <>
          <button type="button" onClick={onExit} className={PRIMARY}>
            다시 하기
          </button>
          <a href="/" className={SECONDARY}>
            게임 목록
          </a>
        </>
      )}
    </div>
  );

  return shell(
    <>
      {/* 위 막대 */}
      <header
        className="absolute flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-xl bg-black/30 px-3 text-sm"
        style={at(hud)}
      >
        <button
          type="button"
          onClick={onExit}
          className="shrink-0 text-white/70 hover:text-white"
        >
          ← 고스톱
        </button>
        <span className="ml-auto min-w-0 truncate text-right text-white/60 text-xs">
          {n === 2 ? "맞고" : "3명"} · {view.roundNumber}/{view.rules.rounds}판
          · {threshold}점부터 고
          {view.nagari > 0 ? ` · 나가리 ×${2 ** view.nagari}` : ""}
          {online ? "" : ` · ${levelName}`}
        </span>
        {online && (
          <button
            type="button"
            onClick={() => setChatOpen(!chatOpen)}
            className="relative shrink-0 rounded-lg bg-white/10 px-1.5 py-0.5 text-xs hover:bg-white/20"
          >
            채팅
            {chatUnread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-rose-500 px-1 text-[10px] leading-4">
                {chatUnread}
              </span>
            )}
          </button>
        )}
      </header>

      {/* 상대 손패 뒷면(자리 판 뒤에서 판 쪽으로) */}
      {others.map((seat, i) => (
        <HwatuFan
          key={`fan-${seat}`}
          layout={layout}
          offset={i + 1}
          count={view.handCounts[seat] ?? 0}
        />
      ))}

      {/* 상대 자리 */}
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

      {/* 가운데 판: 더미와 바닥. 판 끝 결과·정산도 여기에 띄운다 */}
      <div
        className="absolute rounded-[2rem] border border-white/10 bg-black/15 shadow-[inset_0_0_48px_rgba(0,0,0,0.35)]"
        style={at(center)}
      >
        <div
          className={cn(
            "flex h-full items-center gap-3 px-3 pt-2 pb-12 transition-opacity",
            ended && "opacity-25",
          )}
        >
          <div className="flex shrink-0 flex-col items-center gap-1">
            <HwatuDeck count={view.deckCount} width={layout.deck} />
            {view.stacks.length > 0 && (
              <p className="max-w-24 text-center text-[10px] text-white/60">
                뻑:{" "}
                {view.stacks
                  .map(
                    (x) =>
                      `${MONTH_NAMES[x.month]}${x.owner === null ? "" : `(${name(x.owner)})`}`,
                  )
                  .join(", ")}
              </p>
            )}
            {pendingCard && d?.kind === "choose" && (
              <div className="flex flex-col items-center text-[10px] text-white/70">
                {pendingFlip ? "뒤집은 카드" : "낸 카드"}
                <HwatuCardView
                  id={
                    pendingFlip
                      ? (view.pending?.flipped ?? pendingCard)
                      : pendingCard
                  }
                  width={layout.deck}
                  selected
                />
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1">
            <HwatuFloor
              ids={view.floor}
              width={layout.floor}
              highlight={(id) =>
                chooseOptions.length > 0
                  ? chooseOptions.includes(id)
                  : highlightMonth !== null && monthOf(id) === highlightMonth
              }
              {...(chooseOptions.length > 0
                ? {
                    onPick: (id: string) => send({ type: "choose", card: id }),
                  }
                : {})}
            />
          </div>
        </div>
        {!ended && (
          <div className="absolute inset-x-2 bottom-1 flex flex-col items-center text-sm">
            <p
              aria-live="off"
              data-last-step
              className="max-w-full truncate text-[11px] text-white/65"
            >
              {last ?? ""}
            </p>
            {outcomeView}
          </div>
        )}
        {ended && result && !bannerUp && (
          <div
            className={cn(
              "pop-in absolute inset-0 flex items-center justify-center gap-2 overflow-y-auto rounded-[2rem] bg-black/60 p-2 backdrop-blur-sm",
              wideCenter ? "flex-row" : "flex-col",
            )}
          >
            <div className="flex flex-col items-center gap-2">
              {outcomeView}
              {endButtons}
            </div>
            <div className="flex w-full max-w-md flex-col gap-1">
              <SettlementBox
                s={result}
                name={name}
                players={n}
                className="bg-black/60"
              />
              {/* 판 끝 검증 결과는 채팅을 닫아 두어도 결과 곁에 보인다 */}
              {online &&
                chatMessages
                  .filter((m) => m.seat < 0 && m.name === "검증")
                  .map((m) => (
                    <p key={m.id} className="text-white/75 text-xs">
                      [{m.name}] {m.text}
                    </p>
                  ))}
            </div>
          </div>
        )}
        <ResultBanner banner={banner} seq={seq} onShowChange={setBannerUp} />
      </div>

      {online && (
        <div
          className="absolute z-[230] flex flex-col items-center gap-1"
          style={{ left: center.x, width: center.w, top: center.y + 6 }}
        >
          <HwatuFairBar me={me} over={view.phase === "gameOver"} />
          {(reconnecting || hostLeft) && (
            <p
              role="alert"
              className="rounded-xl bg-rose-700/90 px-3 py-1.5 text-center text-sm"
            >
              {hostLeft
                ? "방장이 방을 나갔습니다"
                : "방장과 연결이 끊겼습니다. 다시 연결하는 중…"}
            </p>
          )}
        </div>
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
          {myPlay && selected && (
            <button
              type="button"
              onClick={() => commit(selected)}
              className={PRIMARY}
            >
              내기
            </button>
          )}
          {myPlay?.flip && (
            <button
              type="button"
              onClick={() => send({ type: "flip" })}
              className={SECONDARY}
            >
              뒤집기만
            </button>
          )}
          {view.phase === "play" && !online && !mission && (
            <button
              type="button"
              disabled={!canUndo}
              onClick={() => {
                setSelected(null);
                undo();
              }}
              className={SECONDARY}
            >
              무르기
            </button>
          )}
        </div>
      )}

      {/* 내 손패 */}
      <div
        className="absolute inset-x-0 flex items-end justify-center"
        style={{
          top: layout.hand.top,
          bottom: layout.gutter,
          zIndex: 30,
        }}
      >
        <HwatuHand
          ids={view.hand}
          width={layout.hand.card.w}
          step={handStepFor(layout, view.hand.length)}
          selected={selected}
          playable={() => myPlay !== null}
          onSelect={pick}
        />
      </div>

      {online && chatOpen && (
        <div
          className="absolute right-3 z-[380] w-[min(92%,22rem)] rounded-2xl border border-white/15 bg-[#0a3622]/95 p-3 shadow-2xl backdrop-blur"
          style={{ top: hud.y + hud.h + 6 }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-sm">채팅</span>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="rounded bg-white/10 px-2 text-xs"
            >
              닫기
            </button>
          </div>
          <ChatBox mySeat={me} />
        </div>
      )}

      {d?.kind === "goStop" && (
        <Prompt label="고 또는 스톱">
          <p className="font-black text-3xl text-amber-300">{d.score}점</p>
          <p className="text-sm text-white/80">
            {d.goCount > 0 ? `지금 ${d.goCount}고. ` : ""}
            고를 부르면 더 하고(점수 덤·두 배), 지면 고박입니다. 스톱하면 지금
            점수로 이깁니다.
          </p>
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() => send({ type: "go" })}
              className="flex-1 rounded-xl bg-rose-600 py-3 font-black text-xl"
            >
              고
            </button>
            <button
              type="button"
              onClick={() => send({ type: "stop" })}
              className="flex-1 rounded-xl bg-amber-300 py-3 font-black text-black text-xl"
            >
              스톱
            </button>
          </div>
        </Prompt>
      )}

      {d?.kind === "choose" && (
        <Prompt label="먹을 카드 고르기">
          <p className="text-sm">
            같은 달이 바닥에 둘 있어요. 어느 카드를 먹을까요?
          </p>
          <div className="flex gap-3">
            {d.options.map((id) => (
              <HwatuCardView
                key={id}
                id={id}
                width={64}
                highlight
                onClick={() => send({ type: "choose", card: id })}
              />
            ))}
          </div>
        </Prompt>
      )}

      {asking && myPlay && (
        <Prompt label="흔들기·폭탄">
          <p className="text-sm">
            {myPlay.bombs.includes(monthOf(asking))
              ? `${MONTH_NAMES[monthOf(asking)]} 석 장을 들고 바닥에 한 장이 있어요. 폭탄으로 넉 장을 다 먹고 점수를 두 배로 할까요?`
              : `${MONTH_NAMES[monthOf(asking)]} 석 장을 들고 있어요. 흔들어 보이고 점수를 두 배로 할까요?`}
          </p>
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() =>
                myPlay.bombs.includes(monthOf(asking))
                  ? play(asking, { bomb: true })
                  : play(asking, { shake: true })
              }
              className="flex-1 rounded-xl bg-rose-600 py-2 font-bold"
            >
              {myPlay.bombs.includes(monthOf(asking)) ? "폭탄" : "흔들기"}
            </button>
            <button
              type="button"
              onClick={() => play(asking)}
              className="flex-1 rounded-xl bg-white/15 py-2"
            >
              한 장만 내기
            </button>
          </div>
        </Prompt>
      )}
    </>,
  );
}
