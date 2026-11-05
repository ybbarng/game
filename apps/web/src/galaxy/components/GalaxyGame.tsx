"use client";

import { asState } from "@game/galaxy-ai";
import {
  type Action,
  assetsOf,
  clockTurn,
  type GalaxyView,
  type GameResult,
  NUMBERS,
  rentOf,
  STAR_SQUARES,
  standingsOf,
  starAt,
  timeControlOf,
  turnLimitOf,
} from "@game/galaxy-engine";
import { useEffect, useMemo, useState } from "react";
import { ChatBox } from "@/components/ChatBox";
import { GameClock } from "@/components/GameClock";
import { ResignButton } from "@/components/ResignButton";
import { ResultBanner } from "@/components/ResultBanner";
import { RoundOutcome } from "@/components/RoundOutcome";
import {
  MissionOverlay,
  type MissionProps,
} from "@/components/tutorial/MissionOverlay";
import type { ResultBanner as Banner } from "@/game/result-banner";
import { cn } from "@/lib/cn";
import { useChat } from "@/net/chat";
import { IdleHint, useIdleHint } from "@/stardraw/components/IdleHint";
import { myRequestCard } from "../chain";
import { eventLine } from "../events";
import { money, seatLabel, squareName, subject } from "../format";
import { shownCash } from "../fx";
import { GALAXY_FX } from "../fx-timing";
import { metSquares, outcomeOf } from "../kit";
import { DECISION_MS } from "../online";
import { botReactions } from "../reactions";
import { galaxySession } from "../session";
import { GALAXY_LENGTHS, GALAXY_LEVELS, useGalaxySettings } from "../settings";
import { prefersReducedMotion, useGalaxy } from "../store";
import { useFxElapsed } from "../use-fx";
import {
  BidSheet,
  BuySheet,
  DebtSheet,
  ManagePanel,
  PRIMARY,
  rentTable,
  SECONDARY,
  Sheet,
  StarFacts,
  TradeAnswer,
  TradeComposer,
} from "./Decision";
import { GalaxyBoard } from "./GalaxyBoard";
import { GameRecap } from "./GameRecap";
import { ShipToken } from "./parts";
import { SeatCard, type SeatCardProps } from "./SeatCard";
import { cornerHelp, SquareCard } from "./SquareCard";

/** 은하 한 바퀴 화면 바탕: 깊은 밤하늘 */
export const GALAXY_BG =
  "bg-[radial-gradient(ellipse_at_top,#1d2f5c_0%,#0b1430_45%,#070d1c_100%)]";

function resultText(
  result: GameResult | null,
  view: GalaxyView,
  name: (seat: number) => string,
): string {
  if (!result) return "게임을 끝냈어요";
  const mine = result.standings.find((s) => s.seat === view.mySeat);
  const rank = mine ? `${mine.rank}등` : "";
  switch (result.kind) {
    case "resign":
      return result.seat === view.mySeat
        ? "기권했어요"
        : `${name(result.seat ?? 0)} 기권 · 나 ${rank}`;
    case "bankrupt":
      return result.seat === view.mySeat
        ? `운항을 멈췄어요 · ${rank}`
        : `${name(result.seat ?? 0)} 운항 중단으로 끝 · 나 ${rank}`;
    case "time":
      return `시간을 다 써서 끝났어요 · 나 ${rank}`;
    case "forfeit":
      return "공개를 기다리지 않고 끝냈어요";
    default:
      return mine?.rank === 1 ? "1등이에요!" : `판이 끝났어요 · 나 ${rank}`;
  }
}

/**
 * 둘러앉은 자리(docs/48 15-6): 나부터 차례 순서(시계 방향)로 아래·왼쪽·위·오른쪽.
 * 2인은 아래·위, 3인은 아래·왼쪽·오른쪽
 */
export type SeatSpot = "bottom" | "left" | "top" | "right";
export function seatSpots(players: number): SeatSpot[] {
  if (players === 2) return ["bottom", "top"];
  if (players === 3) return ["bottom", "left", "right"];
  return ["bottom", "left", "top", "right"];
}

/** 화면 모양: 넓은 화면(판 둘레에 자리), 낮고 넓은 화면(눕힌 휴대폰), 세로로 쌓기(세운 휴대폰·좁은 창) */
type TableMode = "wide" | "short" | "stack";
function useTableMode(): TableMode {
  const [mode, setMode] = useState<TableMode>("stack");
  useEffect(() => {
    const short = window.matchMedia(
      "(orientation: landscape) and (max-height: 600px)",
    );
    const wide = window.matchMedia("(min-width: 1024px)");
    const update = () =>
      setMode(short.matches ? "short" : wide.matches ? "wide" : "stack");
    update();
    short.addEventListener("change", update);
    wide.addEventListener("change", update);
    return () => {
      short.removeEventListener("change", update);
      wide.removeEventListener("change", update);
    };
  }, []);
  return mode;
}

/** 내 별자리: 가진 별 수와 선, 완성 */
function MyConstellations({ view }: { view: GalaxyView }) {
  const me = view.mySeat;
  const rows = view.board.groups
    .map((g, i) => ({
      g,
      i,
      owned: g.squares.filter((sq) => view.owners[sq] === me),
    }))
    .filter((r) => r.owned.length > 0);
  if (rows.length === 0)
    return <p className="text-white/50 text-xs">아직 가진 별이 없어요.</p>;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {rows.map(({ g, owned }) => {
        const complete = owned.length >= g.squares.length;
        return (
          <li
            key={g.id}
            data-my-group={g.id}
            className="flex items-center gap-2"
          >
            <span className="w-24 truncate">{g.ko}</span>
            <span className="font-mono text-sky-100/80 text-xs tracking-tight">
              {g.squares
                .map((sq) => (view.owners[sq] === me ? "✶" : "·"))
                .join(complete || owned.length >= 2 ? "─" : " ")}
            </span>
            <span
              className={cn(
                "ml-auto text-xs",
                complete ? "font-bold text-amber-200" : "text-white/50",
              )}
            >
              {complete ? "완성" : `${owned.length}/${g.squares.length}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** 칸 정보(누른 칸·마우스를 올린 칸) */
function SquareInfo({
  view,
  square,
  name,
  onClose,
}: {
  view: GalaxyView;
  square: number;
  name: (seat: number) => string;
  onClose?: () => void;
}) {
  const star = starAt(view.board, square);
  const owner = view.owners[square] ?? -1;
  const rents = rentTable(view, square);
  return (
    <Sheet testId="info">
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold">
          {star ? `✶ ${star.star.ko}` : squareName(view.board, square)}
          {star && (
            <span className="ml-1 font-normal text-sm text-white/60">
              {money(star.value)}
            </span>
          )}
        </p>
        {onClose && (
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="text-white/60"
          >
            ✕
          </button>
        )}
      </div>
      {star ? (
        <>
          <StarFacts view={view} square={square} />
          <p className="mt-1 text-white/60 text-xs">
            {owner >= 0
              ? `${name(owner)}의 별 · 지금 이용료 ${money(rentOf(view, square))}`
              : "주인 없는 별"}
          </p>
          {rents && (
            <p className="text-white/45 text-xs">
              1단 {money(rents.single)} · 별 둘 {money(rents.pair)} · 완성{" "}
              {money(rents.complete)} · 2단 {money(rents.level2)} · 3단{" "}
              {money(rents.level3)} · 큰 정거장 {money(rents.grand)}
            </p>
          )}
        </>
      ) : (
        <p className="text-white/60 text-xs">
          {cornerHelp(view, square).join(" ")}
        </p>
      )}
    </Sheet>
  );
}

/** 판 끝: 순위·자산 표 */
function Standings({
  view,
  name,
}: {
  view: GalaxyView;
  name: (seat: number) => string;
}) {
  const rows = view.result?.standings ?? [];
  if (rows.length === 0) return null;
  return (
    <table data-standings className="w-full text-sm">
      <thead className="text-white/50 text-xs">
        <tr>
          <th className="text-left font-normal">순위</th>
          <th className="text-left font-normal">우주인</th>
          <th className="text-right font-normal">별빛</th>
          <th className="text-right font-normal">자산</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.seat}
            className={cn(r.seat === view.mySeat && "text-amber-100")}
          >
            <td>{r.rank}등</td>
            <td className="flex items-center gap-1">
              <ShipToken seat={r.seat} size={11} />
              {name(r.seat)}
              {r.out && <span className="text-white/40 text-xs">(중단)</span>}
            </td>
            <td className="text-right tabular-nums">{money(r.cash)}</td>
            <td className="text-right font-bold tabular-nums">
              {money(r.assets)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 판 끝: 이번 판에서 만난 별(별자리별, 산 별·처음 표시, docs/48 5-5) */
function MetStars({
  view,
  history,
  firstMet,
}: {
  view: GalaxyView;
  history: Parameters<typeof metSquares>[1];
  firstMet: readonly string[];
}) {
  const met = new Set(metSquares(view, history));
  const [open, setOpen] = useState<number | null>(null);
  const groups = view.board.groups.filter((g) =>
    g.squares.some((sq) => met.has(sq)),
  );
  if (groups.length === 0) return null;
  return (
    <section data-met-stars className="w-full">
      <h2 className="mb-1 font-bold text-sm">이번 판에서 만난 별</h2>
      <ul className="flex flex-col gap-1.5">
        {groups.map((g) => (
          <li key={g.id} className="text-sm">
            <span className="mr-2 text-white/60 text-xs">{g.ko}</span>
            {g.squares
              .filter((sq) => met.has(sq))
              .map((sq) => {
                const star = starAt(view.board, sq)?.star;
                if (!star) return null;
                const mine = view.owners[sq] === view.mySeat;
                const first = firstMet.includes(star.id);
                return (
                  <button
                    key={sq}
                    type="button"
                    onClick={() => setOpen(open === sq ? null : sq)}
                    className={cn(
                      "mr-1 mb-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                      mine
                        ? "border-amber-200/60 bg-amber-200/10"
                        : "border-white/15 bg-white/5",
                    )}
                  >
                    {mine ? "✶" : "·"} {star.ko}
                    {first && (
                      <span className="rounded bg-sky-300/90 px-1 text-[10px] text-slate-950">
                        처음
                      </span>
                    )}
                  </button>
                );
              })}
          </li>
        ))}
      </ul>
      {open !== null && (
        <div className="mt-1">
          <StarFacts view={view} square={open} />
        </div>
      )}
    </section>
  );
}

/** 모두가 함께 내는 때(약속·공개·봉투) 아직 내지 않은 자리 */
function togetherWaiting(view: GalaxyView): number[] {
  return view.cash
    .map((_, seat) => seat)
    .filter((seat) => {
      if (view.out[seat]) return false;
      switch (view.phase) {
        case "commit":
          return view.chains[seat]?.commit === null;
        case "reveal":
          return view.reveals[seat] === null;
        case "bid":
          return view.auction?.committed[seat] === false;
        case "bidReveal":
          return view.auction?.revealed[seat] === false;
        case "requestReveal":
          return view.requests?.reveals[seat] === null;
        default:
          return false;
      }
    });
}

/**
 * 온라인 결정 시간(docs/48 4-5). 결정이 이 화면에 보인 때부터 이 기기에서 센다(방장 시계와 왕복만큼 다를 수 있다).
 * 다 되면 방장이 대신 정한다
 */
function DecisionTimer({ resetKey }: { resetKey: string }) {
  const [since, setSince] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  // biome-ignore lint/correctness/useExhaustiveDependencies: 결정이 바뀔 때만 다시 센다
  useEffect(() => {
    const t = Date.now();
    setSince(t);
    setNow(t);
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [resetKey]);
  const left = Math.max(0, Math.ceil((DECISION_MS - (now - since)) / 1000));
  return (
    <p
      data-decision-timer={left}
      className={cn(
        "self-end rounded-full bg-black/30 px-2 py-0.5 text-xs tabular-nums",
        left <= 5 ? "text-rose-200" : "text-white/70",
      )}
    >
      {left}초
    </p>
  );
}

/** 대국 화면(docs/48 7절). PC·눕힌 폰은 판 왼쪽 + 오른쪽 칸, 세로 폰은 판 아래로 쌓는다 */
export function GalaxyGame({
  onExit,
  mission,
}: {
  onExit: () => void;
  /** 배우기 미션: 판 위에 목표 띠와 성공·실패 안내를 얹는다 */
  mission?: MissionProps;
}) {
  const {
    view,
    host,
    notice,
    level,
    events,
    history,
    timeline,
    fxStart,
    playing,
    firstMet,
    local,
    seatNames,
    reconnecting,
    hostLeft,
    offlineSeats,
  } = useGalaxy();
  const submit = useGalaxy((s) => s.submit);
  const placeBid = useGalaxy((s) => s.placeBid);
  const clearNotice = useGalaxy((s) => s.clearNotice);
  const followSetting = useGalaxySettings((s) => s.follow);
  const elapsed = useFxElapsed(timeline, fxStart);
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [trading, setTrading] = useState(false);
  const [partner, setPartner] = useState<number | null>(null);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [portrait, setPortrait] = useState(false);
  const mode = useTableMode();
  const secrets = useGalaxy((s) => s.secrets);

  useEffect(() => {
    const mq = window.matchMedia(
      "(max-width: 640px) and (orientation: portrait)",
    );
    const update = () => setPortrait(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 2200);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  const decision = view?.decision ?? null;
  const ready = !playing && decision !== null;
  const canRoll = ready && decision?.kind === "roll";
  const hint = useIdleHint(canRoll && !trading, GALAXY_FX.idleHint);

  // 결정이 바뀌면 거래 고르기를 닫는다.
  const decisionKey = view
    ? `${view.phase}:${view.turn.seat}:${view.turn.rolls}:${view.revealCount}`
    : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: 차례·단계가 바뀔 때만 닫는다
  useEffect(() => {
    setTrading(false);
    setPartner(null);
    setMarked(new Set());
  }, [decisionKey]);

  const act = (a: Action) => {
    setSelected(null);
    submit(a);
  };

  // 키보드: Space 굴리기, B 사기, N 넘기기, T 거래, ←→ 칸 살피기, Esc 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea")) return;
      if (e.key === "Escape") {
        setSelected(null);
        setTrading(false);
        setMarked(new Set());
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const d = e.key === "ArrowRight" ? 1 : 31;
        setSelected((s) => ((s ?? view?.positions[view.mySeat] ?? 0) + d) % 32);
        return;
      }
      if (!ready || !decision) return;
      if (e.key === " " && !target?.closest("button")) {
        if (decision.kind === "roll") {
          e.preventDefault();
          act({ type: "roll" });
        } else if (decision.kind === "end") {
          e.preventDefault();
          act({ type: "end" });
        }
      } else if (e.key === "b" && decision.kind === "buy" && decision.canAfford)
        act({ type: "buy" });
      else if (e.key === "n" && decision.kind === "buy") act({ type: "pass" });
      else if (e.key === "t" && decision.kind === "roll" && decision.canOffer)
        setTrading(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const cash = useMemo(
    () => (view ? shownCash(timeline, events, view.cash, elapsed) : []),
    [view, timeline, events, elapsed],
  );

  // 혼자 하기: 컴퓨터가 큰 이용료·별자리 완성에 반응한다(연출이 끝난 뒤, 사건에서 결정적으로)
  const solo = local !== null;
  const meSeat = host?.seat ?? 0;
  const players0 = view?.rules.players ?? 2;
  useEffect(() => {
    if (!solo || prefersReducedMotion()) return;
    const list = botReactions(events, { players: players0, me: meSeat });
    if (list.length === 0) return;
    const id = setTimeout(() => {
      for (const r of list) useChat.getState().react(r.from, r.to, r.kind);
    }, timeline.total);
    return () => clearTimeout(id);
  }, [events, timeline, solo, players0, meSeat]);

  if (!view || !host) return null;
  const me = host.seat;
  const gameOver = view.phase === "gameOver";
  const players = view.rules.players;
  const online = local === null;
  const name = (seat: number) => seatLabel(seat, me, seatNames, players);
  const control = timeControlOf(view.rules);
  // 온라인 결정 시간(docs/48 4-5): 봉투는 늘, 차례 결정은 개인 시간이 없는 판에서만
  const timedDecision =
    online &&
    !playing &&
    (decision?.kind === "bid" ||
      (control === null &&
        (decision?.kind === "roll" ||
          decision?.kind === "end" ||
          decision?.kind === "buy" ||
          decision?.kind === "trade" ||
          decision?.kind === "debt")));
  const together =
    view.phase === "commit" ||
    view.phase === "reveal" ||
    view.phase === "bid" ||
    view.phase === "bidReveal" ||
    view.phase === "requestReveal";
  const waitingOffline =
    online &&
    !gameOver &&
    together &&
    togetherWaiting(view).some((s) => offlineSeats.includes(s));
  const hostRoom = galaxySession.host;
  const levelName = GALAXY_LEVELS.find((l) => l.value === level)?.label ?? "";
  const lengthName =
    GALAXY_LENGTHS.find((l) => l.value === view.rules.length)?.label ?? "";
  const limit = turnLimitOf(view.rules);
  const turnName = name(view.turn.seat);
  const follow = portrait && followSetting && !prefersReducedMotion();

  let status: string;
  if (gameOver) status = resultText(view.result, view, name);
  else if (playing)
    status = view.turn.seat === me ? "내 차례예요" : `${turnName}의 차례예요`;
  else if (!decision) {
    status =
      view.phase === "bid" || view.phase === "bidReveal"
        ? view.auction
          ? `${subject(name(view.auction.passer))} ${squareName(view.board, view.auction.square)}에 도착했지만 사지 않아 모두 봉투를 내는 중이에요`
          : "모두가 봉투를 내는 중이에요"
        : view.phase === "commit" || view.phase === "reveal"
          ? "모두의 기기가 주사위를 함께 정하는 중이에요"
          : view.phase === "requestReveal"
            ? "모두의 관측 의뢰서를 펼치는 중이에요"
            : `${turnName}의 차례예요`;
  } else
    switch (decision.kind) {
      case "roll":
        status =
          decision.purpose === "jailRoll"
            ? "소행성대에 걸렸어요."
            : decision.purpose === "comet"
              ? "혜성이에요. 한 번 더 굴려요."
              : "내 차례예요. 주사위를 굴려 주세요.";
        break;
      case "end":
        status = "차례를 마칠까요?";
        break;
      case "buy":
        status = "이 별을 살까요?";
        break;
      case "bid":
        status = "봉투 입찰에 낼 값을 골라요.";
        break;
      case "trade":
        status = "거래 제안이 왔어요.";
        break;
      case "debt":
        status = "별빛이 모자라요. 정리해 주세요.";
        break;
      default:
        status = "잠깐만요";
    }

  const ended = events.find((e) => e.type === "gameEnded");
  const outcome = gameOver ? outcomeOf(view.result, me) : null;
  const mine = view.result?.standings.find((s) => s.seat === me);
  const banner: Banner | null =
    ended?.type === "gameEnded" && !playing && !mission
      ? {
          won: outcome === "win",
          draw: outcome === "draw",
          detail: mine ? `${mine.rank}등 · 자산 ${money(mine.assets)}` : null,
        }
      : null;

  const onPick = (square: number) => {
    if (trading && partner !== null) {
      const owner = view.owners[square];
      if (owner === me || owner === partner) {
        setMarked((m) => {
          const next = new Set(m);
          if (next.has(square)) next.delete(square);
          else next.add(square);
          return next;
        });
        return;
      }
    }
    setSelected((s) => (s === square ? null : square));
  };

  const info = hover ?? selected;
  const log = history
    .flatMap((e) => {
      const line = eventLine(e, view.board, name);
      return line ? [line] : [];
    })
    .slice(-8)
    .reverse();
  const myAssets = assetsOf(asState(view), me);
  const myStars = STAR_SQUARES.filter((sq) => view.owners[sq] === me).length;

  const decisionPanel = !ready ? null : decision?.kind === "buy" ? (
    <BuySheet
      view={view}
      square={decision.square}
      price={decision.price}
      canAfford={decision.canAfford}
      submit={act}
    />
  ) : decision?.kind === "bid" ? (
    <BidSheet
      key={decision.index}
      view={view}
      square={decision.square}
      max={decision.max}
      onBid={(v) => placeBid(v)}
      name={name}
    />
  ) : decision?.kind === "trade" ? (
    <TradeAnswer view={view} offer={decision.offer} name={name} submit={act} />
  ) : decision?.kind === "debt" ? (
    <DebtSheet view={view} submit={act} />
  ) : trading ? (
    <TradeComposer
      view={view}
      partner={partner}
      setPartner={setPartner}
      marked={marked}
      clearMarked={() => setMarked(new Set())}
      name={name}
      submit={act}
      onClose={() => {
        setTrading(false);
        setPartner(null);
      }}
    />
  ) : decision?.kind === "roll" || decision?.kind === "end" ? (
    <Sheet testId={decision.kind}>
      <div className="flex flex-wrap gap-2">
        {decision.kind === "roll" ? (
          <span className="relative min-w-40 flex-1">
            <button
              type="button"
              data-roll
              onClick={() => act({ type: "roll" })}
              className={cn(PRIMARY, "w-full py-3 text-lg")}
            >
              {decision.purpose === "comet"
                ? "한 번 더 굴리기"
                : "주사위 굴리기"}
            </button>
            <IdleHint kind="tap" shown={hint} />
          </span>
        ) : (
          <button
            type="button"
            data-end-turn
            onClick={() => act({ type: "end" })}
            className={cn(PRIMARY, "min-w-40 flex-1 py-3")}
          >
            차례 마치기
          </button>
        )}
        {decision.kind === "roll" && decision.canPayFine && (
          <button
            type="button"
            onClick={() => act({ type: "payFine" })}
            className={SECONDARY}
          >
            {money(NUMBERS.asteroidFine)} 내고 나가기
          </button>
        )}
        {decision.kind === "roll" && decision.canOffer && (
          <button
            type="button"
            data-trade
            onClick={() => setTrading(true)}
            className={SECONDARY}
          >
            거래 제안
          </button>
        )}
      </div>
      <div className="mt-2">
        <ManagePanel view={view} submit={act} />
      </div>
    </Sheet>
  ) : null;

  const standingsNow = standingsOf({ ...asState(view), cash });
  const myRequestId = view.requests
    ? myRequestCard(view, online ? secrets : null)
    : null;
  const spots = seatSpots(players);
  const compact = mode !== "wide";
  const plate = (seat: number) => {
    const clock = view.clocks?.[seat];
    const props: SeatCardProps = {
      view,
      seat,
      cash: cash[seat] ?? 0,
      rank: standingsNow.find((r) => r.seat === seat)?.rank ?? null,
      name: name(seat),
      turn: view.turn.seat === seat && !gameOver,
      mine: seat === me,
      compact,
      request: seat === me ? myRequestId : null,
      ...(seat !== me
        ? {
            onReact: (kind) => {
              useChat.getState().react(me, seat, kind);
            },
          }
        : {}),
      ...(control && clock
        ? {
            clock: (
              <span data-clock-seat={seat}>
                <GameClock
                  clock={clock}
                  control={control}
                  running={
                    clockTurn({ ...view, keys: [], auction: null })?.seat ===
                    seat
                  }
                />
              </span>
            ),
          }
        : {}),
    };
    return <SeatCard key={seat} {...props} />;
  };
  /** 이 자리(아래·왼쪽·위·오른쪽)에 앉은 사람 */
  const at = (spot: SeatSpot): number | null => {
    const k = spots.indexOf(spot);
    return k < 0 ? null : (me + k) % players;
  };
  const seatAt = (spot: SeatSpot) => {
    const seat = at(spot);
    return seat === null ? null : plate(seat);
  };
  // 좁은 화면은 판 위(맞은편 쪽)와 판 아래(나와 오른쪽 사람)로 나눈다
  const upperSpots: SeatSpot[] =
    players === 3 ? ["left", "right"] : ["left", "top"];
  const upper = upperSpots.map(at).filter((s): s is number => s !== null);
  const right = at("right");
  const lower = [me, ...(players === 4 && right !== null ? [right] : [])];

  const boardEl = (
    <GalaxyBoard
      view={view}
      timeline={timeline}
      elapsed={elapsed}
      selected={selected}
      onPick={onPick}
      onHover={setHover}
      name={name}
      follow={follow}
      marked={marked}
      focus={trading ? null : info}
      card={
        selected !== null && !trading ? (
          <SquareCard
            view={view}
            square={selected}
            name={name}
            onClose={() => setSelected(null)}
          />
        ) : null
      }
    />
  );

  const side = (
    <>
      <div className="relative">
        <RoundOutcome
          outcome={outcome}
          status={notice ?? status}
          summary={
            mine ? `${mine.rank}등 · 자산 ${money(mine.assets)}` : undefined
          }
        />
        <ResultBanner banner={banner} seq={view.roundNumber} />
      </div>
      {timedDecision && <DecisionTimer resetKey={decisionKey} />}
      {decisionPanel}
      {!decisionPanel && hover !== null && selected === null && !gameOver && (
        <SquareInfo
          view={view}
          square={hover}
          name={name}
          onClose={() => setSelected(null)}
        />
      )}
      {gameOver && (
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3">
          <Standings view={view} name={name} />
          <GameRecap view={view} history={history} name={name} />
          <MetStars view={view} history={history} firstMet={firstMet} />
        </div>
      )}
      <details
        open={mode === "wide" || undefined}
        className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2"
      >
        <summary className="cursor-pointer font-semibold text-sm">
          내 별자리 · 별 {myStars}개 · 자산 {money(myAssets)}
        </summary>
        <div className="mt-2">
          <MyConstellations view={view} />
        </div>
      </details>
      {log.length > 0 && (
        <details
          open={mode === "wide" || undefined}
          className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2"
        >
          <summary className="cursor-pointer font-semibold text-sm">
            기록
          </summary>
          <ul
            aria-label="기록"
            className="mt-1 flex flex-col gap-0.5 text-white/70 text-xs"
          >
            {log.map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 최근 기록 차례
              <li key={`${i}-${line}`} className="truncate">
                {line}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {!gameOver && (
          <ResignButton
            resetKey={decisionKey}
            onResign={() => submit({ type: "resign" })}
            className="rounded-xl border border-white/10 bg-black/35 px-4 py-2 text-sm"
          />
        )}
        {gameOver && !mission && (
          <>
            <button
              type="button"
              onClick={onExit}
              className="rounded-xl bg-amber-200 px-4 py-2 font-semibold text-slate-950"
            >
              다시 하기
            </button>
            <a
              href="/"
              className="rounded-xl border border-white/10 bg-black/35 px-4 py-2"
            >
              게임 목록
            </a>
          </>
        )}
      </div>
      {online && <ChatBox mySeat={me} />}
    </>
  );

  return (
    <main
      data-game="galaxy"
      data-table-mode={mode}
      className={cn(
        "relative isolate flex min-h-dvh flex-col items-center gap-2 overflow-x-clip px-3 py-2 text-white",
        GALAXY_BG,
        mission && "pt-16",
      )}
    >
      {mission && <MissionOverlay mission={mission} top={8} />}
      <header className="flex w-full items-center gap-2 text-sm">
        <button
          type="button"
          onClick={onExit}
          className="text-white/70 hover:text-white"
        >
          ← 은하 한 바퀴
        </button>
        <span className="ml-auto truncate text-white/60">
          {lengthName}
          {limit
            ? ` · ${Math.min(view.round, limit)}/${limit}차례`
            : ` · ${view.round}차례째`}
          {online ? "" : ` · 컴퓨터 ${levelName}`}
        </span>
      </header>

      {online && (reconnecting || hostLeft) && (
        <p
          role="alert"
          className="w-full max-w-xl rounded-xl bg-rose-700/80 px-3 py-2 text-center text-sm"
        >
          {hostLeft
            ? "방장이 방을 나갔어요."
            : "방장과 연결이 끊겼어요. 다시 잇는 중이에요."}
        </p>
      )}
      {waitingOffline && (
        <div
          role="alert"
          data-waiting-offline
          className="flex w-full max-w-xl flex-wrap items-center justify-center gap-2 rounded-xl bg-rose-800/80 px-3 py-2 text-center text-sm"
        >
          <span>연결이 끊긴 사람의 공개를 기다리고 있어요.</span>
          {hostRoom && (
            <button
              type="button"
              data-abandon
              onClick={() => hostRoom.abandon()}
              className="rounded-lg bg-white px-2 py-0.5 font-semibold text-black"
            >
              기다리지 않고 끝내기
            </button>
          )}
        </div>
      )}

      {mode === "wide" ? (
        <div className="galaxy-table-wide">
          <div className="flex justify-center [grid-area:top]">
            <div className="w-full max-w-72">{seatAt("top")}</div>
          </div>
          <div className="flex items-center [grid-area:left]">
            <div className="w-full">{seatAt("left")}</div>
          </div>
          <div className="min-w-0 [grid-area:board]">{boardEl}</div>
          <div className="flex items-center [grid-area:right]">
            <div className="w-full">{seatAt("right")}</div>
          </div>
          <div className="flex justify-center [grid-area:bottom]">
            <div className="w-full max-w-72">{seatAt("bottom")}</div>
          </div>
          <div className="galaxy-side flex min-w-0 flex-col gap-2 [grid-area:side]">
            {side}
          </div>
        </div>
      ) : mode === "short" ? (
        <div className="galaxy-table-short">
          <div className="flex min-w-0 flex-col justify-center gap-2">
            {upper.map(plate)}
          </div>
          <div className="min-w-0">{boardEl}</div>
          <div className="galaxy-side flex min-w-0 flex-col gap-2">
            {lower.map(plate)}
            {side}
          </div>
        </div>
      ) : (
        <div className="flex w-full max-w-xl flex-col gap-2">
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: `repeat(${upper.length}, minmax(0, 1fr))`,
            }}
          >
            {upper.map(plate)}
          </div>
          <div className="mx-auto w-full min-w-72 max-w-[min(36rem,calc(100dvh-16rem))]">
            {boardEl}
          </div>
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: `repeat(${lower.length}, minmax(0, 1fr))`,
            }}
          >
            {lower.map(plate)}
          </div>
          {side}
        </div>
      )}
    </main>
  );
}
