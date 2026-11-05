"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/cn";

import { ShuffleLoop } from "./DealAnimation";
import { type FlightStep, fxStart, type Spot } from "./flight-plan";
import { type CardKind, cardHeight } from "./kind";

/*
 * 날아가는 카드 줄(docs/05 4.12, 계획은 `flight-plan.ts`). `run`으로 걸음을 넣으면 앞 연출 뒤에 잇고, 너무 밀렸으면
 * 남은 것을 버린다. 겉그림은 `FlightLayer`가 카드 종류(`CardKind`)로 그린다. 내려앉을 때까지 가릴 카드는
 * `isHidden`(또는 `FlightScope` 아래 `useFlightHidden`)으로 알 수 있다. 판 상태는 건드리지 않는다
 */

/** 무대에 띄운 연출 한 걸음 */
export interface Flight<C extends string = string> {
  id: number;
  step: FlightStep<C>;
  /** 지금부터 시작까지(ms) */
  delay: number;
}

export interface CardFlights<C extends string = string> {
  flights: readonly Flight<C>[];
  /** 걸음을 넣는다. `duration`은 마지막 걸음이 끝나는 때(ms) */
  run(steps: readonly FlightStep<C>[], duration: number): void;
  /** 한 걸음이 끝났다(`FlightLayer`가 부른다) */
  done(flight: Flight<C>): void;
  /** 남은 연출을 모두 버린다(대국이 바뀔 때) */
  clear(): void;
  /** 이 카드(`data-flip` 이름)의 겉그림이 날아오는 중이라 가려 두는가 */
  isHidden(id: string | undefined): boolean;
}

/** 카드 연출 줄 */
export function useCardFlights<C extends string = string>(): CardFlights<C> {
  const [flights, setFlights] = useState<Flight<C>[]>([]);
  const [hidden, setHidden] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const busyUntil = useRef(0);
  const nextId = useRef(1);

  const clear = useCallback(() => {
    busyUntil.current = 0;
    setFlights([]);
    setHidden(new Map());
  }, []);

  const run = useCallback(
    (steps: readonly FlightStep<C>[], duration: number) => {
      if (steps.length === 0) return;
      const now = Date.now();
      const { delay, flush } = fxStart(now, busyUntil.current);
      const added = steps.map((step) => ({
        id: nextId.current++,
        step,
        delay: delay + step.at,
      }));
      busyUntil.current = now + delay + duration;
      const hides = steps.flatMap((s) =>
        s.kind === "fly" && s.hide !== undefined ? [s.hide] : [],
      );
      setFlights((old) => (flush ? added : [...old, ...added]));
      setHidden((old) => {
        const next = new Map(flush ? [] : old);
        for (const id of hides) next.set(id, (next.get(id) ?? 0) + 1);
        return next;
      });
    },
    [],
  );

  const done = useCallback((flight: Flight<C>) => {
    setFlights((old) => old.filter((f) => f.id !== flight.id));
    const { step } = flight;
    if (step.kind !== "fly" || step.hide === undefined) return;
    const id = step.hide;
    setHidden((old) => {
      if (!old.has(id)) return old;
      const next = new Map(old);
      const left = (next.get(id) ?? 0) - 1;
      if (left > 0) next.set(id, left);
      else next.delete(id);
      return next;
    });
  }, []);

  const isHidden = useCallback(
    (id: string | undefined) => id !== undefined && hidden.has(id),
    [hidden],
  );

  return useMemo(
    () => ({ flights, run, done, clear, isHidden }),
    [flights, run, done, clear, isHidden],
  );
}

const HiddenContext = createContext<(id: string | undefined) => boolean>(
  () => false,
);

/** 아래 카드 그림이 `useFlightHidden`으로 "날아오는 중이라 가린다"를 알게 한다 */
export function FlightScope({
  fx,
  children,
}: {
  fx: Pick<CardFlights, "isHidden">;
  children: ReactNode;
}) {
  return (
    <HiddenContext.Provider value={fx.isHidden}>
      {children}
    </HiddenContext.Provider>
  );
}

/** 이 카드(`data-flip` 이름)의 겉그림이 날아오는 중인가(`FlightScope` 밖이면 늘 거짓) */
export function useFlightHidden(id: string | undefined): boolean {
  return useContext(HiddenContext)(id);
}

/**
 * 날아가는 겉그림 한 장. `delay` 뒤 `from`에 나타나(`wait`면 처음부터 보인다) `ms` 동안 `to`로 옮기고 사라진다.
 * 크기는 `to.w` 기준이고, `from.w`가 다르면 줄이거나 키워 보인다
 */
function Ghost<C extends string>({
  kind,
  card,
  from,
  to,
  delay,
  ms,
  wait,
  onDone,
}: {
  kind: CardKind<C>;
  card: C | null;
  from: Spot;
  to: Spot;
  delay: number;
  ms: number;
  wait: boolean;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<"wait" | "from" | "go">(
    wait ? "from" : "wait",
  );
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    let raf = 0;
    const show = setTimeout(() => {
      setPhase("from");
      // 출발 자리를 한 번 그린 다음 목표로 옮겨야 전환이 일어난다(useArrival과 같다)
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
  const h = cardHeight(kind, w);
  return (
    <div
      className="absolute top-0 left-0 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
      style={{
        width: w,
        height: h,
        transform: `translate(${at.x - w / 2}px, ${at.y - h / 2}px) rotate(${at.rotate ?? 0}deg) scale(${at.w / w})`,
        transitionProperty: "transform",
        transitionDuration: phase === "go" ? `${ms}ms` : "0ms",
      }}
    >
      {card === null ? kind.renderBack(w) : kind.renderFace(card, w)}
    </div>
  );
}

/** 덱 자리에서 섞는 모습(멘탈 포커로 섞는 동안, 다시 섞기) */
export function DeckShuffle({
  kind,
  deck,
  count = 8,
}: {
  kind: CardKind;
  deck: Spot;
  count?: number;
}) {
  return (
    <ShuffleLoop
      center={{ x: deck.x, y: deck.y }}
      kind={kind}
      width={deck.w}
      count={count}
    />
  );
}

/** `delay` 뒤 `ms` 동안 덱 자리에서 덱이 갈라졌다 합쳐진다(다시 섞기) */
function TimedShuffle({
  kind,
  deck,
  delay,
  ms,
  onDone,
}: {
  kind: CardKind;
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
  return <DeckShuffle kind={kind} deck={deck} />;
}

/**
 * 연출 겉그림을 그리는 층. 무대(좌표 기준) 바로 안에 두고, 누름은 받지 않는다(원카드 더미 치기·손패를 가리지
 * 않는다). 화면 시험이 연출이 도는지 기다릴 수 있게 `data-fx`에 남은 걸음 수를 단다. 높이(z)는 `className`으로
 */
export function FlightLayer<C extends string>({
  fx,
  kind,
  className = "z-[245]",
}: {
  fx: Pick<CardFlights<C>, "flights" | "done">;
  kind: CardKind<C>;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      data-fx={fx.flights.length}
      className={cn("pointer-events-none absolute inset-0", className)}
    >
      {fx.flights.map((f) =>
        f.step.kind === "fly" ? (
          <Ghost
            key={f.id}
            kind={kind}
            card={f.step.card}
            from={f.step.from}
            to={f.step.to}
            delay={f.delay}
            ms={f.step.ms}
            wait={f.step.wait ?? false}
            onDone={() => fx.done(f)}
          />
        ) : (
          <TimedShuffle
            key={f.id}
            kind={kind as CardKind}
            deck={f.step.deck}
            delay={f.delay}
            ms={f.step.ms}
            onDone={() => fx.done(f)}
          />
        ),
      )}
    </div>
  );
}
