"use client";

import type { OnecardCard } from "@game/onecard-engine";
import { useCallback, useEffect, useRef, useState } from "react";

import { ShuffleLoop } from "@/components/card-fx";

import { type FxStep, fxStart, type Spot } from "../card-fx";
import { OnecardCardView } from "./OnecardCard";

/** 무대에 띄운 연출 한 걸음 */
interface Flight {
  id: number;
  step: FxStep;
  /** 지금부터 시작까지(ms) */
  delay: number;
  /** 다시 섞기 연출 자리(덱) */
  deck: Spot;
}

/**
 * 카드 연출 줄. `run`으로 걸음을 넣으면 앞 연출 뒤에 잇는다. 먹는 카드는 내려앉을 때까지 손패·부채에서 가린다
 * (`hiddenCards`, `hiddenSeats`). 판 상태는 건드리지 않는다
 */
export function useCardFlights() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [hiddenCards, setHiddenCards] = useState<ReadonlySet<OnecardCard>>(
    () => new Set(),
  );
  const [hiddenSeats, setHiddenSeats] = useState<ReadonlyMap<number, number>>(
    () => new Map(),
  );
  const busyUntil = useRef(0);
  const nextId = useRef(1);

  const clear = useCallback(() => {
    busyUntil.current = 0;
    setFlights([]);
    setHiddenCards(new Set());
    setHiddenSeats(new Map());
  }, []);

  const run = useCallback(
    (steps: readonly FxStep[], duration: number, deck: Spot) => {
      if (steps.length === 0) return;
      const now = Date.now();
      const { delay, flush } = fxStart(now, busyUntil.current);
      const added = steps.map((step) => ({
        id: nextId.current++,
        step,
        delay: delay + step.at,
        deck,
      }));
      busyUntil.current = now + delay + duration;
      const cards = steps.flatMap((s) =>
        s.kind === "fly" && s.hideCard ? [s.hideCard] : [],
      );
      const seats = steps.flatMap((s) =>
        s.kind === "fly" && s.hideSeat !== undefined ? [s.hideSeat] : [],
      );
      setFlights((old) => (flush ? added : [...old, ...added]));
      setHiddenCards((old) => new Set([...(flush ? [] : old), ...cards]));
      setHiddenSeats((old) => {
        const next = new Map(flush ? [] : old);
        for (const seat of seats) next.set(seat, (next.get(seat) ?? 0) + 1);
        return next;
      });
    },
    [],
  );

  const done = useCallback((flight: Flight) => {
    setFlights((old) => old.filter((f) => f.id !== flight.id));
    const { step } = flight;
    if (step.kind !== "fly") return;
    const card = step.hideCard;
    if (card)
      setHiddenCards((old) => {
        const next = new Set(old);
        next.delete(card);
        return next;
      });
    const seat = step.hideSeat;
    if (seat !== undefined)
      setHiddenSeats((old) => {
        const next = new Map(old);
        const left = (next.get(seat) ?? 0) - 1;
        if (left > 0) next.set(seat, left);
        else next.delete(seat);
        return next;
      });
  }, []);

  return { flights, hiddenCards, hiddenSeats, run, done, clear };
}

/** 날아가는 겉그림 한 장. `delay` 뒤 `from`에 나타나 `ms` 동안 `to`로 옮기고 사라진다 */
function Ghost({
  card,
  from,
  to,
  delay,
  ms,
  onDone,
}: {
  card: OnecardCard | null;
  from: Spot;
  to: Spot;
  delay: number;
  ms: number;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<"wait" | "from" | "go">("wait");
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    let raf = 0;
    const show = setTimeout(() => {
      setPhase("from");
      // 출발 자리를 한 번 그린 다음 목표로 옮겨야 전환이 일어난다(PlayingCard와 같다)
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => setPhase("go"));
      });
    }, delay);
    const end = setTimeout(() => doneRef.current(), delay + ms + 40);
    return () => {
      clearTimeout(show);
      clearTimeout(end);
      cancelAnimationFrame(raf);
    };
  }, [delay, ms]);
  if (phase === "wait") return null;
  const at = phase === "go" ? to : from;
  const w = to.w;
  const h = Math.round(w * 1.4);
  return (
    <OnecardCardView
      card={card}
      width={w}
      decorative
      className="absolute top-0 left-0 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
      style={{
        transform: `translate(${at.x - w / 2}px, ${at.y - h / 2}px) rotate(${at.rotate ?? 0}deg) scale(${at.w / w})`,
        transitionProperty: "transform",
        transitionDuration: phase === "go" ? `${ms}ms` : "0ms",
      }}
    />
  );
}

/** `delay` 뒤 `ms` 동안 덱 자리에서 덱이 갈라졌다 합쳐진다(다시 섞기) */
function TimedShuffle({
  deck,
  delay,
  ms,
  onDone,
}: {
  deck: Spot;
  delay: number;
  ms: number;
  onDone: () => void;
}) {
  const [on, setOn] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const show = setTimeout(() => setOn(true), delay);
    const end = setTimeout(() => doneRef.current(), delay + ms);
    return () => {
      clearTimeout(show);
      clearTimeout(end);
    };
  }, [delay, ms]);
  if (!on) return null;
  return <DeckShuffle deck={deck} />;
}

/** 덱 자리에서 섞는 모습(멘탈 포커로 섞는 동안, 다시 섞기) */
export function DeckShuffle({ deck }: { deck: Spot }) {
  return (
    <ShuffleLoop
      center={{ x: deck.x, y: deck.y }}
      card={{ w: deck.w, h: Math.round(deck.w * 1.4) }}
      count={8}
    />
  );
}

/**
 * 연출 겉그림을 그리는 층. 판 위 모든 것보다 위에 두되 누름은 받지 않는다(더미 치기·손패를 가리지 않는다).
 * 화면 시험이 연출이 도는지 기다릴 수 있게 `data-fx`에 남은 걸음 수를 단다
 */
export function FlightLayer({
  flights,
  onDone,
}: {
  flights: readonly Flight[];
  onDone: (flight: Flight) => void;
}) {
  return (
    <div
      aria-hidden
      data-fx={flights.length}
      className="pointer-events-none absolute inset-0 z-[245]"
    >
      {flights.map((f) =>
        f.step.kind === "fly" ? (
          <Ghost
            key={f.id}
            card={f.step.card}
            from={f.step.from}
            to={f.step.to}
            delay={f.delay}
            ms={f.step.ms}
            onDone={() => onDone(f)}
          />
        ) : (
          <TimedShuffle
            key={f.id}
            deck={f.deck}
            delay={f.delay}
            ms={f.step.ms}
            onDone={() => onDone(f)}
          />
        ),
      )}
    </div>
  );
}
