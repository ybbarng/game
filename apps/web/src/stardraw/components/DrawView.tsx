"use client";

import { type Clock, realClock } from "@game/fair-play";
import type { RoundRecord, Ticket } from "@game/stardraw-core";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { play } from "@/game/sound";
import { cn } from "@/lib/cn";

import { winnersLine } from "../after-observe";
import { celebrationPlan } from "../celebrate";
import { EASE, FX } from "../fx-timing";
import { buzz } from "../haptics";
import { drawGlows } from "../hdr-glow";
import { drawOrder, myRank } from "../results";
import {
  planRoulette,
  type RouletteFrame,
  type RouletteTiming,
  rouletteAt,
} from "../roulette";
import { starOf } from "../sky";
import { useWakeLock } from "../wake-lock";
import { SkyCelebration, WinSeal } from "./Celebration";
import { LottoBall, RANK_LABEL } from "./parts";
import { SkyBoard } from "./SkyBoard";
import { MenuItem } from "./StardrawNav";

/** 틱 소리 사이 가장 짧은 간격(빨리 돌 때 소리가 뭉개지지 않게) */
const TICK_GAP_MS = 45;

/**
 * 추첨 연출(룰렛): 하늘의 빛을 모두 끄고, 불빛이 별 하나씩 켰다 끄며 돌다가 점점 느려져
 * 정확히 당첨 별에서 멈춘다(그 별은 켜진 채). 이미 뽑힌 별은 건너뛰고 6번 멈춘 뒤 7번째는 보너스(하늘빛).
 * 멈추는 차례는 실제 로또처럼 나온 차례다. 결과는 기록의 drand 값으로 이미 정해져 있고 연출은 보여 줄 뿐이다.
 * 칸 위치는 지난 시간으로 계산해(`rouletteAt`) 화면이 늦게 그려져도 늘 목표 별에서 멈춘다.
 * 이 기기의 첫 추첨은 끝까지 본다. 그 뒤로는 이미 결과가 나온 회차를 나중에 열 때 아래 「추첨 건너뛰기」로 바로 결과(canSkip, 실시간 추첨에는 없다, 2026-10-31 사용자). 이미 본 회차(바깥이 instant로 연다)와 움직임 줄이기 설정은 곧바로 마지막 모습이다.
 * HDR 화면이면 켜지는 별이 흰색보다 밝게 한 번 번쩍이고, 결과에서 맞은 내 별이 은은하게 빛난다(hdr-glow.ts).
 */
export function DrawView({
  record,
  ticket,
  onClose,
  clock = realClock,
  instant = false,
  label,
  onReplay,
  onNext,
  canSkip = false,
  onWatched,
  startedAt,
  timing,
  embedded = false,
  onHome,
}: {
  /**
   * 연출 중 아래에 작은 「추첨 건너뛰기」(누르면 바로 결과). 이 기기에서 추첨을 끝까지 한 번 본 뒤, 이미 결과가 나온
   * 회차를 나중에 열 때만(실시간으로 기다리다 시작한 추첨에는 두지 않는다, 2026-10-31 사용자)
   */
  canSkip?: boolean | undefined;
  /** 연출을 건너뛰지 않고 끝까지 본 순간 */
  onWatched?: (() => void) | undefined;
  /**
   * 실시간 추첨(회차 방): 연출이 시작된 시각(`clock` 기준 ms). 모든 화면이 "지금 − 시작"으로 같은 장면을 보인다(방송처럼).
   * 늦게 들어오면 이미 나온 별은 켜진 채 나머지부터. 없으면 지금부터 처음부터
   */
  startedAt?: number | undefined;
  /** 룰렛 빠르기(실시간은 LIVE_ROULETTE_TIMING) */
  timing?: RouletteTiming | undefined;
  /** 회차 방 안에 넣을 때: 위쪽 제목·돌아가기를 숨긴다(방이 따로 둔다) */
  embedded?: boolean | undefined;
  record: RoundRecord;
  ticket?: Ticket | undefined;
  /** 머리 줄 왼쪽 「← 돌아가기」(데모만. 별 따기 앱은 넘기지 않는다: 바로 전 화면은 뒤로 가기가 맡는다) */
  onClose?: (() => void) | undefined;
  clock?: Clock | undefined;
  /** 연출 없이 결과부터(데모 화면 둘러보기) */
  instant?: boolean | undefined;
  /** 보이는 회차 이름(`roundTitle`: 서버 장부는 "시험 n회"·"정식 n회", 연습 장부는 "제 n회") */
  label: string;
  /** 결과를 보인 뒤 「다시 보기」(연출을 처음부터). 없으면 단추가 없다 */
  onReplay?: (() => void) | undefined;
  /** 결과를 보인 뒤 다음 회차 응모로(지금 응모할 수 있을 때만 넘긴다) */
  onNext?: (() => void) | undefined;
  /** 머리 줄 왼쪽 「홈」(메뉴 줄이 없는 휴대폰에서 바깥이 넘긴다) */
  onHome?: (() => void) | undefined;
}) {
  const order = drawOrder(record);
  // 회차가 바뀔 때만 다시 계산한다(order는 record에서 정해진다)
  // biome-ignore lint/correctness/useExhaustiveDependencies: record.round로 충분하다
  const plan = useMemo(() => planRoulette(order, timing), [record.round]);
  const finished: RouletteFrame = {
    fixed: order,
    cursor: null,
    stop: order.length - 1,
    step: 0,
    done: true,
  };
  const [frame, setFrame] = useState<RouletteFrame>(() =>
    instant || order.length === 0 ? finished : rouletteAt(plan, 0),
  );
  /** 룰렛 연출을 실제로 보는 중인지(켜지는 별이 HDR로 번쩍인다). 움직임 줄이기면 false */
  const [animated, setAnimated] = useState(false);
  /** 건너뛰었는지(연출을 멈추고 바로 결과, 끝까지 본 것으로 치지 않는다) */
  const skipped = useRef(false);
  const done = frame.done;
  const rank = ticket ? myRank(record, ticket) : null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: 회차가 바뀔 때만 다시 돈다
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (instant || reduce || order.length === 0) {
      setAnimated(false);
      setFrame(finished);
      return;
    }
    setAnimated(true);
    const started = startedAt ?? clock.now();
    let raf = 0;
    let alive = true;
    let last = rouletteAt(plan, Math.max(0, clock.now() - started));
    setFrame(last);
    let lastTick = -Infinity;
    const tick = () => {
      if (!alive || skipped.current) return;
      const now = clock.now();
      const next = rouletteAt(plan, now - started);
      // 칸이 바뀌면 "틱", 멈춰 별이 켜지면 "딩"
      if (next.fixed.length > last.fixed.length) {
        // 켜진 별의 차례·별빛으로 음을 고른다(차례대로 화음이 쌓이고, 보너스는 따로)
        const index = next.fixed.length - 1;
        const n = next.fixed[index] as number;
        play("starBall", { star: { n, index, temp: starOf(n).k } });
      } else if (
        next.cursor !== null &&
        next.cursor !== last.cursor &&
        now - lastTick >= TICK_GAP_MS
      ) {
        play("starTick", { star: { n: next.cursor } });
        lastTick = now;
      }
      if (
        next.cursor !== last.cursor ||
        next.fixed.length !== last.fixed.length
      )
        setFrame(next);
      last = next;
      if (!next.done) raf = requestAnimationFrame(tick);
      else onWatched?.();
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [record.round, clock]);

  /**
   * 마무리(2026-11-03 사용자·지인 의견): 별이 다 뜨면 아래 공 줄을 작은 번호 순으로 다시 놓고(로또 발표처럼, 내 예측서와
   * 맞춰 보기 쉽게), 그 순서로 별을 하나씩 다시 빛낸다(보너스는 마지막). 관측하는 동안은 뜬 순서 그대로 채운다(긴장감).
   * 연출 없이 결과부터·움직임 줄이기·건너뛰기면 처음부터 작은 순으로 놓고 빛내기는 없다.
   * 당첨 축하(별자리·직인·소리)는 마무리가 끝난 뒤에 시작한다(동시에 움직이지 않기)
   */
  const [sorted, setSorted] = useState(false);
  /** 지금 다시 빛나는 공의 차례(작은 순 0~5, 보너스 6) */
  const [shine, setShine] = useState<number | null>(null);
  /** 그 공이 빛나기 시작한 시각(clock 기준). 하늘의 같은 별이 이 시각부터 같은 박자로 빛난다(docs/36 11-72) */
  const [shineAt, setShineAt] = useState(0);
  const [settled, setSettled] = useState(false);
  // 연출을 보는 동안 화면이 어두워지지 않게(2026-11-03 사용자). 마무리(정렬·다시 빛내기)까지
  useWakeLock(animated && !settled);
  const rowRef = useRef<HTMLDivElement>(null);
  /** 공을 옮기기 직전 자리(번호 → 왼쪽 x). 다시 놓은 뒤 그 차이만큼에서 미끄러져 온다 */
  const before = useRef<Map<number, number> | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 결과가 다 나온 순간에만 다시 돈다
  useEffect(() => {
    if (!done) {
      setSorted(false);
      setShine(null);
      setSettled(false);
      return;
    }
    if (!animated || skipped.current) {
      setSorted(true);
      setSettled(true);
      return;
    }
    const offs: (() => void)[] = [];
    const at = (ms: number, fn: () => void) => offs.push(clock.after(ms, fn));
    at(FX.sortWait, () => {
      const m = new Map<number, number>();
      for (const el of rowRef.current?.querySelectorAll<HTMLElement>(
        "[data-sort-ball]",
      ) ?? [])
        m.set(Number(el.dataset.sortBall), el.getBoundingClientRect().left);
      before.current = m;
      setSorted(true);
    });
    const seq = [...order.slice(0, 6)]
      .sort((a, b) => a - b)
      .concat(order.slice(6, 7));
    const first = FX.sortWait + FX.sortMove + FX.pause;
    seq.forEach((n, i) => {
      at(first + i * FX.sortShine, () => {
        setShine(i);
        setShineAt(clock.now());
        play("starTick", { star: { n } });
      });
    });
    at(first + seq.length * FX.sortShine + FX.pause, () => {
      setShine(null);
      setSettled(true);
    });
    return () => {
      for (const off of offs) off();
    };
  }, [done, animated, clock]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 공을 다시 놓은 직후(sorted가 바뀐 그 그림)에만 돈다
  useLayoutEffect(() => {
    const m = before.current;
    before.current = null;
    if (!m || !rowRef.current) return;
    for (const el of rowRef.current.querySelectorAll<HTMLElement>(
      "[data-sort-ball]",
    )) {
      const was = m.get(Number(el.dataset.sortBall));
      if (was === undefined) continue;
      const dx = was - el.getBoundingClientRect().left;
      if (Math.abs(dx) > 0.5)
        el.animate?.(
          [{ transform: `translateX(${dx}px)` }, { transform: "none" }],
          { duration: FX.sortMove, easing: EASE },
        );
    }
  }, [sorted]);

  useEffect(() => {
    if (settled && rank && order.length > 0 && !instant)
      play("starWin", { star: { rank } });
  }, [settled, rank, order.length, instant]);

  const drawn = frame.fixed.slice(0, 6);
  const main = sorted ? [...drawn].sort((a, b) => a - b) : drawn;
  const bonus = frame.fixed.length >= 7 ? (frame.fixed[6] ?? null) : null;
  /** 다시 빛나는 별(하늘에서도 그 별이 같은 박자로 빛난다) */
  const shining =
    shine === null ? null : shine < 6 ? (main[shine] ?? null) : bonus;
  const mine = ticket?.numbers ?? [];
  const winners = winnersLine(record);

  // 당첨 축하: 결과가 나오면 맞은 내 별(보너스 포함)로 나만의 별자리, 3등부터 별똥별, 1~3등은 당첨 직인
  // biome-ignore lint/correctness/useExhaustiveDependencies: 결과·응모권이 정해지면 바뀌지 않는다
  const party = useMemo(
    () =>
      settled && rank && ticket
        ? celebrationPlan(
            rank,
            ticket.numbers.filter(
              (n) =>
                order.slice(0, 6).includes(n) || (rank === 2 && order[6] === n),
            ),
          )
        : null,
    [settled, rank, ticket, record.round],
  );
  /** 움직임 줄이기면 별자리·직인이 바로 보인다(HDR 번쩍임도 없다) */
  const [reduce, setReduce] = useState<boolean | null>(null);
  useEffect(() => {
    setReduce(matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  // 안드로이드: 직인이 찍히는 순간 짧게 떨린다. 진동은 움직임 줄이기와 묶지 않아(docs/36 11-70), 움직임 줄이기면
  // 직인이 바로 보이는 때 떤다. 「진동」을 껐거나 지원하지 않는 기기는 haptics가 넘어간다
  useEffect(() => {
    if (!party || party.sealAt === null || reduce === null) return;
    return clock.after(reduce ? 0 : party.sealAt + 350, () => {
      buzz(party.rank === 1 ? "seal1" : "seal");
    });
  }, [party, reduce, clock]);

  return (
    <section className="flex flex-col gap-4" aria-label={`${label} 관측`}>
      <div
        className={cn(
          "grid grid-cols-[1fr_auto_1fr] items-center gap-2",
          embedded && "hidden",
        )}
      >
        {/* 왼쪽 칸: 메뉴가 없는 휴대폰은 「홈」 하나, PC는 위쪽 메뉴 줄이 있어 비운다. 「돌아가기」는 데모만 넘긴다 */}
        <div className="justify-self-start">
          {onHome ? (
            <div className="-ml-3">
              <MenuItem target="home" label="홈" onClick={onHome} />
            </div>
          ) : (
            onClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-white/70 hover:text-white"
              >
                ← 돌아가기
              </button>
            )
          )}
        </div>
        <div className="flex flex-col items-center leading-tight">
          <h2 className="font-bold text-lg tabular-nums">{label} 관측</h2>
          <span className="text-[11px] text-white/45">
            카노푸스 우주국 정시 관측
          </span>
        </div>
        {/* 제목은 가운데(양쪽 칸이 같은 너비), 오른쪽 칸은 빈자리 */}
        <div />
      </div>

      {record.void ? (
        <p className="rounded-xl bg-white/5 p-4 text-sm text-white/75">
          이 회차는 예측 목록을 제때 기록하지 못해 무효가 되었습니다. 입상자
          없이 끝났습니다.
        </p>
      ) : (
        <>
          <SkyBoard
            state={{
              mode: "draw",
              picked: mine,
              focus: null,
              lit: main,
              bonus,
              cursor: frame.cursor,
              glow: shining === null ? null : { n: shining, at: shineAt },
            }}
            clock={clock}
            hdr={drawGlows({
              fixed: frame.fixed,
              mine,
              done,
              animated,
              lights:
                party && !reduce
                  ? party.order.map((n, i) => ({
                      n,
                      at: party.starAt[i] ?? 0,
                    }))
                  : [],
            })}
            overlay={party && <SkyCelebration plan={party} bonus={bonus} />}
            // 룰렛이 도는 동안은 누르기를 막고, 결과가 다 나온 뒤에 별 설명을 볼 수 있다
            info={done}
            label={`관측 하늘: 켜진 별 ${main.map((n) => starOf(n).ko).join(", ")}`}
          />

          <div
            ref={rowRef}
            className="flex items-center justify-center gap-1.5 sm:gap-2"
            role="status"
            aria-label={`빛난 별 ${main.join(", ")}${bonus ? `, 보너스 ${bonus}` : ""}`}
            data-roulette-stop={frame.fixed.length}
          >
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const n = main[i];
              return n !== undefined ? (
                <span key={n} data-sort-ball={n} className="inline-flex">
                  <LottoBall
                    n={n}
                    ring={mine.includes(n)}
                    // 다시 놓으면 떨어짐을 지운다(옮겨 붙을 때 다시 떨어지지 않게)
                    className={cn(
                      !sorted && "sd-drop",
                      shine === i && "sd-ball-shine",
                    )}
                  />
                </span>
              ) : (
                <Slot key={`s${i}`} />
              );
            })}
            <span className="px-0.5 text-white/50">+</span>
            {bonus ? (
              <LottoBall
                n={bonus}
                ring={mine.includes(bonus)}
                className={cn(
                  !sorted && "sd-drop",
                  shine === 6 && "sd-ball-shine",
                )}
              />
            ) : (
              <Slot dashed />
            )}
          </div>

          <p className="-mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-white/65 text-xs">
            <span className="flex items-center gap-1.5">
              {/* 하늘에서 당첨 별은 그 별빛 색으로 번지며 빛줄기가 가로세로(＋), 보너스는 대각선(✕)으로 뻗는다 */}
              <span className="flex size-3 items-center justify-center font-bold text-[11px] text-white leading-none [text-shadow:0_0_4px_rgba(255,255,255,0.9)]">
                ＋
              </span>
              빛난 별
            </span>
            <span className="flex items-center gap-1.5">
              <span className="flex size-3 items-center justify-center font-bold text-[11px] text-white leading-none [text-shadow:0_0_4px_rgba(255,255,255,0.9)]">
                ✕
              </span>
              보너스
            </span>
            {mine.length > 0 && (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded-full border-2 border-sky-300" />
                  내 별
                </span>
                <span className="flex items-center gap-1.5">
                  {/* 하늘에서 맞은 별은 파란 고리 안의 별이 그 별빛 색으로 빛난다 */}
                  <span className="flex size-3 items-center justify-center rounded-full border-2 border-sky-300">
                    <span className="size-1 rounded-full bg-white shadow-[0_0_4px_2px_rgba(255,255,255,0.8)]" />
                  </span>
                  맞힌 별
                </span>
              </>
            )}
          </p>

          {done && (
            <div
              className={cn(
                "sd-rise relative flex flex-col items-center gap-1 rounded-2xl border p-4 text-center",
                rank
                  ? "border-amber-200/50 bg-amber-200/10"
                  : "border-white/10 bg-white/5",
                rank === 1 && "sd-glory",
              )}
              data-draw-result={rank ?? "none"}
            >
              {ticket ? (
                rank ? (
                  <>
                    <span className="font-black text-3xl text-amber-100">
                      {RANK_LABEL[rank]}
                    </span>
                    <span className="text-sm text-white/75">
                      맞힌 별 {mine.filter((n) => main.includes(n)).length}개
                      {rank === 2 ? " + 보너스" : ""}
                    </span>
                    {party?.sealAt != null && <WinSeal at={party.sealAt} />}
                  </>
                ) : (
                  <>
                    <span className="font-bold text-xl">
                      이번에는 등수에 들지 못했습니다.
                    </span>
                    <span className="text-sm text-white/65">
                      맞힌 별 {mine.filter((n) => main.includes(n)).length}개
                    </span>
                  </>
                )
              ) : (
                <span className="text-sm text-white/75">
                  이 회차에는 예측하지 않았습니다.
                </span>
              )}
              {/* 이 회차의 등수별 당첨 인원(예측하지 않은 사람도 볼거리가 있게, docs/36 11-44) */}
              {winners && (
                <span
                  data-draw-winners
                  className="mt-2 w-full border-white/10 border-t pt-2 text-white/60 text-xs tabular-nums"
                >
                  {winners}
                </span>
              )}
            </div>
          )}
          {canSkip && animated && !done && (
            <button
              type="button"
              onClick={() => {
                skipped.current = true;
                setFrame(finished);
              }}
              className="self-center rounded-lg px-3 py-1.5 text-sm text-white/55 hover:text-white"
            >
              관측 건너뛰기
            </button>
          )}
          {done && (onNext || onReplay) && (
            <div className="flex flex-col gap-2">
              {onNext && (
                <button
                  type="button"
                  onClick={onNext}
                  className="sd-cta rounded-2xl py-3 font-bold text-slate-950"
                >
                  다음 회차 예측
                </button>
              )}
              {onReplay && (
                <button
                  type="button"
                  onClick={onReplay}
                  className="rounded-2xl border border-white/20 py-2.5 font-semibold text-sm hover:bg-white/10"
                >
                  관측 다시 보기
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Slot({ dashed = false }: { dashed?: boolean }) {
  return (
    <span
      className={cn(
        "size-9 rounded-full border border-white/20",
        dashed && "border-dashed",
      )}
    />
  );
}
