"use client";

import { realClock } from "@game/fair-play";
import type { Card } from "@game/mighty-engine";
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
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { ChatBox } from "@/components/ChatBox";
import { DealAnimation } from "@/components/DealAnimation";
import { useHandControls } from "@/components/hand-controls";
import { ActionButton, Panel } from "@/components/panels/common";
import { ResultBanner } from "@/components/ResultBanner";
import { type Outcome, RoundOutcome } from "@/components/RoundOutcome";
import { useRelayoutFade } from "@/components/relayout";
import {
  MissionOverlay,
  type MissionProps,
} from "@/components/tutorial/MissionOverlay";
import { botName } from "@/game/bot-names";
import type { ResultBanner as Banner } from "@/game/result-banner";
import { useSettings } from "@/game/settings";
import { useStimulusShown } from "@/game/stimulus-shown";
import { prefersReducedMotion } from "@/game/timing";
import { HwatuFairBar, useHwatuFair } from "@/hwatu/fair-bar";
import {
  computeLayout,
  type Layout,
  type Point,
  type Rect,
} from "@/layout/compute-layout";
import { cn } from "@/lib/cn";
import { useChat } from "@/net/chat";

import { onecardDealPattern, planFx, type Spot } from "../card-fx";
import { isRedSuit, SUIT_NAMES, SUIT_SYMBOLS } from "../cards";
import { ONECARD_LEVELS } from "../settings";
import { ShoutPress } from "../shout-press";
import { useOnecard } from "../store";
import { OnecardCardView } from "./OnecardCard";
import { DeckShuffle, FlightLayer, useCardFlights } from "./OnecardFx";
import { OnecardSettingsMenu } from "./OnecardSettingsMenu";

/** 원카드 화면 배경(짙은 남색 펠트). 하트는 붉은 펠트, 마이티는 초록 펠트 */
export const ONECARD_BG =
  "bg-[radial-gradient(ellipse_at_center,#1e3a8a_0%,#0b1533_80%)]";

/** 말풍선이 머무는 시간 */
const BUBBLE_MS = 1500;
/** 미션 띠의 높이(두 줄일 때) */
const MISSION_BAND_H = 64;
/** 위쪽 자리 옆으로 좁힐 때 이보다 좁으면 읽기 어렵다 */
const MISSION_BAND_MIN_W = 220;

/** 무대(게임 화면 전체) 크기. 하트·마이티 판과 같이 잰다 */
function useStageSize() {
  const ref = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
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

function BubbleTag({
  bubble,
  className = "-top-4 right-1",
}: {
  bubble: Bubble;
  className?: string;
}) {
  return (
    <span
      data-bubble={bubble.tone}
      className={cn(
        "pop-in pointer-events-none absolute z-20 whitespace-nowrap rounded-full px-2.5 py-0.5 font-black text-sm shadow-lg",
        bubble.tone === "shout" && "bg-amber-300 text-black",
        bubble.tone === "caught" && "bg-rose-600 text-white",
        bubble.tone === "false" && "bg-slate-200 text-slate-900",
        className,
      )}
    >
      {bubble.text}
    </span>
  );
}

/**
 * 남의 자리 판: 이름·남은 장 수, 차례(빛나는 테두리)·등수·파산·연결 끊김. 하트 자리 판과 같은 모양으로
 * `computeLayout`이 정한 자리(`rect`)에 놓는다. 손패 뒷면은 판 뒤에 따로 펼친다
 */
function SeatPlate({
  view,
  seat,
  name,
  bubble,
  rect,
  offline = false,
}: {
  view: OnecardView;
  seat: number;
  name: string;
  bubble: Bubble | undefined;
  rect: Rect;
  /** 온라인: 연결이 끊긴 사람 */
  offline?: boolean;
}) {
  const turn = view.phase === "play" && view.turn === seat;
  const count = view.handCounts[seat] ?? 0;
  const place = view.finished.indexOf(seat);
  const broke = view.bankrupt.includes(seat);
  return (
    <div
      data-seat={seat}
      data-turn={turn || undefined}
      className={cn(
        "absolute flex flex-col justify-between rounded-xl border border-white/15 bg-black/45 px-2 py-1 text-xs shadow-lg backdrop-blur-sm transition-[box-shadow,opacity]",
        turn &&
          "shadow-[0_0_0_2px_#fde68a,0_0_20px_2px_rgba(253,230,138,0.55)]",
        broke && "opacity-50",
      )}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        zIndex: 20,
      }}
    >
      <div className="flex items-center gap-1">
        <span className="min-w-[3.5em] truncate font-semibold">{name}</span>
        <span
          className="ml-auto shrink-0 tabular-nums opacity-80"
          data-count={seat}
        >
          {count}장
        </span>
      </div>
      <div className="flex min-h-4 items-center gap-1 text-[11px]">
        {turn && <span className="font-semibold text-amber-200">차례</span>}
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
      </div>
      {offline && (
        <div
          data-offline={seat}
          className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-rose-600 px-2 py-0.5 font-semibold text-[10px] shadow"
        >
          연결 끊김
        </div>
      )}
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
    <table aria-label="순위표" className="w-full text-sm tabular-nums">
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
 * 두 장일 때 반짝이거나 "외치지 않음"을 보이지 않는다. 누르기 시작한 순간 화면에 그려진 판 번호를 `seen`으로 보낸다.
 * 맨 위 카드는 날아오는 연출 없이 바로 그린다(그린 프레임 시각이 곧 자극을 보인 시각이다)
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
  // 마지막으로 그린 프레임을 적은 판 번호. 화면 시험이 "이 판을 다 그렸다"를 조건으로 기다린다
  const [shownTurn, setShownTurn] = useState<number | null>(null);
  const { seen } = useStimulusShown(view.turnNo, {
    onShown: (entry) => setShownTurn(entry.stimulus),
  });
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
      data-turn-no={view.turnNo}
      data-shown-turn={shownTurn ?? undefined}
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

/** 남의 손패 뒷면 한 장의 자리(하트와 같이 자리 판 뒤에서 판 가운데 쪽으로 부채꼴로 편다) */
function fanSlot(
  layout: Layout,
  plate: Rect,
  card: { w: number; h: number },
  index: number,
  count: number,
) {
  const mirrored = count - 1 - index;
  const centered = mirrored - (count - 1) / 2;
  const step =
    count > 1
      ? Math.min(card.w * 0.42, (plate.w * 0.85 - card.w) / (count - 1))
      : 0;
  const towardTable =
    plate.y + plate.h / 2 < layout.center.y + layout.center.h / 2 ? 1 : -1;
  const edge = towardTable === 1 ? plate.y + plate.h : plate.y;
  return {
    x: plate.x + plate.w / 2 + centered * step,
    y: edge + towardTable * (card.h * 0.22 - Math.abs(centered) * 0.6),
    rotate: centered * 2.5 * -towardTable,
  };
}

/** 남의 손패 뒷면 한 장 크기(자리 판 높이에 맞춘다, 하트와 같다) */
function fanCardOf(layout: Layout | null) {
  if (!layout) return { w: 0, h: 0 };
  const h = Math.min(56, Math.max(30, (layout.seats[1]?.plate.h ?? 40) * 1.05));
  return { w: (h * 5) / 7, h };
}

/** 무대 기준 요소 가운데와 너비 */
function spotOf(el: Element | null, stage: Element): Spot | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0) return null;
  const s = stage.getBoundingClientRect();
  return {
    x: r.left - s.left + r.width / 2,
    y: r.top - s.top + r.height / 2,
    w: r.width,
  };
}

/** 덱과 버린 더미의 자리(가운데 칸은 flex로 놓여 그린 뒤에 잰다) */
function measureTable(stage: Element | null) {
  if (!stage) return null;
  const deck = spotOf(stage.querySelector("[data-deck] > :first-child"), stage);
  const pile = spotOf(stage.querySelector("[data-pile] > span"), stage);
  return deck && pile ? { deck, pile } : null;
}

const sameSpot = (a: Spot, b: Spot) =>
  Math.round(a.x) === Math.round(b.x) &&
  Math.round(a.y) === Math.round(b.y) &&
  Math.round(a.w) === Math.round(b.w);

/**
 * 미션 띠 자리: 막대 바로 아래 가운데. 위쪽 자리 판을 가리면 가로 화면은 그 왼쪽 빈 곳으로 좁히고,
 * 세로 화면은 그 아래로 내린다(하트와 같은 규칙, 자리가 몇이든)
 */
function missionPlace(
  layout: Layout,
  width: number,
  height: number,
  /** 자리 판 아래로 삐져나온 뒷면 부채 높이 */
  fanBelow: number,
) {
  const below = layout.hud.y + layout.hud.h + 8;
  const bandW = Math.min(width * 0.92, 480);
  const bandX = width / 2 - bandW / 2;
  const blocking = layout.seats
    .slice(1)
    .map((s) => s.plate)
    .filter(
      (p) =>
        p.y < below + MISSION_BAND_H &&
        p.x < bandX + bandW &&
        bandX < p.x + p.w,
    );
  if (blocking.length === 0) return { top: below };
  const left = Math.min(...blocking.map((p) => p.x)) - 2 * layout.gutter;
  if (width > height && left >= MISSION_BAND_MIN_W)
    return { top: below, span: { left: layout.gutter, width: left } };
  return { top: Math.max(...blocking.map((p) => p.y + p.h)) + fanBelow + 8 };
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
    dealing,
  } = useOnecard();
  const fairShuffling = useHwatuFair((s) => s.shuffling);
  const submit = useOnecard((s) => s.submit);
  const shout = useOnecard((s) => s.shout);
  const resign = useOnecard((s) => s.resign);
  const clearNotice = useOnecard((s) => s.clearNotice);
  const botNames = useSettings((s) => s.botNames);
  const chatOpen = useChat((s) => s.open);
  const setChatOpen = useChat((s) => s.setOpen);
  const chatUnread = useChat((s) => s.unread);
  const stage = useStageSize();
  const fade = useRelayoutFade(stage.width, stage.height);
  const controls = useHandControls();
  const [selected, setSelected] = useState<OnecardCard | null>(null);
  const [seven, setSeven] = useState<OnecardCard | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const pointer = useRef<string>("mouse");
  // 손패를 훑거나 끌어 낸 손은 카드 누르기로 치지 않는다(useHandControls가 손을 뗄 때 처리한다)
  const gestured = useRef(false);
  const bubbles = useBubbles(events, eventSeq);
  const fx = useCardFlights();
  const [table, setTable] = useState<{ deck: Spot; pile: Spot } | null>(null);
  // 나눠 준 뒤 손패가 손패 가운데에서 펼쳐진다(하트·마이티와 같다)
  const [spread, setSpread] = useState<"idle" | "gathered" | "spreading">(
    "idle",
  );

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

  const me = host?.seat ?? 0;
  const n = view?.rules.players ?? 2;
  const over = view?.phase === "over";
  const result = view?.result ?? null;
  const hand = view
    ? over && result
      ? (result.hands[me] ?? [])
      : view.hand
    : [];
  const layout =
    view && stage.width > 0
      ? computeLayout({
          width: stage.width,
          height: stage.height,
          playerCount: n,
          handCount: Math.max(hand.length, 1),
        })
      : null;
  // 나눠 주는 동안은 내 차례여도 손패를 내지 않는다(하트 `canActHearts`와 같다)
  const myTurn = view?.phase === "play" && view.turn === me && !dealing;
  const playable = new Set(
    (view?.moves ?? []).flatMap((a) => (a.type === "play" ? [a.card] : [])),
  );

  // 덱·버린 더미 자리를 잰다(나눠 주기·다시 섞기 연출이 그 자리에서 돈다)
  useLayoutEffect(() => {
    const next = measureTable(stage.ref.current);
    if (!next) return;
    setTable((old) =>
      old && sameSpot(old.deck, next.deck) && sameSpot(old.pile, next.pile)
        ? old
        : next,
    );
  });

  // 걸음마다 카드 연출을 짠다. 판 상태는 이미 그렸고(맨 위 카드 포함) 연출은 그 위를 지나가는 겉그림이다
  const prev = useRef<{
    hand: readonly OnecardCard[];
    counts: readonly number[];
    layout: Layout | null;
  }>({ hand: [], counts: [], layout: null });
  // biome-ignore lint/correctness/useExhaustiveDependencies: 사건 묶음이 올 때만(eventSeq) 짠다
  useLayoutEffect(() => {
    if (!view || !layout || prefersReducedMotion()) return;
    const measured = measureTable(stage.ref.current);
    if (!measured) return;
    const before = prev.current;
    const fan = fanCardOf(layout);
    const { steps, duration } = planFx(events, {
      me,
      prevHand: before.hand,
      hand: view.hand,
      prevCounts: before.counts,
      deck: measured.deck,
      pile: measured.pile,
      prevHandSpot: (card) => {
        const slot = before.layout?.hand.slots[before.hand.indexOf(card)];
        return slot && before.layout
          ? { x: slot.x, y: slot.y, w: before.layout.hand.card.w }
          : null;
      },
      handSpot: (card) => {
        const slot = layout.hand.slots[view.hand.indexOf(card)];
        return slot ? { x: slot.x, y: slot.y, w: layout.hand.card.w } : null;
      },
      fanSpot: (seat, index, count) => {
        const plate = layout.seats[(seat - me + n) % n]?.plate;
        if (!plate || seat === me) return null;
        const at = fanSlot(layout, plate, fan, index, count);
        return { x: at.x, y: at.y, w: fan.w, rotate: at.rotate };
      },
    });
    fx.run(steps, duration, measured.deck);
  }, [eventSeq]);
  // 다음 걸음이 "걸음 전" 손패·장 수·자리로 쓴다(연출 계획 뒤에 고친다)
  useLayoutEffect(() => {
    prev.current = {
      hand: view?.hand ?? [],
      counts: view?.handCounts ?? [],
      layout,
    };
  });
  // 대국이 바뀌면(다시 하기·온라인 방) 남은 연출을 버린다
  // biome-ignore lint/correctness/useExhaustiveDependencies: 대국이 바뀔 때만
  useEffect(() => fx.clear(), [host]);

  const wasDealing = useRef(false);
  useLayoutEffect(() => {
    const was = wasDealing.current;
    wasDealing.current = dealing !== null;
    if (!was || dealing !== null) return;
    setSpread("gathered");
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => setSpread("spreading"));
    });
    const end = setTimeout(() => setSpread("idle"), 700);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(end);
    };
  }, [dealing]);

  const send = (action: Action) => submit(action);
  const play = (card: OnecardCard) => {
    setSelected(null);
    if (rankOf(card) === "7") {
      setSeven(card);
      return;
    }
    send({ type: "play", card });
  };
  controls.update({
    stage: stage.ref.current as HTMLDivElement | null,
    hand: hand as unknown as Card[],
    playable:
      myTurn && !seven ? (playable as unknown as ReadonlySet<Card>) : null,
    selected: selected as Card | null,
    setSelected: (card) => setSelected(card as OnecardCard | null),
    canPlay: myTurn && !seven && layout !== null,
    handTop: layout?.hand.top ?? 0,
    cardHeight: layout?.hand.card.h ?? 0,
    play: (card) => play(card as OnecardCard),
    cancel: () => {
      setSelected(null);
      setSeven(null);
    },
  });

  if (!view || !host) return null;
  const levelName = ONECARD_LEVELS.find((l) => l.value === level)?.label ?? "";
  const online = local === null;
  const name = (seat: number) =>
    seat === me
      ? "나"
      : online
        ? (seatNames?.[seat] ?? `자리 ${seat + 1}`)
        : botName(botNames, (seat - me + n) % n);
  const canDraw = view.moves.some((a) => a.type === "draw");

  /** 마우스는 누르면 바로 내고, 터치는 한 번 겨누고 다시 눌러 낸다 */
  const onCard = (card: OnecardCard) => {
    const touch = pointer.current === "touch" || pointer.current === "pen";
    pointer.current = "mouse";
    if (gestured.current) return;
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
          ? "내 차례 — 낼 카드를 누르세요"
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

  const top = view.pile.at(-1) ?? null;
  const changedSuit =
    top !== null && view.suit !== null && suitOf(top) !== view.suit;
  const offsets = Array.from({ length: n - 1 }, (_, i) => i + 1);
  const seatOf = (offset: number) => (me + offset) % n;
  const fanCard = fanCardOf(layout);
  const tableCenter: Point = layout
    ? {
        x: layout.center.x + layout.center.w / 2,
        y: layout.center.y + layout.center.h / 2,
      }
    : { x: 0, y: 0 };
  const canResign = !over && !online && !mission;
  // 판 가운데 칸: computeLayout의 바닥(center)에서, 위쪽 자리 판 아래로 삐져나온 뒷면 부채와
  // 손패 위 차례 안내를 피한다(낮은 가로 화면에서 겹치지 않게). 카드 크기는 남은 높이에 맞춘다.
  const middle = layout
    ? (() => {
        const c = layout.center;
        const fanBottom = Math.max(
          0,
          ...layout.seats
            .slice(1)
            .map((s) => s.plate)
            .filter((p) => p.x < c.x + c.w && c.x < p.x + p.w)
            .filter((p) => p.y + p.h / 2 < c.y + c.h / 2)
            .map((p) => p.y + p.h + fanCard.h * 0.72),
        );
        const top = Math.max(c.y, fanBottom + 4);
        const bottom = Math.max(
          top + 80,
          Math.min(c.y + c.h, layout.hand.top - 32),
        );
        const h = bottom - top;
        // 낮으면 무늬 줄·먹기 단추를 버린 더미 오른쪽 세로 줄로 옮겨 높이를 모두 더미에 준다
        const side = h < 200;
        // 버린 더미(위아래 여백 16) + 아래 무늬 줄(약 34)
        const pileW = Math.max(
          44,
          Math.min(layout.trick.card.w, (h - 16 - (side ? 0 : 34)) / 1.4),
        );
        // 낮은 가로 화면은 옆으로 늘어놓으므로 폭을 조금 넓힌다(양옆 자리 판은 가장자리에 있다)
        const w = side ? Math.max(c.w, 340) : c.w;
        return { x: c.x + c.w / 2 - w / 2, y: top, w, h, pileW, side };
      })()
    : null;

  return (
    <main
      ref={stage.ref}
      data-game="onecard"
      // 받은 외침·잡기·헛외침 사건 수를 자리 순서로(말풍선은 잠깐이라 화면 시험은 이 값을 기다린다)
      data-shouts-by={shoutEvents.join(",")}
      data-my-seat={view.mySeat}
      className={cn(
        "relative h-dvh w-full overflow-hidden text-white",
        ONECARD_BG,
        fade.className,
      )}
      style={fade.style}
      {...controls.handlers}
      onPointerUpCapture={() => {
        gestured.current = controls.gestureMoved();
      }}
      onPointerDownCapture={() => {
        gestured.current = false;
      }}
    >
      {layout && (
        <>
          {/* 위쪽 막대(하트와 같은 자리·모양) */}
          <div
            className="absolute z-[30] flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-xl bg-black/35 px-3 text-sm"
            style={{
              left: layout.hud.x,
              top: layout.hud.y,
              width: layout.hud.w,
              height: layout.hud.h,
            }}
          >
            <span className="shrink-0 font-bold text-sky-300">♣ 원카드</span>
            <span className="min-w-0 flex-1 truncate opacity-80">
              {mission
                ? `배우기 · ${mission.title}`
                : `${n}명 · ${view.rules.handSize}장 · ${online ? "친구와" : `컴퓨터(${levelName})`}`}
            </span>
            <span
              className="shrink-0 tabular-nums opacity-90"
              title="내 남은 카드"
            >
              나 {hand.length}장
            </span>
            {online && (
              <button
                type="button"
                onClick={() => setChatOpen(!chatOpen)}
                className="relative shrink-0 rounded-lg bg-white/10 px-1.5 py-1 text-xs hover:bg-white/20"
              >
                채팅
                {chatUnread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-rose-500 px-1 text-[10px] leading-4">
                    {chatUnread}
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="shrink-0 rounded-lg bg-white/10 px-1.5 py-1 text-xs hover:bg-white/20"
            >
              설정
            </button>
            {canResign && !confirmResign && (
              <button
                type="button"
                onClick={() => setConfirmResign(true)}
                className="shrink-0 rounded-lg bg-white/10 px-1.5 py-1 text-xs hover:bg-white/20"
              >
                그만두기
              </button>
            )}
            <button
              type="button"
              onClick={onExit}
              className="shrink-0 rounded-lg bg-white/10 px-1.5 py-1 text-xs hover:bg-white/20"
            >
              나가기
            </button>
          </div>

          {/* 남의 손패: 판 동안은 뒷면 부채, 판이 끝나면 펼친 앞면 */}
          {offsets.flatMap((offset) => {
            const seat = seatOf(offset);
            const plate = layout.seats[offset]?.plate;
            if (!plate) return [];
            const revealed = result?.hands[seat];
            if (revealed) {
              if (revealed.length === 0) return [];
              return [
                <div
                  key={`open-${seat}`}
                  data-revealed={seat}
                  className="pointer-events-none absolute z-[120] flex flex-wrap justify-center gap-0.5 rounded-lg bg-black/55 p-1"
                  style={{
                    left: plate.x,
                    top: plate.y + plate.h + 4,
                    width: plate.w,
                  }}
                >
                  {revealed.map((card) => (
                    <OnecardCardView key={card} card={card} width={20} />
                  ))}
                </div>,
              ];
            }
            if (dealing) return [];
            const count = view.handCounts[seat] ?? 0;
            // 덱에서 날아오는 중인 카드는 내려앉을 때까지 가린다
            const arriving = fx.hiddenSeats.get(seat) ?? 0;
            return [
              <span
                key={`fan-${seat}`}
                role="img"
                aria-label={`${name(seat)} 뒷면 ${count}장`}
              >
                {Array.from({ length: count }, (_, i) => {
                  const at = fanSlot(layout, plate, fanCard, i, count);
                  return (
                    <OnecardCardView
                      // biome-ignore lint/suspicious/noArrayIndexKey: 뒷면은 순서가 곧 정체다
                      key={i}
                      card={null}
                      width={fanCard.w}
                      label=""
                      className="absolute top-0 left-0 transition-transform duration-300"
                      style={{
                        zIndex: 1 + i,
                        ...(i >= count - arriving ? { opacity: 0 } : {}),
                        transform: `translate(${at.x - fanCard.w / 2}px, ${at.y - fanCard.h / 2}px) rotate(${at.rotate}deg)`,
                      }}
                    />
                  );
                })}
              </span>,
            ];
          })}

          {/* 자리 판 */}
          {offsets.map((offset) => {
            const seat = seatOf(offset);
            const plate = layout.seats[offset]?.plate;
            return plate ? (
              <SeatPlate
                key={seat}
                view={view}
                seat={seat}
                name={name(seat)}
                bubble={bubbles.get(seat)}
                rect={plate}
                offline={offlineSeats.includes(seat)}
              />
            ) : null;
          })}

          {/* 판 가운데: 더미(먹기)·버린 더미(치면 원카드!)·맞출 무늬·공격·방향 */}
          <section
            aria-label="가운데"
            className={cn(
              "absolute z-[40] flex items-center justify-center",
              middle?.side ? "flex-row gap-3" : "flex-col gap-1.5",
            )}
            style={{
              left: (middle?.x ?? 0) - layout.gutter,
              top: middle?.y ?? 0,
              width: (middle?.w ?? 0) + 2 * layout.gutter,
              height: middle?.h ?? 0,
            }}
          >
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-1" data-deck>
                <OnecardCardView
                  card={null}
                  width={Math.round(
                    (middle?.pileW ?? 0) * (middle?.side ? 0.55 : 0.7),
                  )}
                  label={`더미 ${view.deckCount}장`}
                />
                <span className="text-white/70 text-xs tabular-nums">
                  더미 {view.deckCount}장
                </span>
                {myTurn && canDraw && (
                  <button
                    type="button"
                    onClick={() => send({ type: "draw" })}
                    className="whitespace-nowrap rounded-xl bg-white/15 px-3 py-1.5 font-semibold text-sm hover:bg-white/25"
                  >
                    {view.attack > 0 ? `${view.attack}장 먹기` : "한 장 먹기"}
                  </button>
                )}
              </div>
              <Pile
                view={view}
                width={Math.round(middle?.pileW ?? 0)}
                onShout={shout}
              />
            </div>
            <div
              className={cn(
                "flex gap-1.5 text-xs",
                middle?.side
                  ? "shrink-0 flex-col items-start whitespace-nowrap"
                  : "flex-wrap items-center justify-center",
              )}
            >
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
          </section>

          {/* 판 끝: 결과·순위표·다시 하기(하트 판 결과 패널 자리) */}
          {over && (
            <div
              className="absolute z-[200] flex items-end justify-center"
              style={{
                left:
                  tableCenter.x -
                  Math.min(170, stage.width / 2 - layout.gutter),
                width: Math.min(340, stage.width - 2 * layout.gutter),
                top: layout.hud.y + layout.hud.h + layout.gutter,
                height:
                  layout.hand.top -
                  layout.gutter -
                  (layout.hud.y + layout.hud.h + layout.gutter),
              }}
            >
              <div className="flex max-h-full w-full flex-col justify-end">
                <Panel title="판 끝">
                  <RoundOutcome
                    outcome={outcome}
                    status={status}
                    summary={
                      result
                        ? `남은 카드 ${result.scores[me]}장 · ${n}명 중 ${result.ranks[me]}등`
                        : undefined
                    }
                  />
                  <RankTable view={view} name={name} />
                  {!mission && (
                    <div className="flex justify-center gap-2">
                      <ActionButton onClick={onExit}>다시 하기</ActionButton>
                      <a
                        href="/"
                        className="rounded-xl bg-white/15 px-4 py-2 font-semibold text-sm hover:bg-white/25"
                      >
                        게임 목록
                      </a>
                    </div>
                  )}
                </Panel>
              </div>
            </div>
          )}

          {/* 손패 바로 위: 차례 안내, 7 무늬 고르기, 터치로 겨눈 카드 내기, 그만두기 묻기 */}
          {!over && (
            <div
              className="pointer-events-none absolute z-[240] flex flex-col items-center justify-end gap-1.5"
              style={{
                left: layout.gutter,
                width: stage.width - 2 * layout.gutter,
                bottom: stage.height - layout.hand.top + 4,
              }}
            >
              {seven && myTurn && (
                <fieldset className="pointer-events-auto flex flex-col items-center gap-1.5 rounded-2xl border border-white/15 bg-black/70 p-2 shadow-2xl backdrop-blur">
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
              {confirmResign && canResign && (
                <span className="pointer-events-auto flex items-center gap-1.5 rounded-2xl bg-black/75 px-3 py-1.5 text-sm shadow-xl">
                  정말 그만둘까요?
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmResign(false);
                      resign();
                    }}
                    className="rounded-xl bg-rose-600 px-3 py-1.5"
                  >
                    그만두기
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResign(false)}
                    className="rounded-xl bg-white/10 px-3 py-1.5"
                  >
                    계속하기
                  </button>
                </span>
              )}
              {myTurn && selected && (
                <button
                  type="button"
                  onClick={() => play(selected)}
                  className="pointer-events-auto rounded-xl bg-amber-300 px-4 py-1.5 font-semibold text-black text-sm shadow"
                >
                  이 카드 내기
                </button>
              )}
              {/* 나눠 주는 동안은 차례 안내를 띄우지 않는다(아직 아무도 둘 수 없다) */}
              {(!dealing || notice) && (
                <RoundOutcome
                  outcome={null}
                  status={notice ?? status}
                  className={cn(
                    "rounded-full px-3 py-0.5 text-xs shadow [&>p]:min-h-0",
                    notice
                      ? "bg-black/80"
                      : myTurn
                        ? "animate-pulse bg-amber-400 font-bold text-black"
                        : "bg-black/45",
                  )}
                />
              )}
            </div>
          )}

          {/* 내 손패(하트와 같은 자리·크기, computeLayout의 손패 칸) */}
          <section
            aria-label="내 손패"
            data-turn={myTurn || undefined}
            // 나눠 받은 패가 손패 가운데에서 펼쳐지는 중(화면 시험이 끝나기를 기다린다)
            data-spreading={spread !== "idle" || undefined}
            onPointerDownCapture={(e) => {
              pointer.current = e.pointerType;
            }}
            className="absolute left-0 z-[50]"
            style={{
              top: layout.hand.top,
              width: stage.width,
              height: stage.height - layout.hand.top,
            }}
          >
            {bubbles.get(me) && (
              <BubbleTag
                bubble={bubbles.get(me) as Bubble}
                className="top-0 left-1/2 -translate-x-1/2"
              />
            )}
            {(dealing ? [] : hand).map((card, i) => {
              const slot = layout.hand.slots[i];
              if (!slot) return null;
              const { w, h } = layout.hand.card;
              const arriving = fx.hiddenCards.has(card);
              const at =
                spread === "gathered"
                  ? { x: stage.width / 2, scale: 0.55 }
                  : { x: slot.x, scale: 1 };
              const lift =
                controls.dragArmed && selected === card ? h * 0.4 : 0;
              const canPlay = myTurn && playable.has(card);
              return (
                <OnecardCardView
                  key={card}
                  card={card}
                  width={w}
                  playable={canPlay}
                  selected={selected === card || seven === card}
                  dim={myTurn && !playable.has(card)}
                  onClick={() => onCard(card)}
                  className="absolute top-0 left-0"
                  style={{
                    zIndex: 10 + i,
                    transform: `translate(${at.x - w / 2}px, ${slot.y - layout.hand.top - h / 2 - lift}px) scale(${at.scale})`,
                    ...(canPlay ? { touchAction: "none" } : {}),
                    ...(spread === "spreading"
                      ? {
                          transitionDuration: "300ms",
                          transitionDelay: `${Math.min(i * 25, 300)}ms`,
                        }
                      : {}),
                    ...(arriving
                      ? { opacity: 0, pointerEvents: "none" as const }
                      : {}),
                  }}
                />
              );
            })}
          </section>

          {/* 섞고 나눠 주기(하트와 같은 DealAnimation, 덱 자리에서) · 멘탈 포커로 섞는 동안 */}
          {table &&
            (dealing || (fairShuffling && fairShuffling !== "wait")) && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[245]"
              >
                {dealing ? (
                  <DealAnimation
                    key={dealing.key}
                    center={{ x: table.deck.x, y: table.deck.y }}
                    card={{
                      w: table.deck.w,
                      h: Math.round(table.deck.w * 1.4),
                    }}
                    targets={Array.from({ length: n }, (_, k) => {
                      const seat = (dealing.first + k) % n;
                      if (seat === me)
                        return {
                          x: stage.width / 2,
                          y: layout.hand.slots[0]?.y ?? layout.hand.top,
                        };
                      const plate = layout.seats[(seat - me + n) % n]?.plate;
                      if (!plate) return tableCenter;
                      const at = fanSlot(layout, plate, fanCard, 0, 1);
                      return { x: at.x, y: at.y };
                    })}
                    handSize={dealing.handSize}
                    kittyCount={0}
                    startDelay={0}
                    pattern={onecardDealPattern(dealing.handSize)}
                    shuffleMs={dealing.shuffleMs}
                  />
                ) : (
                  <DeckShuffle deck={table.deck} />
                )}
              </div>
            )}
          {/* 카드 내기·먹기·다시 섞기 겉그림(판 상태는 이미 그렸다) */}
          <FlightLayer flights={fx.flights} onDone={fx.done} />

          {mission && (
            <MissionOverlay
              mission={mission}
              {...missionPlace(
                layout,
                stage.width,
                stage.height,
                fanCard.h * 0.72,
              )}
            />
          )}

          {online && (
            <div
              className="pointer-events-none absolute z-[330] flex flex-col items-center gap-1 [&>*]:pointer-events-auto"
              style={{
                left: layout.gutter,
                width: stage.width - 2 * layout.gutter,
                top: layout.hud.y + layout.hud.h + 6,
              }}
            >
              <HwatuFairBar me={me} over={over} />
            </div>
          )}

          <ResultBanner
            banner={banner}
            seq={eventSeq}
            center={tableCenter}
            stageHeight={stage.height}
          />

          {online && chatOpen && (
            <div className="absolute top-14 right-3 z-[380] w-[min(92%,22rem)] rounded-2xl border border-white/15 bg-[#0b1533]/95 p-3 shadow-2xl backdrop-blur">
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

          {online && reconnecting && !hostLeft && (
            <div
              role="status"
              className="absolute inset-x-0 top-16 z-[350] mx-auto flex w-fit max-w-[92%] items-center gap-2 rounded-2xl bg-black/85 px-4 py-3 text-sm shadow-2xl"
            >
              <span className="inline-block size-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              방장과 연결이 끊겼습니다. 다시 연결하는 중…
            </div>
          )}
          {online && hostLeft && (
            <div className="absolute inset-x-0 top-16 z-[350] mx-auto flex w-fit items-center gap-3 rounded-2xl bg-black/85 px-4 py-3 text-sm shadow-2xl">
              방장이 방을 나갔습니다
              <button
                type="button"
                onClick={onExit}
                className="rounded-lg bg-amber-400 px-3 py-1 font-semibold text-black"
              >
                처음으로
              </button>
            </div>
          )}

          {showSettings && (
            <OnecardSettingsMenu onClose={() => setShowSettings(false)} />
          )}
        </>
      )}
    </main>
  );
}
