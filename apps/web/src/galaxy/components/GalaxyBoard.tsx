"use client";

import {
  BANK,
  cardById,
  type GalaxyView,
  sideOf,
  starAt,
} from "@game/galaxy-engine";
import { type CSSProperties, useMemo } from "react";
import { cn } from "@/lib/cn";

import { cardNoMatch } from "../events";
import { money, SEASON_NAMES, shipOf, squareName } from "../format";
import {
  activeStep,
  hiddenOwners,
  shipPositions,
  type TimedStep,
  type Timeline,
} from "../fx";
import { GALAXY_FX } from "../fx-timing";
import { cellOf, SKY_SIZE, skyArt, squareCenter } from "../sky-art";
import { groupColor, magScale, starRgb } from "../star-color";
import { prefersReducedMotion } from "../store";
import { DiceFace, NoticePaper, ShipToken } from "./parts";

const pct = (n: number) => `${(n / 9) * 100}%`;

/** 우주선 자리 안 어긋남(칸 하나 = 1). 넷이 한 칸에 모여도 겹치지 않는다 */
const SHIP_OFFSET: [number, number][] = [
  [-0.2, -0.17],
  [0.2, -0.17],
  [-0.2, 0.19],
  [0.2, 0.19],
];

/** 하늘에 깔린 잔별(늘 같은 자리) */
const FIELD = Array.from({ length: 70 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.6789;
  return {
    x: (a - Math.floor(a)) * SKY_SIZE,
    y: (b - Math.floor(b)) * SKY_SIZE,
    r: 0.6 + ((i * 7) % 5) * 0.25,
    o: 0.12 + ((i * 3) % 7) * 0.04,
    d: (i % 9) * 0.7,
  };
});

/** 모퉁이 그림(칸 안 작은 그림) */
/** 판 위 알림 상자가 그 단계 동안 떠 있게(`galaxy-toast` 애니메이션 길이) */
function toastStyle(dur: number): CSSProperties {
  return { "--galaxy-toast-ms": `${dur}ms` } as CSSProperties;
}

function CornerArt({ kind }: { kind: string }) {
  const common = "size-[62%] opacity-90";
  if (kind === "base")
    return (
      <svg viewBox="0 0 40 40" className={common} aria-hidden="true">
        <circle
          cx="20"
          cy="20"
          r="15"
          fill="none"
          stroke="#fcd34d"
          strokeWidth="2"
        />
        {/* 우주국: 둥근 테 안의 네 갈래 별(카노푸스) */}
        <path
          d="M20 8 L22.6 17.4 L32 20 L22.6 22.6 L20 32 L17.4 22.6 L8 20 L17.4 17.4 Z"
          fill="#fff7d6"
        />
        <circle cx="20" cy="20" r="2.4" fill="#fcd34d" />
      </svg>
    );
  if (kind === "asteroid")
    return (
      <svg viewBox="0 0 40 40" className={common} aria-hidden="true">
        <path d="M6 22 L11 15 L18 16 L21 23 L15 28 L8 27 Z" fill="#78716c" />
        <path d="M22 12 L27 9 L32 12 L31 18 L25 19 Z" fill="#a8a29e" />
        <path d="M24 26 L29 24 L33 28 L30 33 L25 32 Z" fill="#57534e" />
        <circle cx="16" cy="9" r="1.6" fill="#a8a29e" />
      </svg>
    );
  if (kind === "observatory")
    return (
      <svg viewBox="0 0 40 40" className={common} aria-hidden="true">
        <path d="M8 32 H32 V26 Q20 12 8 26 Z" fill="#cbd5e1" />
        <rect
          x="18"
          y="13"
          width="5"
          height="12"
          fill="#1e293b"
          transform="rotate(30 20 20)"
        />
        <circle cx="31" cy="8" r="1.6" fill="#fff" />
        <circle cx="25" cy="5" r="1" fill="#fff" />
      </svg>
    );
  if (kind === "comet")
    return (
      <svg viewBox="0 0 40 40" className={common} aria-hidden="true">
        <defs>
          <linearGradient id="galaxy-comet" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#7dd3fc" stopOpacity="0" />
            <stop offset="1" stopColor="#e0f2fe" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <path d="M5 35 L28 10 L33 14 Z" fill="url(#galaxy-comet)" />
        <circle cx="30" cy="11" r="4" fill="#f0f9ff" />
      </svg>
    );
  // 우주국 공문: 접힌 종이와 붉은 인장
  return (
    <svg viewBox="0 0 40 40" className={common} aria-hidden="true">
      <path d="M9 9 H31 V31 H9 Z" fill="#f6efe0" />
      <path
        d="M13 15 H27 M13 19 H27 M13 23 H22"
        stroke="#a8a29e"
        strokeWidth="1.6"
      />
      <rect x="22" y="23" width="7" height="7" rx="1" fill="#cf3b26" />
    </svg>
  );
}

export interface BoardProps {
  view: GalaxyView;
  timeline: Timeline;
  elapsed: number;
  /** 고른(누른) 칸 */
  selected: number | null;
  onPick?: (square: number) => void;
  onHover?: (square: number | null) => void;
  /** 자리 이름 */
  name: (seat: number) => string;
  /** 휴대폰 세로: 우주선이 움직이는 동안 그 변을 크게 따라간다 */
  follow?: boolean;
  /** 거래 고르기 중 담은 별 */
  marked?: ReadonlySet<number>;
}

/** 9 × 9 네모 고리 판과 가운데 하늘(docs/48 7-1) */
export function GalaxyBoard({
  view,
  timeline,
  elapsed,
  selected,
  onPick,
  onHover,
  name,
  follow = false,
  marked,
}: BoardProps) {
  const board = view.board;
  const art = useMemo(() => skyArt(board), [board]);
  const step = activeStep(timeline, elapsed);
  const playing = elapsed < timeline.total;
  const ships = shipPositions(timeline, view.positions, elapsed);
  const hidden = hiddenOwners(timeline, elapsed);
  const owner = (sq: number) => (hidden.has(sq) ? -1 : (view.owners[sq] ?? -1));
  // 유성우의 밤에는 제철 1.5배 대신 모든 별이 2배라 제철 빛남을 끄고 판 전체에 유성을 흘린다
  const season = view.meteor ? null : view.season;
  // 움직임 줄이기면 우주선도 미끄러지지 않고 바로 그 칸에 선다.
  const reduced = prefersReducedMotion();

  // 별자리마다 누가 몇 개를 가졌나(보이는 주인 기준)
  const groupOwners = board.groups.map((g) => {
    const counts = new Map<number, number[]>();
    for (const sq of g.squares) {
      const o = owner(sq);
      if (o >= 0) counts.set(o, [...(counts.get(o) ?? []), sq]);
    }
    return counts;
  });

  // 따라가는 시점: 움직이는 우주선이 있는 변을 1.6배로
  const movingSeat = ships.findIndex((s) => s.moving);
  let camera: CSSProperties | undefined;
  if (follow && movingSeat >= 0) {
    const sq = ships[movingSeat]?.square ?? 0;
    const c = squareCenter(sq);
    const fx = Math.min(1, Math.max(0, (c.x - 0.5) / 8));
    const fy = Math.min(1, Math.max(0, (c.y - 0.5) / 8));
    camera = {
      transform: `scale(${GALAXY_FX.followScale})`,
      transformOrigin: `${fx * 100}% ${fy * 100}%`,
    };
  }

  const linkStep = step?.kind === "link" ? step : null;
  const cardSquares = new Set(step?.kind === "card" ? step.squares : []);
  const pulseSquare =
    step?.kind === "buy" || step?.kind === "build"
      ? step.square
      : step?.kind === "auction"
        ? step.result.square
        : null;

  return (
    <div
      data-galaxy-board
      data-moving={playing || undefined}
      className="@container relative aspect-square w-full select-none overflow-hidden rounded-2xl"
    >
      <div
        className="absolute inset-0 transition-transform"
        style={{
          ...camera,
          transitionDuration: `${GALAXY_FX.followZoom}ms`,
          transitionDelay: camera ? "0ms" : `${GALAXY_FX.followRest}ms`,
        }}
      >
        {/* 유리 판 */}
        <div className="absolute inset-0 rounded-2xl border border-sky-200/10 bg-[radial-gradient(ellipse_at_50%_40%,#132044_0%,#0a1230_55%,#070b1f_100%)] shadow-[inset_0_0_60px_rgba(56,189,248,0.08)]" />
        {view.meteor && <MeteorShower />}

        {/* 가운데 하늘 */}
        <svg
          viewBox={`0 0 ${SKY_SIZE} ${SKY_SIZE}`}
          className="absolute"
          style={{ left: pct(1), top: pct(1), width: pct(7), height: pct(7) }}
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="galaxy-glow">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
              <stop offset="30%" stopColor="#fff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
          </defs>
          {FIELD.map((f) => (
            <circle
              key={`${f.x}-${f.y}`}
              cx={f.x}
              cy={f.y}
              r={f.r}
              fill="#e0e7ff"
              opacity={f.o}
              className="galaxy-twinkle"
              style={{ animationDelay: `${f.d}s` }}
            />
          ))}
          {art.map((g) => {
            const group = board.groups[g.group];
            if (!group) return null;
            const inSeason =
              season !== null && sideOf(group.squares[0] ?? 0) === season;
            const owners = groupOwners[g.group] as Map<number, number[]>;
            const completeBy = [...owners.entries()].find(
              ([, sqs]) => sqs.length >= group.squares.length,
            )?.[0];
            const animating = linkStep?.group === g.group;
            const t = animating
              ? Math.max(0, elapsed - (linkStep?.at ?? 0))
              : Number.POSITIVE_INFINITY;
            const segMs = GALAXY_FX.completeSegment;
            return (
              <g key={group.id} data-sky-group={group.id}>
                {/* 실제 별자리 선(흐리게) */}
                {g.segments.map(([a, b], i) => (
                  <line
                    // biome-ignore lint/suspicious/noArrayIndexKey: 선 토막 차례는 바뀌지 않는다
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="#c7d2fe"
                    strokeOpacity={inSeason ? 0.3 : 0.14}
                    strokeWidth={1.4}
                  />
                ))}
                {/* 완성한 별자리: 주인 색으로 차례로 이어진다 */}
                {completeBy !== undefined &&
                  g.segments.map(([a, b], i) => {
                    const local = t - i * segMs;
                    if (local < 0) return null;
                    const k = Math.min(1, local / segMs);
                    return (
                      <line
                        // biome-ignore lint/suspicious/noArrayIndexKey: 선 토막 차례는 바뀌지 않는다
                        key={`c${i}`}
                        data-complete-line={group.id}
                        x1={a.x}
                        y1={a.y}
                        x2={a.x + (b.x - a.x) * k}
                        y2={a.y + (b.y - a.y) * k}
                        stroke={shipOf(completeBy).color}
                        strokeOpacity={0.85}
                        strokeWidth={2.6}
                        strokeLinecap="round"
                      />
                    );
                  })}
                {/* 둘을 가졌으면 그 둘 사이 선 하나 */}
                {[...owners.entries()].map(([seat, sqs]) => {
                  if (sqs.length < 2 || sqs.length >= group.squares.length)
                    return null;
                  const p = g.stars.get(sqs[0] as number);
                  const q = g.stars.get(sqs[1] as number);
                  if (!p || !q) return null;
                  const k = animating ? Math.min(1, t / GALAXY_FX.link) : 1;
                  return (
                    <line
                      key={`p${seat}`}
                      data-pair-line={group.id}
                      x1={p.x}
                      y1={p.y}
                      x2={p.x + (q.x - p.x) * k}
                      y2={p.y + (q.y - p.y) * k}
                      stroke={shipOf(seat).color}
                      strokeOpacity={0.8}
                      strokeWidth={2.2}
                      strokeDasharray="6 5"
                      strokeLinecap="round"
                    />
                  );
                })}
                {g.extra.map((e) => (
                  <circle
                    key={`${e.x}-${e.y}`}
                    cx={e.x}
                    cy={e.y}
                    r={Math.max(1.2, 3 - e.mag * 0.5)}
                    fill="#e2e8f0"
                    opacity={0.35}
                  />
                ))}
                {[...g.stars.entries()].map(([sq, p]) => {
                  const star = starAt(board, sq)?.star;
                  if (!star) return null;
                  const o = owner(sq);
                  const r = 9 * magScale(star.mag);
                  return (
                    <g key={sq}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={r * (o >= 0 ? 3.6 : 2.6)}
                        fill="url(#galaxy-glow)"
                        opacity={o >= 0 ? 0.9 : 0.45}
                        style={{
                          color: starRgb(star.k),
                        }}
                      />
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={r * 0.55}
                        fill={starRgb(star.k)}
                        opacity={o >= 0 ? 1 : 0.6}
                      />
                      {o >= 0 && (
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={r * 1.5}
                          fill="none"
                          stroke={shipOf(o).color}
                          strokeWidth={2}
                          opacity={0.9}
                        />
                      )}
                    </g>
                  );
                })}
                <text
                  x={g.label.x}
                  y={g.label.y}
                  textAnchor="middle"
                  className="@max-[30rem]:hidden"
                  fill={inSeason ? "#fde68a" : "#c7d2fe"}
                  fillOpacity={inSeason ? 0.85 : 0.5}
                  fontSize={20}
                  fontWeight={600}
                >
                  {group.ko}
                </text>
                {/* 완성 연출: 다 이은 뒤 이름이 떠오른다 */}
                {animating && linkStep && linkStep.owned >= linkStep.size && (
                  <text
                    data-complete-name={group.id}
                    x={g.center.x}
                    y={g.center.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="galaxy-name-rise"
                    style={
                      {
                        animationDelay: `${segMs * Math.max(3, g.segments.length)}ms`,
                      } as CSSProperties
                    }
                    fill="#fff7d6"
                    fontSize={34}
                    fontWeight={900}
                    stroke="#0b1020"
                    strokeWidth={6}
                    paintOrder="stroke"
                  >
                    {group.ko}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* 칸 32개 */}
        {board.squares.map((sq) => {
          const { col, row } = cellOf(sq.index);
          const star = sq.star;
          const o = owner(sq.index);
          const level = view.levels[sq.index] ?? 0;
          const inSeason =
            season !== null && sq.side !== null && sq.side === season;
          const ownerColor = o >= 0 ? shipOf(o).color : null;
          const label = star
            ? `${star.star.ko}, ${board.groups[star.group]?.ko ?? ""}, ${money(star.value)}${o >= 0 ? `, ${name(o)}의 별` : ""}`
            : squareName(board, sq.index);
          return (
            <button
              key={sq.index}
              type="button"
              data-square={sq.index}
              data-owner={o >= 0 ? o : undefined}
              data-selected={selected === sq.index || undefined}
              aria-label={label}
              onClick={() => onPick?.(sq.index)}
              onPointerEnter={(e) =>
                e.pointerType === "mouse" && onHover?.(sq.index)
              }
              onPointerLeave={(e) =>
                e.pointerType === "mouse" && onHover?.(null)
              }
              className={cn(
                "absolute flex flex-col items-center justify-center overflow-hidden rounded-[10%] border bg-slate-900/55 p-0 outline-none transition-[box-shadow,border-color]",
                "focus-visible:ring-2 focus-visible:ring-white",
                ownerColor ? "border-2" : "border-white/10",
                inSeason && "galaxy-season",
                selected === sq.index && "ring-2 ring-white/80",
                marked?.has(sq.index) && "ring-2 ring-amber-200",
                pulseSquare === sq.index && "galaxy-pulse",
                cardSquares.has(sq.index) && "galaxy-sparkle",
                view.mortgaged[sq.index] && "opacity-55",
              )}
              style={{
                left: `calc(${pct(col)} + 1px)`,
                top: `calc(${pct(row)} + 1px)`,
                width: `calc(${pct(1)} - 2px)`,
                height: `calc(${pct(1)} - 2px)`,
                ...(ownerColor
                  ? {
                      borderColor: ownerColor,
                      boxShadow: `0 0 10px ${ownerColor}55, inset 0 0 8px ${ownerColor}33`,
                    }
                  : {}),
              }}
            >
              {star ? (
                <>
                  <span
                    className="absolute inset-x-0 top-0 h-[13%]"
                    style={{
                      background: groupColor(board, star.group),
                      opacity: 0.85,
                    }}
                  />
                  <span
                    aria-hidden="true"
                    className="block rounded-full"
                    style={{
                      width: `${34 * magScale(star.star.mag)}%`,
                      height: `${34 * magScale(star.star.mag)}%`,
                      background: `radial-gradient(circle, #fff 0%, ${starRgb(star.star.k)} 32%, ${starRgb(star.star.k, 0.25)} 60%, transparent 72%)`,
                    }}
                  />
                  <span className="@max-[30rem]:hidden mt-[2%] max-w-full truncate px-0.5 text-[clamp(7px,1.45cqw,11px)] text-white/80 leading-none">
                    {star.star.ko}
                  </span>
                  {level > 0 && o >= 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-[7%] flex gap-[6%]"
                      data-level={level}
                    >
                      {level >= 4 ? (
                        <span
                          className="block size-[0.42rem] rounded-full border-2"
                          style={{ borderColor: ownerColor ?? "#fff" }}
                        />
                      ) : (
                        Array.from({ length: level }, (_, i) => (
                          <span
                            // biome-ignore lint/suspicious/noArrayIndexKey: 단 점은 차례만 있다
                            key={i}
                            className="block size-[0.22rem] rounded-full"
                            style={{ background: ownerColor ?? "#fff" }}
                          />
                        ))
                      )}
                    </span>
                  )}
                  {view.mortgaged[sq.index] && (
                    <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-[clamp(6px,1.2cqw,9px)] text-white/80">
                      맡김
                    </span>
                  )}
                </>
              ) : (
                <>
                  <CornerArt kind={sq.kind} />
                  <span className="@max-[30rem]:hidden max-w-full truncate px-0.5 text-[clamp(7px,1.3cqw,10px)] text-white/70 leading-none">
                    {sq.kind === "base"
                      ? "우주국"
                      : sq.kind === "notice"
                        ? "공문"
                        : squareName(board, sq.index)}
                  </span>
                </>
              )}
            </button>
          );
        })}

        {/* 우주선 */}
        {ships.map((s, seat) => {
          if (view.out[seat]) return null;
          const c = squareCenter(s.square);
          const [dx, dy] = SHIP_OFFSET[seat] ?? [0, 0];
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: 자리 번호가 열쇠다
              key={seat}
              data-ship={seat}
              data-ship-square={s.square}
              className={cn(
                "pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2",
                !reduced && "transition-[left,top] ease-out",
              )}
              style={{
                left: pct(c.x + dx),
                top: pct(c.y + dy),
                width: pct(0.36),
                height: pct(0.36),
                transitionDuration: s.moving ? "110ms" : "260ms",
              }}
            >
              <ShipToken seat={seat} size={64} className="size-full" />
              {view.jailed[seat] && (
                <span className="absolute -top-1 -right-1 text-[8px]">⛓</span>
              )}
            </span>
          );
        })}

        {/* 가운데: 계절과 주사위 */}
        <CenterHub view={view} step={step} elapsed={elapsed} />

        {/* 연출 덧칠: 공문·입찰·별빛 흐름 */}
        {step && (
          <FxOverlay
            step={step}
            elapsed={elapsed}
            view={view}
            name={name}
            ships={ships.map((s) => s.square)}
          />
        )}
      </div>
    </div>
  );
}

/** 가운데 칸: 지금 계절과 주사위 둘 */
function CenterHub({
  view,
  step,
  elapsed,
}: {
  view: GalaxyView;
  step: TimedStep | null;
  elapsed: number;
}) {
  const rolling =
    step?.kind === "dice" && elapsed - step.at < step.dur * 0.7 ? step : null;
  const dice: [number, number] | null =
    step?.kind === "dice" ? step.dice : (view.lastRoll?.dice ?? null);
  const shown: [number, number] | null = rolling
    ? [
        1 + (Math.floor((elapsed - rolling.at) / 70) % 6),
        1 + (Math.floor((elapsed - rolling.at) / 70 + 3) % 6),
      ]
    : dice;
  return (
    <div
      className="pointer-events-none absolute flex flex-col items-center justify-center gap-[6%]"
      style={{
        left: pct(3.4),
        top: pct(3.4),
        width: pct(2.2),
        height: pct(2.2),
      }}
    >
      {view.meteor ? (
        <span className="rounded-full bg-sky-200/10 px-2 py-0.5 text-[clamp(8px,2.2cqw,14px)] text-sky-100/90 tracking-wider">
          유성우의 밤
        </span>
      ) : (
        view.season !== null && (
          <span className="rounded-full bg-amber-200/10 px-2 py-0.5 text-[clamp(8px,2.2cqw,14px)] text-amber-100/90 tracking-wider">
            {SEASON_NAMES[view.season]} 하늘
          </span>
        )
      )}
      <span className="text-[clamp(7px,1.6cqw,11px)] text-white/45">
        {view.round}돌림
      </span>
      {shown && (
        <span
          className={cn("flex gap-[10%]", rolling && "galaxy-dice-shake")}
          data-dice={rolling ? undefined : `${shown[0]},${shown[1]}`}
        >
          <DiceFace
            value={shown[0]}
            className={cn(
              "size-[clamp(18px,7cqw,46px)] drop-shadow-lg",
              !step && "opacity-70",
            )}
          />
          <DiceFace
            value={shown[1]}
            className={cn(
              "size-[clamp(18px,7cqw,46px)] drop-shadow-lg",
              !step && "opacity-70",
            )}
          />
        </span>
      )}
    </div>
  );
}

/** 유성우의 밤에 판 위로 천천히 흐르는 유성(시작 자리·늦춤은 고정, 움직임 줄이기면 흐르지 않고 판만 푸르게) */
const METEORS = [
  { left: 18, top: -6, delay: 0 },
  { left: 52, top: -10, delay: 1.7 },
  { left: 80, top: 4, delay: 3.1 },
  { left: 34, top: 22, delay: 4.6 },
  { left: 66, top: 30, delay: 6.2 },
  { left: 94, top: 18, delay: 7.4 },
] as const;

function MeteorShower() {
  return (
    <div
      data-meteor-shower
      aria-hidden="true"
      className="galaxy-meteor-sky pointer-events-none absolute inset-0 z-[1] overflow-hidden rounded-2xl"
    >
      {METEORS.map((m) => (
        <span
          key={`${m.left}-${m.top}`}
          className="galaxy-meteor"
          style={{
            left: `${m.left}%`,
            top: `${m.top}%`,
            animationDelay: `${m.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/** 연출 하나를 판 위에 덧그린다 */
function FxOverlay({
  step,
  elapsed,
  view,
  name,
  ships,
}: {
  step: TimedStep;
  elapsed: number;
  view: GalaxyView;
  name: (seat: number) => string;
  ships: number[];
}) {
  const board = view.board;
  const box =
    "pointer-events-none absolute inset-[11%] z-20 flex justify-center";
  switch (step.kind) {
    case "card": {
      const card = cardById(step.card);
      const none = cardNoMatch(step.card, step.squares);
      return (
        <div className={cn(box, "items-start pt-[4%]")}>
          <NoticePaper
            heading="카노푸스 우주국 공문"
            title={card.title}
            dur={step.dur}
          >
            <p>{card.text}</p>
            {none && (
              <p data-card-none className="mt-1 font-bold text-slate-700">
                {none}
              </p>
            )}
            <p className="mt-1 text-[11px] text-slate-600">
              받는 분: {name(step.seat)}
            </p>
          </NoticePaper>
        </div>
      );
    }
    case "season":
      return (
        <div className={cn(box, "items-start pt-[4%]")}>
          <NoticePaper
            heading="카노푸스 우주국 공문"
            title={`${SEASON_NAMES[step.season]} 하늘이 떠오릅니다`}
            dur={step.dur}
          >
            <p>
              이제 {SEASON_NAMES[step.season]} 별자리 별의 정거장 이용료가
              1.5배입니다.
            </p>
          </NoticePaper>
        </div>
      );
    case "meteor":
      return (
        <div className={cn(box, "items-start pt-[4%]")}>
          <NoticePaper
            heading="카노푸스 우주국 공문"
            title="유성우의 밤이 찾아옵니다"
            dur={step.dur}
          >
            <p>판이 끝날 때까지 모든 별의 정거장 이용료가 2배입니다.</p>
          </NoticePaper>
        </div>
      );
    case "bankrupt":
      return (
        <div className={cn(box, "items-start pt-[4%]")}>
          <NoticePaper
            heading="카노푸스 우주국 공문"
            title="운항 중단"
            dur={step.dur}
          >
            <p>{name(step.seat)} 우주선이 별빛이 모자라 운항을 멈춥니다.</p>
          </NoticePaper>
        </div>
      );
    case "jail":
      return (
        <div className={cn(box, "items-center")}>
          <p
            className="galaxy-toast rounded-xl bg-stone-800/90 px-3 py-2 text-center font-semibold text-sm text-stone-100 shadow-xl"
            style={toastStyle(step.dur)}
          >
            {name(step.seat)} · 소행성대에 걸렸어요.
          </p>
        </div>
      );
    case "trade":
      return (
        <div className={cn(box, "items-center")}>
          <p
            className="galaxy-toast rounded-xl bg-slate-800/90 px-3 py-2 text-center font-semibold text-sm shadow-xl"
            style={toastStyle(step.dur)}
          >
            {step.accepted
              ? `${name(step.from)} ↔ ${name(step.to)} 거래가 이뤄졌어요.`
              : `${name(step.to)} · 거래를 거절했어요.`}
          </p>
        </div>
      );
    case "auction": {
      const r = step.result;
      const opened = elapsed - step.at > step.dur * GALAXY_FX.auctionOpen;
      return (
        <div className={cn(box, "items-center")}>
          <div
            data-auction-reveal
            className="galaxy-toast flex w-[86%] max-w-80 flex-col gap-2 rounded-2xl border border-white/10 bg-slate-950/90 p-3 shadow-2xl"
            style={toastStyle(step.dur)}
          >
            <p className="text-center font-bold text-sm">
              봉인 입찰 · {squareName(board, r.square)}
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {r.bids.map((bid, seat) =>
                bid === null ? null : (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: 자리 번호가 열쇠다
                    key={seat}
                    className={cn(
                      "flex min-w-16 flex-col items-center rounded-lg border px-2 py-1 text-xs transition",
                      opened && seat === r.winner
                        ? "border-amber-200 bg-amber-200/20 shadow-[0_0_14px_rgba(253,230,138,0.6)]"
                        : "border-white/15 bg-white/5",
                    )}
                  >
                    <span className="flex items-center gap-1">
                      <ShipToken seat={seat} size={9} />
                      {name(seat)}
                    </span>
                    <span className="font-bold tabular-nums">
                      {opened ? (bid > 0 ? money(bid) : "—") : "✉"}
                    </span>
                  </span>
                ),
              )}
            </div>
            {opened && (
              <p className="text-center text-white/70 text-xs">
                {r.winner === null
                  ? "아무도 내지 않아 주인 없이 남아요."
                  : `${name(r.winner)} · ${money(r.price)}에 샀어요.`}
              </p>
            )}
          </div>
        </div>
      );
    }
    case "pay": {
      const k = Math.min(1, (elapsed - step.at) / Math.max(1, step.dur));
      const where = (seat: number) =>
        seat === BANK
          ? { x: 4.5, y: 4.5 }
          : squareCenter(ships[seat] ?? view.positions[seat] ?? 0);
      return (
        <>
          {step.flows.map((f, i) => {
            const a = where(f.from);
            const b = where(f.to);
            const ease = 1 - (1 - k) ** 3;
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: 흐름 차례만 있다
                key={i}
                data-pay-flow
                className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-amber-100/95 px-1.5 py-0.5 font-bold text-[clamp(8px,1.8cqw,12px)] text-slate-900 shadow-[0_0_12px_rgba(253,230,138,0.9)]"
                style={{
                  left: pct(a.x + (b.x - a.x) * ease),
                  top: pct(a.y + (b.y - a.y) * ease - 0.3),
                  opacity: k > 0.92 ? (1 - k) / 0.08 : 1,
                }}
              >
                {money(f.amount)}
              </span>
            );
          })}
        </>
      );
    }
    default:
      return null;
  }
}
