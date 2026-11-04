"use client";

import { realClock } from "@game/fair-play";
import {
  type Action,
  type GameEvent,
  type OnecardCard,
  type OnecardView,
  rankOf,
  SUITS,
  type Suit,
  suitOf,
} from "@game/onecard-engine";
import { useCallback, useEffect, useRef, useState } from "react";

import { ChatBox } from "@/components/ChatBox";
import { ResultBanner } from "@/components/ResultBanner";
import { type Outcome, RoundOutcome } from "@/components/RoundOutcome";
import {
  MissionOverlay,
  type MissionProps,
} from "@/components/tutorial/MissionOverlay";
import { botName } from "@/game/bot-names";
import type { ResultBanner as Banner } from "@/game/result-banner";
import { useSettings } from "@/game/settings";
import { useStimulusShown } from "@/game/stimulus-shown";
import { HwatuFairBar } from "@/hwatu/fair-bar";
import { cn } from "@/lib/cn";

import { isRedSuit, SUIT_NAMES, SUIT_SYMBOLS } from "../cards";
import { ONECARD_LEVELS } from "../settings";
import { ShoutPress } from "../shout-press";
import { useOnecard } from "../store";
import { OnecardCardView } from "./OnecardCard";

/** 원카드 화면 배경(짙은 남색 펠트) */
export const ONECARD_BG =
  "bg-[radial-gradient(ellipse_at_top,#1e3a8a_0%,#0b1533_75%)]";

/** 말풍선이 머무는 시간 */
const BUBBLE_MS = 1500;

/** 휴대폰 가로처럼 낮고 넓은 화면인가(카드를 작게 그린다) */
function useShortLandscape(): boolean {
  const [short, setShort] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(
      "(orientation: landscape) and (max-height: 600px)",
    );
    const update = () => setShort(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return short;
}

/** 좁은 화면(휴대폰 세로) */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 520px)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
}

type Bubble = { text: string; tone: "shout" | "caught" | "false" };

/**
 * 이번 걸음 사건에서 자리별 말풍선을 고른다(docs/42 B안 6번: 외침은 소리와 말풍선으로 잠깐).
 * "누가 외치지 않았나"는 사건에 없다. 잡힌 사람은 "잡혔다!", 잡은 사람은 "원카드!"
 */
export function bubblesOf(events: readonly GameEvent[]): Map<number, Bubble> {
  const out = new Map<number, Bubble>();
  for (const e of events) {
    if (e.type === "shouted" && !out.has(e.seat))
      out.set(e.seat, { text: "원카드!", tone: "shout" });
    if (e.type === "falseShout")
      out.set(e.seat, { text: "헛외침!", tone: "false" });
    if (e.type === "caught")
      out.set(e.target, { text: "잡혔다!", tone: "caught" });
  }
  return out;
}

function useBubbles(events: readonly GameEvent[], seq: number) {
  const [bubbles, setBubbles] = useState<Map<number, Bubble>>(new Map());
  // biome-ignore lint/correctness/useExhaustiveDependencies: 사건 묶음이 올 때만(seq) 새로 띄운다
  useEffect(() => {
    const next = bubblesOf(events);
    if (next.size === 0) return;
    setBubbles((old) => new Map([...old, ...next]));
    const id = setTimeout(
      () =>
        setBubbles((old) => {
          const left = new Map(old);
          for (const seat of next.keys())
            if (left.get(seat) === next.get(seat)) left.delete(seat);
          return left;
        }),
      BUBBLE_MS,
    );
    return () => clearTimeout(id);
  }, [seq]);
  return bubbles;
}

function BubbleTag({ bubble }: { bubble: Bubble }) {
  return (
    <span
      data-bubble={bubble.tone}
      className={cn(
        "pop-in pointer-events-none absolute -top-4 right-1 z-20 whitespace-nowrap rounded-full px-2.5 py-0.5 font-black text-sm shadow-lg",
        bubble.tone === "shout" && "bg-amber-300 text-black",
        bubble.tone === "caught" && "bg-rose-600 text-white",
        bubble.tone === "false" && "bg-slate-200 text-slate-900",
      )}
    >
      {bubble.text}
    </span>
  );
}

/** 남의 자리: 이름, 손패 뒷면과 장 수, 차례·다 냄·파산 */
function SeatPlate({
  view,
  seat,
  name,
  bubble,
  small,
  offline = false,
}: {
  view: OnecardView;
  seat: number;
  name: string;
  bubble: Bubble | undefined;
  small: boolean;
  /** 온라인: 연결이 끊긴 사람 */
  offline?: boolean;
}) {
  const turn = view.phase === "play" && view.turn === seat;
  const count = view.handCounts[seat] ?? 0;
  const place = view.finished.indexOf(seat);
  const broke = view.bankrupt.includes(seat);
  const revealed = view.result?.hands[seat];
  const back = small ? 14 : 18;
  return (
    <div
      data-seat={seat}
      data-turn={turn || undefined}
      className={cn(
        "relative flex min-w-0 flex-col gap-1 rounded-xl border px-2 py-1.5",
        turn
          ? "border-amber-300 bg-amber-300/15"
          : "border-white/10 bg-black/20",
      )}
    >
      <div className="flex items-center gap-1 text-xs">
        <span className="truncate font-semibold">{name}</span>
        {place >= 0 && (
          <span className="shrink-0 rounded bg-amber-400 px-1 text-[10px] text-black">
            {place + 1}등
          </span>
        )}
        {broke && (
          <span className="shrink-0 rounded bg-rose-700 px-1 text-[10px]">
            파산
          </span>
        )}
        {offline && (
          <span
            data-offline={seat}
            className="shrink-0 rounded bg-slate-600 px-1 text-[10px]"
          >
            연결 끊김
          </span>
        )}
        <span
          className="ml-auto shrink-0 text-white/70 tabular-nums"
          data-count={seat}
        >
          {count}장
        </span>
      </div>
      <div className="flex min-h-6 items-end">
        {revealed && revealed.length > 0 ? (
          <div className="flex flex-wrap" data-revealed={seat}>
            {revealed.map((card, i) => (
              <OnecardCardView
                key={card}
                card={card}
                width={small ? 16 : 20}
                className={i > 0 ? "-ml-1" : undefined}
              />
            ))}
          </div>
        ) : (
          <span
            role="img"
            aria-label={`뒷면 ${count}장`}
            className="flex flex-wrap"
          >
            {Array.from({ length: Math.min(count, 12) }, (_, i) => (
              <OnecardCardView
                // biome-ignore lint/suspicious/noArrayIndexKey: 뒷면은 순서가 곧 정체다
                key={i}
                card={null}
                width={back}
                label=""
                className={i > 0 ? "-ml-1.5" : undefined}
              />
            ))}
          </span>
        )}
      </div>
      {bubble && <BubbleTag bubble={bubble} />}
    </div>
  );
}

/** 지금 맞출 무늬 글자(7로 바꾼 무늬 포함) */
function SuitChip({ suit }: { suit: Suit | null }) {
  if (suit === null)
    return (
      <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">
        아무 카드나
      </span>
    );
  return (
    <span
      data-suit={suit}
      className={cn(
        "rounded-full bg-white px-2 py-0.5 font-bold text-xs",
        isRedSuit(suit) ? "text-red-600" : "text-slate-900",
      )}
    >
      {SUIT_SYMBOLS[suit]} {SUIT_NAMES[suit]}
    </span>
  );
}

/** 판 끝 순위표 */
function RankTable({
  view,
  name,
}: {
  view: OnecardView;
  name: (seat: number) => string;
}) {
  const result = view.result;
  if (!result) return null;
  return (
    <table aria-label="순위표" className="w-full max-w-xl text-sm tabular-nums">
      <thead className="text-white/60 text-xs">
        <tr>
          <th className="text-left font-normal">순위</th>
          <th className="text-right font-normal">남은 장 수</th>
        </tr>
      </thead>
      <tbody>
        {result.order.map((seat) => (
          <tr
            key={seat}
            className={cn(seat === view.mySeat && "font-bold text-amber-200")}
          >
            <td className="py-0.5">
              {result.ranks[seat]}등 {name(seat)}
              {view.bankrupt.includes(seat) ? " (파산)" : ""}
            </td>
            <td className="text-right">{result.scores[seat]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * 가운데 버린 더미. 치면 "원카드!"(docs/43 3-1). 판 상태와 상관없이 늘 같은 모습이다(docs/42 4-3):
 * 두 장일 때 반짝이거나 "외치지 않음"을 보이지 않는다. 누르기 시작한 순간 화면에 그려진 판 번호를 `seen`으로 보낸다
 */
function Pile({
  view,
  width,
  onShout,
}: {
  view: OnecardView;
  width: number;
  onShout: (seen: number, rtMs?: number) => void;
}) {
  const { seen } = useStimulusShown(view.turnNo);
  const turnNoRef = useRef(view.turnNo);
  turnNoRef.current = view.turnNo;
  const shoutRef = useRef(onShout);
  shoutRef.current = onShout;
  const overRef = useRef(view.phase === "over");
  overRef.current = view.phase === "over";
  const [slap, setSlap] = useState(0);
  const press = useRef<ShoutPress | null>(null);
  if (press.current === null)
    press.current = new ShoutPress(realClock, (s, rt) => {
      // 판이 끝난 뒤의 스페이스도 치지 않는다(단추는 `disabled`)
      if (overRef.current) return;
      setSlap((n) => n + 1);
      shoutRef.current(s, rt);
    });
  // `seen`은 대국 내내 같은 함수라 이것도 같다(키 처리기를 다시 걸지 않는다).
  // 누른 순간의 판 번호와 반응 시간(누른 시각 − 그 판을 그린 프레임 시각, 같은 시계, docs/42 17-3)
  const seenAt = useCallback(
    (at: number): [number, number | undefined] => {
      const s = seen(at);
      return s
        ? [s.stimulus, Math.round(s.rtMs)]
        : [turnNoRef.current, undefined];
    },
    [seen],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      e.preventDefault();
      press.current?.key(...seenAt(e.timeStamp));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      press.current?.dispose();
    };
  }, [seenAt]);

  const top = view.pile.at(-1) ?? null;
  const under = view.pile.at(-2) ?? null;
  const release = (e: React.PointerEvent) =>
    press.current?.release(e.pointerId);
  // 판이 끝나면 더미 치기를 끈다(모습은 그대로, 온라인 방은 판 끝에 청구 통로를 닫는다)
  return (
    <button
      type="button"
      aria-label="가운데 더미(치면 원카드!)"
      data-pile
      disabled={view.phase === "over"}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        press.current?.press(e.pointerId, ...seenAt(e.timeStamp));
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onContextMenu={(e) => e.preventDefault()}
      className="relative select-none rounded-xl p-2 outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      style={{ touchAction: "none" }}
    >
      <span
        key={slap}
        className={cn("relative block", slap > 0 && "onecard-slap")}
        style={{ width, height: Math.round(width * 1.4) }}
      >
        {under && (
          <OnecardCardView
            card={under}
            width={width}
            label=""
            className="absolute inset-0 rotate-[-8deg] opacity-80"
          />
        )}
        {top && (
          <OnecardCardView
            card={top}
            width={width}
            className="absolute inset-0"
            label={`맨 위 카드`}
          />
        )}
      </span>
    </button>
  );
}

/** 대국 화면. `mission`이 있으면 튜토리얼 미션 띠를 얹는다 */
export function OnecardGame({
  onExit,
  mission,
}: {
  onExit: () => void;
  mission?: MissionProps;
}) {
  const {
    view,
    host,
    local,
    notice,
    level,
    events,
    eventSeq,
    seatNames,
    reconnecting,
    hostLeft,
    offlineSeats,
    shoutEvents,
  } = useOnecard();
  const submit = useOnecard((s) => s.submit);
  const shout = useOnecard((s) => s.shout);
  const resign = useOnecard((s) => s.resign);
  const clearNotice = useOnecard((s) => s.clearNotice);
  const botNames = useSettings((s) => s.botNames);
  const short = useShortLandscape();
  const narrow = useNarrow();
  const [selected, setSelected] = useState<OnecardCard | null>(null);
  const [seven, setSeven] = useState<OnecardCard | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const pointer = useRef<string>("mouse");
  const bubbles = useBubbles(events, eventSeq);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 1800);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  const handKey = view?.hand.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: 손패가 바뀔 때만 푼다
  useEffect(() => {
    setSelected(null);
    setSeven(null);
  }, [handKey, view?.turn]);

  if (!view || !host) return null;
  const me = host.seat;
  const n = view.rules.players;
  const levelName = ONECARD_LEVELS.find((l) => l.value === level)?.label ?? "";
  const online = local === null;
  const name = (seat: number) =>
    seat === me
      ? "나"
      : online
        ? (seatNames?.[seat] ?? `자리 ${seat + 1}`)
        : botName(botNames, (seat - me + n) % n);
  const others = Array.from({ length: n - 1 }, (_, i) => (me + 1 + i) % n);
  const myTurn = view.phase === "play" && view.turn === me;
  const playable = new Set(
    view.moves.flatMap((a) => (a.type === "play" ? [a.card] : [])),
  );
  const canDraw = view.moves.some((a) => a.type === "draw");
  const result = view.result;
  const over = view.phase === "over";

  const send = (action: Action) => submit(action);
  const play = (card: OnecardCard) => {
    setSelected(null);
    if (rankOf(card) === "7") {
      setSeven(card);
      return;
    }
    send({ type: "play", card });
  };
  /** 마우스는 누르면 바로 내고, 터치는 한 번 겨누고 다시 눌러 낸다 */
  const onCard = (card: OnecardCard) => {
    const touch = pointer.current === "touch" || pointer.current === "pen";
    pointer.current = "mouse";
    if (!myTurn || !playable.has(card)) return;
    if (!touch || selected === card) play(card);
    else setSelected(card);
  };

  let status: string;
  if (result) {
    const rank = result.ranks[me] ?? n;
    status = view.retired
      ? `게임을 끝냈어요 — ${rank}등`
      : rank === 1
        ? "1등!"
        : `${rank}등`;
  } else if (view.phase === "reshuffle") status = "버린 더미를 섞는 중…";
  else if (view.finished.includes(me))
    status = `다 냈어요! ${view.finished.indexOf(me) + 1}등 · 남은 사람을 기다려요`;
  else if (view.bankrupt.includes(me)) status = "파산했어요 · 남은 판을 봐요";
  else if (myTurn)
    status =
      view.attack > 0
        ? `공격 +${view.attack}! 받아치거나 ${view.attack}장 먹으세요`
        : playable.size > 0
          ? "낼 카드를 누르세요"
          : "낼 카드가 없어요. 먹으세요";
  else status = `${name(view.turn)} 차례…`;

  const ended = events.find(
    (e): e is Extract<GameEvent, { type: "ended" }> => e.type === "ended",
  );
  const banner: Banner | null = ended
    ? {
        won: ended.result.ranks[me] === 1,
        detail: `${ended.result.ranks[me]}등 · 남은 카드 ${ended.result.scores[me]}장`,
      }
    : null;
  const outcome: Outcome | null = result
    ? result.ranks[me] === 1
      ? "win"
      : "loss"
    : null;

  const handWidth = short ? 40 : narrow ? 50 : 64;
  const hand = over && result ? (result.hands[me] ?? []) : view.hand;
  // 장 수가 많으면 겹쳐 놓는다(한 줄에 들어가게). 겹친 카드도 왼쪽 모서리의 숫자·무늬는 보인다.
  const overlap =
    hand.length > (short ? 12 : narrow ? 6 : 10)
      ? Math.round(handWidth * 0.45)
      : 0;
  const pileWidth = short ? 52 : narrow ? 64 : 80;
  const top = view.pile.at(-1) ?? null;
  const changedSuit =
    top !== null && view.suit !== null && suitOf(top) !== view.suit;

  return (
    <main
      data-game="onecard"
      // 받은 외침·잡기·헛외침 사건 수를 자리 순서로(말풍선은 잠깐이라 화면 시험은 이 값을 기다린다)
      data-shouts-by={shoutEvents.join(",")}
      data-my-seat={view.mySeat}
      className={cn(
        "relative flex min-h-dvh flex-col items-center gap-2 overflow-x-hidden px-3 py-2 text-white",
        ONECARD_BG,
        "short-landscape:grid short-landscape:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] short-landscape:content-start short-landscape:items-start short-landscape:gap-x-4",
        // 미션 띠는 좁은 화면에서 두 줄이 된다
        mission && "pt-20",
      )}
    >
      {mission && <MissionOverlay mission={mission} top={8} />}
      <header className="flex w-full max-w-xl items-center gap-2 text-sm short-landscape:col-span-2 short-landscape:max-w-none">
        <button
          type="button"
          onClick={onExit}
          className="text-white/70 hover:text-white"
        >
          {mission ? "← 미션 나가기" : "← 원카드"}
        </button>
        <span className="ml-auto truncate text-white/60 text-xs">
          {mission
            ? `배우기 · ${mission.title}`
            : `${n}명 · ${view.rules.handSize}장 · ${online ? "친구와" : `컴퓨터(${levelName})`}`}
        </span>
      </header>

      {online && (
        <div className="w-full max-w-xl short-landscape:col-span-2 short-landscape:max-w-none">
          <HwatuFairBar me={me} over={over} />
        </div>
      )}
      {online && (reconnecting || hostLeft) && (
        <p
          role="status"
          className="w-full max-w-xl rounded-xl bg-rose-700/80 px-3 py-2 text-center text-sm short-landscape:col-span-2"
        >
          {hostLeft
            ? "방장이 방을 나갔습니다"
            : "방장과 연결이 끊겼습니다. 다시 연결하는 중…"}
        </p>
      )}

      {/* 왼쪽(가로 화면) 또는 위: 상대들과 가운데 */}
      <div className="flex w-full max-w-xl flex-col gap-2 short-landscape:col-start-1">
        <section
          aria-label="상대"
          className={cn(
            "grid w-full gap-1.5",
            others.length === 1
              ? "grid-cols-1"
              : others.length === 3
                ? "grid-cols-3"
                : "grid-cols-2",
          )}
        >
          {others.map((seat) => (
            <SeatPlate
              key={seat}
              view={view}
              seat={seat}
              name={name(seat)}
              bubble={bubbles.get(seat)}
              small={short || others.length >= 3}
              offline={offlineSeats.includes(seat)}
            />
          ))}
        </section>

        <section
          aria-label="가운데"
          className="relative flex items-center justify-center gap-4 rounded-2xl bg-black/20 py-2"
        >
          <div className="flex flex-col items-center gap-1" data-deck>
            <OnecardCardView
              card={null}
              width={short ? 34 : 44}
              label={`더미 ${view.deckCount}장`}
            />
            <span className="text-white/70 text-xs tabular-nums">
              더미 {view.deckCount}장
            </span>
          </div>
          <Pile view={view} width={pileWidth} onShout={shout} />
          <div className="flex min-w-20 flex-col items-start gap-1.5 text-xs">
            <SuitChip suit={view.suit} />
            {changedSuit && (
              <span className="text-white/70" data-changed-suit>
                7로 바뀜
              </span>
            )}
            {view.attack > 0 && (
              <span
                data-attack={view.attack}
                className="rounded-full bg-rose-600 px-2 py-0.5 font-black"
              >
                공격 +{view.attack}
              </span>
            )}
            <span className="text-white/70" data-direction={view.direction}>
              {view.direction === 1 ? "↻ 순서대로" : "↺ 거꾸로"}
            </span>
          </div>
          <ResultBanner banner={banner} seq={eventSeq} />
        </section>
      </div>

      {/* 오른쪽(가로 화면) 또는 아래: 상태, 내 패, 단추 */}
      <div className="flex w-full max-w-xl flex-col items-center gap-2 short-landscape:col-start-2 short-landscape:row-start-2">
        <RoundOutcome
          outcome={outcome}
          status={notice ?? status}
          summary={
            result
              ? `남은 카드 ${result.scores[me]}장 · ${n}명 중 ${result.ranks[me]}등`
              : undefined
          }
        />

        {seven && myTurn && (
          <fieldset className="flex w-full flex-col items-center gap-1.5 rounded-2xl bg-black/30 p-2">
            <legend className="sr-only">바꿀 무늬</legend>
            <p className="text-sm">7을 내요. 바꿀 무늬를 고르세요</p>
            <div className="flex gap-1.5">
              {SUITS.map((suit) => (
                <button
                  key={suit}
                  type="button"
                  data-pick-suit={suit}
                  onClick={() => {
                    setSeven(null);
                    send({ type: "play", card: seven, suit });
                  }}
                  className={cn(
                    "rounded-xl bg-white px-3 py-2 font-black text-xl",
                    isRedSuit(suit) ? "text-red-600" : "text-slate-900",
                  )}
                  aria-label={SUIT_NAMES[suit]}
                >
                  {SUIT_SYMBOLS[suit]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSeven(null)}
                className="rounded-xl bg-white/10 px-3 py-2 text-sm"
              >
                취소
              </button>
            </div>
          </fieldset>
        )}

        <section
          aria-label="내 손패"
          data-turn={myTurn || undefined}
          onPointerDownCapture={(e) => {
            pointer.current = e.pointerType;
          }}
          className={cn(
            "relative flex w-full flex-wrap justify-center gap-y-1 rounded-2xl px-1 pt-3 pb-1",
            myTurn && "bg-amber-300/10",
            overlap === 0 && "gap-x-1",
          )}
          style={overlap ? { paddingLeft: overlap } : undefined}
        >
          {bubbles.get(me) && <BubbleTag bubble={bubbles.get(me) as Bubble} />}
          {hand.map((card) => (
            <OnecardCardView
              key={card}
              card={card}
              width={handWidth}
              playable={myTurn && playable.has(card)}
              selected={selected === card || seven === card}
              dim={myTurn && !playable.has(card)}
              onClick={() => onCard(card)}
              style={overlap ? { marginLeft: -overlap } : undefined}
            />
          ))}
        </section>

        <div className="flex flex-wrap justify-center gap-2">
          {myTurn && canDraw && (
            <button
              type="button"
              onClick={() => send({ type: "draw" })}
              className="rounded-xl bg-white/15 px-4 py-2 font-semibold"
            >
              {view.attack > 0 ? `${view.attack}장 먹기` : "한 장 먹기"}
            </button>
          )}
          {myTurn && selected && (
            <button
              type="button"
              onClick={() => play(selected)}
              className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
            >
              이 카드 내기
            </button>
          )}
          {!over &&
            !online &&
            !mission &&
            (confirmResign ? (
              <span className="flex items-center gap-1.5 text-sm">
                정말 그만둘까요?
                <button
                  type="button"
                  onClick={() => {
                    setConfirmResign(false);
                    resign();
                  }}
                  className="rounded-xl bg-rose-600 px-3 py-2"
                >
                  그만두기
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmResign(false)}
                  className="rounded-xl bg-white/10 px-3 py-2"
                >
                  계속하기
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmResign(true)}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm"
              >
                그만두기
              </button>
            ))}
          {over && !mission && (
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

        {over && <RankTable view={view} name={name} />}
        {online && (
          <div className="w-full max-w-xl">
            <ChatBox mySeat={me} />
          </div>
        )}
      </div>
    </main>
  );
}
