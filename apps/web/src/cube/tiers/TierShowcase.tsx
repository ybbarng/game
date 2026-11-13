"use client";

import { type CSSProperties, useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { formatMs } from "../records";
import { Emblem3D } from "./Emblem3D";
import { DivisionPips, EmblemStill } from "./EmblemStill";
import {
  HERO_SIZE,
  LADDER_SIZE,
  LADDER_SIZE_PHONE,
  SPRITE_FRAMES,
  SPRITE_FRONT,
  spriteSrc,
} from "./emblem3d/poster";
import { ladderRing } from "./ladderRing";
import { type MyTier, nextTier, tierName } from "./rank";
import { cutText, TIER_TONE } from "./TierTable";
import {
  DIVISIONS,
  TIER_IDS,
  TIER_LABEL,
  TIER_TABLE,
  type TierId,
} from "./table";

/**
 * 티어 화면 진열(docs/47 14-7 「진열」, 2026-11-13 사용자 「티어 페이지에서 엠블럼을 눈에 띄게 해서 사람들이 모두 보면서
 * 가지고 싶은 마음이 들게」). 위쪽 큰 칸에 내 티어를 3D로 크게, 그 옆에 다음 티어와 줄일 시간, 아래에 열 티어 사다리.
 *
 * - 동작은 누르기 하나(2026-11-13 사용자 「마우스 올리는 거랑 클릭이랑 무슨 차이야, 좀 동작이 헷갈리네」): 사다리 칸을
 *   누르면(Enter·Space도) 그 티어가 위쪽 큰 칸에 크게 뜨고 이름·기준 시간이 함께 보인다. 같은 칸이나 내 티어 칸을
 *   다시 누르면 내 티어로 돌아온다. 마우스를 올리면 칸이 살짝 떠오르기만 한다.
 * - 3D는 늘 위쪽 큰 칸 하나. 사다리 칸은 그 3D를 좌우 각마다 미리 찍은 그림을 넘겨 도는 것처럼 보인다.
 * - 사다리 칸은 한 번에 하나씩 아래 티어부터 차례로 흔든다(여러 개를 동시에 움직이지 않는다, 고정 규칙 3절). 동작
 *   줄이기 설정이면 멈춘다.
 * - 사다리 열 칸은 모두 같은 중간 밝기, 위쪽 큰 칸에 보고 있는 칸만 제 밝기와 그 티어 색 테두리. 내 티어 칸은 구간 표의
 *   내 줄과 같은 밝은 배경 판(2026-11-14 사용자 「밑에 모두 적당한 중간 밝기 이렇게 해 주고, 선택하면 좀 더 밝게」). 얻었는지로 밝기를
 *   가르지 않는다. 기록이 없을 때 위쪽 큰 칸의 아이언만 어둡게 둔다(아직 얻지 못한 첫 티어).
 */

/** 사다리 칸 하나가 흔드는 시간(ms)과 한 바퀴(열 칸) */
export const LADDER_SWEEP_MS = 3000;
const LADDER_CYCLE_MS = LADDER_SWEEP_MS * TIER_IDS.length;

/** 화면이 넓은지(sm, 640px 이상) */
function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = matchMedia("(min-width: 640px)");
    } catch {
      return;
    }
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

/** 기록이 없을 때 위쪽 큰 칸의 아이언(아직 못 얻은 첫 티어) */
const LOCKED: CSSProperties = { filter: "brightness(0.5) saturate(0.55)" };

/**
 * 사다리 칸 그림 밝기: 열 칸 모두 같은 중간 밝기, 위쪽 큰 칸에 보고 있는 칸만 제 밝기(2026-11-14 사용자 「밑에 모두
 * 적당한 중간 밝기 이렇게 해 주고, 선택하면 좀 더 밝게」). 얻었는지로 밝기를 가르지 않는다
 */
const LADDER_REST: CSSProperties = {
  filter: "brightness(0.72) saturate(0.85)",
};

/**
 * 사다리 칸 표시 둘(2026-11-14 사용자 「여기 노란 테두리가 어디 있어?」·「티도 안 나는데..? 잘 모르겠으면 배경색 같은
 * 걸로 표시하거나」: 안쪽 2px 노란 선이 바깥 티어 색 빛에 묻혔다):
 * - 내 티어 칸: 아래 구간 표의 내 줄과 같은 밝은 배경 판(`MINE_BG`). 페이지 안에서 「내 자리 = 밝은 배경」.
 * - 보고 있는 칸: 제 밝기 + 그 티어 색 3px 테두리와 바깥 빛(`ladderRing.ts`).
 * 내 티어를 보고 있으면 배경 판과 테두리가 한 칸에, 다른 티어를 보면 서로 다른 칸에 보인다. 위쪽 큰 칸에 떠 있는 티어는
 * 언제나 보고 있는 칸으로 표시한다(기록이 없으면 처음엔 아이언). 배경 판은 기록이 있을 때만.
 */
export const MINE_BG = "bg-white/10";

/** 진열 전체: 위쪽 큰 칸과 사다리. 고른 티어를 둘이 함께 쓴다 */
export function TierShowcase({ n, mine }: { n: number; mine: MyTier | null }) {
  const [picked, setPicked] = useState<TierId | null>(null);
  const myTier = mine?.place.tier ?? null;
  const pick = (t: TierId) =>
    setPicked((p) => (p === t || t === myTier ? null : t));
  return (
    <>
      <TierHero n={n} mine={mine} picked={picked} />
      <TierLadder n={n} mine={mine} picked={picked} onPick={pick} />
    </>
  );
}

/** 위쪽 큰 칸: 내 티어(또는 사다리에서 고른 티어)를 크게 3D로, 이름과 시간 */
function TierHero({
  n,
  mine,
  picked,
}: {
  n: number;
  mine: MyTier | null;
  picked: TierId | null;
}) {
  const tier: TierId = picked ?? mine?.place.tier ?? "iron";
  const next = !picked && mine ? nextTier(n, mine.ao5) : null;
  const row = TIER_TABLE[n]?.find((r) => r.tier === tier);
  const myIndex = mine ? TIER_IDS.indexOf(mine.place.tier) : -1;
  // 고른 티어가 내 티어보다 위면 거기까지 줄일 시간
  const gap =
    picked && mine && row && TIER_IDS.indexOf(picked) > myIndex
      ? Math.max(0, mine.ao5 - Math.round((row.cuts[0] as number) * 1000))
      : null;
  return (
    <section
      data-cube-tier-mine-box
      data-cube-tier-view={picked ? "pick" : "mine"}
      className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 px-4 py-4 sm:flex-row sm:gap-6"
    >
      <div className="flex shrink-0 flex-col items-center gap-1">
        <div
          data-cube-tier-hero={tier}
          {...(!mine && !picked ? { "data-cube-tier-locked": "" } : {})}
          style={!mine && !picked ? LOCKED : undefined}
        >
          <Emblem3D
            tier={tier}
            size={HERO_SIZE}
            sway
            label={`${TIER_LABEL[tier]} 엠블럼`}
          />
        </div>
        {!picked && mine?.place.division && (
          <DivisionPips tier={tier} division={mine.place.division} size={96} />
        )}
      </div>
      <div className="flex w-full flex-col gap-3 text-sm sm:w-auto sm:min-w-0 sm:flex-1">
        {picked ? (
          <div className="text-center sm:text-left">
            <span
              data-cube-tier-picked={picked}
              className={cn("block font-bold text-2xl", TIER_TONE[picked])}
            >
              {TIER_LABEL[picked]}
            </span>
            {row && (
              <>
                <span className="block font-semibold tabular-nums">
                  {Number.isFinite(row.cuts[0] as number)
                    ? `Ao5 ${cutText(row.cuts[0] as number)} 이하`
                    : "다 맞춤"}
                </span>
                {row.cuts.length === 4 && (
                  <span className="block text-white/50 text-xs tabular-nums">
                    {row.cuts
                      .map((c, d) => `${DIVISIONS[d]} ${cutText(c)}`)
                      .join(" · ")}
                  </span>
                )}
              </>
            )}
          </div>
        ) : mine ? (
          <p className="text-center sm:text-left">
            <span
              data-cube-my-tier={mine.place.tier}
              className={cn("block font-bold text-2xl", TIER_TONE[tier])}
            >
              {tierName(mine.place)}
            </span>
            <span className="text-white/70">내 최고 Ao5 </span>
            <span className="font-mono font-semibold tabular-nums">
              {formatMs(mine.ao5)}
            </span>
          </p>
        ) : (
          <p className="text-center text-white/70 sm:text-left">
            이 크기는 아직 Ao5가 없습니다.{" "}
            <a href="/cube/solo" className="text-sky-300 hover:underline">
              혼자 맞추기
            </a>
            에서 5번 맞추면 생깁니다.
          </p>
        )}
        {next && (
          <div
            data-cube-next-tier={next.tier}
            className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2"
          >
            <EmblemStill tier={next.tier} size={48} />
            <p className="min-w-0">
              <span className="block">
                <span className={cn("font-semibold", TIER_TONE[next.tier])}>
                  {TIER_LABEL[next.tier]}
                </span>
                까지{" "}
                <span
                  data-cube-next-gap
                  className="font-mono font-semibold tabular-nums"
                >
                  {formatMs(next.gapMs)}초
                </span>
              </span>
              <span className="block text-white/50 text-xs">
                Ao5 {cutText(next.cutMs / 1000)} 이하
              </span>
            </p>
          </div>
        )}
        {picked && mine && (
          // 고른 티어를 보는 동안에도 내 기록을 함께: 내 티어(누르면 돌아온다)와 최고 Ao5, 위 티어면 거기까지 줄일 시간
          <div
            data-cube-picked-mine
            className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2"
          >
            <EmblemStill tier={mine.place.tier} size={48} />
            <p className="min-w-0">
              <span className="block">
                <span
                  className={cn("font-semibold", TIER_TONE[mine.place.tier])}
                >
                  {tierName(mine.place)}
                </span>{" "}
                <span className="font-mono font-semibold tabular-nums">
                  {formatMs(mine.ao5)}
                </span>
              </span>
              {gap !== null && (
                <span className="block text-white/50 text-xs">
                  {TIER_LABEL[tier]}까지{" "}
                  <span data-cube-picked-gap className="font-mono tabular-nums">
                    {formatMs(gap)}초
                  </span>
                </span>
              )}
            </p>
          </div>
        )}
        <p className="text-center text-white/50 text-xs sm:text-left">
          기록은 이 기기에만 저장됩니다.
        </p>
      </div>
    </section>
  );
}

/** 칸 그림을 넘기는 연출: 칸마다 한 바퀴(30초) 가운데 자기 차례 3초 동안 좌우로 한 번 흔든다 */
function sweepCss(): string {
  const at = (frame: number) =>
    `${((frame / (SPRITE_FRAMES - 1)) * 100).toFixed(3)}%`;
  const share = (LADDER_SWEEP_MS / LADDER_CYCLE_MS) * 100;
  const steps = 60;
  const lines: string[] = [];
  for (let k = 0; k <= steps; k++) {
    const u = k / steps;
    const f = Math.round(
      SPRITE_FRONT + SPRITE_FRONT * Math.sin(Math.PI * 2 * u),
    );
    lines.push(`${(u * share).toFixed(3)}%{background-position:${at(f)} 0}`);
  }
  lines.push(`100%{background-position:${at(SPRITE_FRONT)} 0}`);
  return `@keyframes cube-ladder-sweep{${lines.join("")}}
[data-cube-ladder-sprite][data-sweep]{animation:cube-ladder-sweep ${LADDER_CYCLE_MS}ms steps(1,end) infinite both}
@media (prefers-reduced-motion: reduce){[data-cube-ladder-sprite][data-sweep]{animation:none}}`;
}
const SWEEP_CSS = sweepCss();

/** 진열 칸 그림(미리 찍은 각도별 장을 이어 붙인 그림의 한 장) */
function LadderSprite({
  tier,
  size,
  order,
}: {
  tier: TierId;
  size: number;
  /** 흔드는 차례(아래 티어부터 0) */
  order: number;
}) {
  return (
    <span
      data-cube-ladder-sprite={tier}
      data-sweep=""
      aria-hidden
      className="block rounded-xl"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${spriteSrc(tier)})`,
        backgroundSize: `${SPRITE_FRAMES * 100}% 100%`,
        backgroundPosition: `${(SPRITE_FRONT / (SPRITE_FRAMES - 1)) * 100}% 0`,
        backgroundRepeat: "no-repeat",
        animationDelay: `${order * LADDER_SWEEP_MS}ms`,
      }}
    />
  );
}

/** 열 티어 사다리: 위 줄 보석 다섯, 아래 줄 금속 다섯(왼쪽 아래 아이언에서 오른쪽 위 챌린저로 오른다) */
function TierLadder({
  n,
  mine,
  picked,
  onPick,
}: {
  n: number;
  mine: MyTier | null;
  picked: TierId | null;
  onPick: (t: TierId) => void;
}) {
  const wide = useWide();
  const size = wide ? LADDER_SIZE : LADDER_SIZE_PHONE;
  const table = TIER_TABLE[n] ?? [];
  const myIndex = mine ? TIER_IDS.indexOf(mine.place.tier) : -1;
  const rows = [TIER_IDS.slice(5), TIER_IDS.slice(0, 5)];
  // 지금 위쪽 큰 칸에 뜬 티어
  const shown: TierId = picked ?? mine?.place.tier ?? "iron";

  return (
    <section
      data-cube-ladder-list
      aria-label="모든 티어"
      className="flex flex-col gap-3"
    >
      <style>{SWEEP_CSS}</style>
      {rows.map((row) => (
        <ol
          key={row[0]}
          className="grid grid-cols-5 items-end gap-1.5 sm:gap-3"
        >
          {row.map((t, j) => {
            const i = TIER_IDS.indexOf(t);
            const here = i === myIndex;
            const cut = table[i]?.cuts[0];
            // 지금 위쪽 큰 칸에 뜬 칸만 제 밝기와 그 티어 색 테두리
            const viewing = shown === t;
            return (
              <li
                key={t}
                className="flex justify-center"
                // 넓은 화면: 한 줄 안에서도 오른쪽으로 갈수록 한 칸씩 높게(계단)
                style={wide ? { marginBottom: j * 10 } : undefined}
              >
                <button
                  type="button"
                  data-cube-ladder={t}
                  {...(here ? { "data-cube-ladder-mine": "" } : {})}
                  {...(viewing ? { "data-cube-ladder-shown": "" } : {})}
                  aria-pressed={viewing}
                  aria-label={TIER_LABEL[t]}
                  onClick={() => onPick(t)}
                  className={cn(
                    // 마우스를 올리면 살짝 떠오르기만 한다(3D로 바꾸지 않는다)
                    "flex w-full flex-col items-center gap-1 rounded-xl p-0.5 pb-1 transition duration-150 hover:-translate-y-0.5 hover:shadow-black/50 hover:shadow-lg hover:brightness-110 sm:p-1.5",
                    // 내 칸은 마우스를 올려도 같은 배경 판(떠오르기 배경이 덮지 않게)
                    here ? MINE_BG : "hover:bg-white/5",
                  )}
                  style={{ boxShadow: ladderRing(t, viewing) }}
                >
                  <span
                    data-cube-ladder-art
                    className="block transition-[filter] duration-200"
                    style={viewing ? undefined : LADDER_REST}
                  >
                    <LadderSprite tier={t} size={size} order={i} />
                  </span>
                  <span
                    className={cn(
                      "block whitespace-nowrap text-center font-semibold text-[10px] leading-tight tracking-tighter sm:text-sm sm:tracking-normal",
                      TIER_TONE[t],
                    )}
                  >
                    {TIER_LABEL[t]}
                  </span>
                  <span className="block text-[10px] text-white/45 tabular-nums sm:text-xs">
                    {cut === undefined
                      ? ""
                      : Number.isFinite(cut)
                        ? `${cutText(cut)} 이하`
                        : cutText(cut)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ))}
    </section>
  );
}
