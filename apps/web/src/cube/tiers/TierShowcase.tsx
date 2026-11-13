"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

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
import { canDraw3d } from "./emblem3d/support";
import { type MyTier, nextTier, tierName } from "./rank";
import { cutText, TIER_TONE } from "./TierTable";
import { TIER_IDS, TIER_LABEL, TIER_TABLE, type TierId } from "./table";

/**
 * 티어 화면 진열(docs/47 14-7 「진열」, 2026-11-13 사용자 「티어 페이지에서 엠블럼을 눈에 띄게 해서 사람들이 모두 보면서
 * 가지고 싶은 마음이 들게」). 내 티어를 크게 3D로, 그 옆에 다음 티어와 줄일 시간, 아래에 열 티어 사다리.
 *
 * - 3D는 한 번에 많아야 둘: 내 티어 칸 하나와, 사다리에서 누르거나 마우스를 올린 칸 하나. 사다리의 나머지 칸은 그 칸
 *   3D를 좌우 각마다 미리 찍은 그림을 넘겨 도는 것처럼 보인다(3D 문맥을 여럿 띄우지 않는다).
 * - 사다리 칸은 한 번에 하나씩 아래 티어부터 차례로 흔든다(여러 개를 동시에 움직이지 않는다, 고정 규칙 3절). 동작
 *   줄이기 설정이면 멈춘다.
 * - 아직 얻지 못한 티어는 살짝 어둡게 둔다(잠긴 보상).
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

/** 잠긴(아직 못 얻은) 티어의 생김새 */
const LOCKED: CSSProperties = { filter: "brightness(0.5) saturate(0.55)" };

/** 내 티어 칸: 크게 3D, 이름·최고 Ao5·다음 티어 */
export function TierHero({ n, mine }: { n: number; mine: MyTier | null }) {
  const tier: TierId = mine?.place.tier ?? "iron";
  const next = mine ? nextTier(n, mine.ao5) : null;
  return (
    <section
      data-cube-tier-mine-box
      className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 px-4 py-4 sm:flex-row sm:gap-6"
    >
      <div className="flex shrink-0 flex-col items-center gap-1">
        <div
          data-cube-tier-hero={tier}
          {...(mine ? {} : { "data-cube-tier-locked": "" })}
          style={mine ? undefined : LOCKED}
        >
          <Emblem3D
            tier={tier}
            size={HERO_SIZE}
            sway
            label={`${TIER_LABEL[tier]} 엠블럼`}
          />
        </div>
        {mine?.place.division && (
          <DivisionPips tier={tier} division={mine.place.division} size={96} />
        )}
      </div>
      <div className="flex w-full flex-col gap-3 text-sm sm:w-auto sm:min-w-0 sm:flex-1">
        {mine ? (
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
  /** 흔드는 차례(아래 티어부터 0). 없으면 정면에 멈춘 한 장 */
  order?: number;
}) {
  return (
    <span
      data-cube-ladder-sprite={tier}
      {...(order !== undefined ? { "data-sweep": "" } : {})}
      aria-hidden
      className="block rounded-xl"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${spriteSrc(tier)})`,
        backgroundSize: `${SPRITE_FRAMES * 100}% 100%`,
        backgroundPosition: `${(SPRITE_FRONT / (SPRITE_FRAMES - 1)) * 100}% 0`,
        backgroundRepeat: "no-repeat",
        ...(order !== undefined
          ? { animationDelay: `${order * LADDER_SWEEP_MS}ms` }
          : {}),
      }}
    />
  );
}

/** 열 티어 사다리: 위 줄 보석 다섯, 아래 줄 금속 다섯(왼쪽 아래 아이언에서 오른쪽 위 챌린저로 오른다) */
export function TierLadder({ n, mine }: { n: number; mine: MyTier | null }) {
  const wide = useWide();
  const size = wide ? LADDER_SIZE : LADDER_SIZE_PHONE;
  const [open, setOpen] = useState<TierId | null>(null);
  const [can3d, setCan3d] = useState(false);
  useEffect(() => setCan3d(canDraw3d()), []);
  const hover = useRef(0);
  useEffect(() => () => window.clearTimeout(hover.current), []);
  const table = TIER_TABLE[n] ?? [];
  const myIndex = mine ? TIER_IDS.indexOf(mine.place.tier) : -1;
  const rows = [TIER_IDS.slice(5), TIER_IDS.slice(0, 5)];
  const pick = (t: TierId) => setOpen((o) => (o === t ? null : t));

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
            const locked = i > myIndex;
            const here = i === myIndex;
            const cut = table[i]?.cuts[0];
            const live = open === t && can3d;
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
                  {...(locked ? { "data-cube-ladder-locked": "" } : {})}
                  {...(here ? { "data-cube-ladder-mine": "" } : {})}
                  aria-pressed={open === t}
                  aria-label={TIER_LABEL[t]}
                  onClick={() => pick(t)}
                  onPointerEnter={(e) => {
                    if (e.pointerType !== "mouse") return;
                    window.clearTimeout(hover.current);
                    hover.current = window.setTimeout(() => setOpen(t), 250);
                  }}
                  onPointerLeave={() => window.clearTimeout(hover.current)}
                  className={cn(
                    "flex w-full flex-col items-center gap-1 rounded-xl p-0.5 pb-1 ring-1 sm:p-1.5",
                    here
                      ? "ring-amber-300/70"
                      : open === t
                        ? "ring-white/30"
                        : "ring-transparent hover:ring-white/15",
                  )}
                >
                  <span
                    className="block"
                    style={locked && !live ? LOCKED : undefined}
                  >
                    {live ? (
                      <Emblem3D
                        tier={t}
                        size={size}
                        sway
                        className="rounded-xl"
                        cover={<LadderSprite tier={t} size={size} />}
                      />
                    ) : (
                      // 사다리 칸 하나를 3D로 연 동안은 차례 흔들기를 멈춘다(여러 개를 동시에 움직이지 않는다)
                      <LadderSprite
                        tier={t}
                        size={size}
                        {...(open === null ? { order: i } : {})}
                      />
                    )}
                  </span>
                  <span
                    className={cn(
                      "block whitespace-nowrap text-center font-semibold text-[10px] leading-tight tracking-tighter sm:text-sm sm:tracking-normal",
                      locked ? "text-white/45" : TIER_TONE[t],
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
