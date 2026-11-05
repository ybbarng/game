"use client";

import { type CSSProperties, type ReactNode, useId, useRef } from "react";
import { cn } from "@/lib/cn";

import { shipOf } from "../format";
import type { Heading } from "../fx";

const OUTLINE = "#0b1020";

/** 색 섞기(#rrggbb, t = 0이면 그대로, 1이면 상대 색) */
export function mix(hex: string, to: string, t: number): string {
  const p = (h: string, i: number) => Number.parseInt(h.slice(i, i + 2), 16);
  const ch = (i: number) =>
    Math.round(p(hex, i) + (p(to, i) - p(hex, i)) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(1)}${ch(3)}${ch(5)}`;
}

/**
 * 우주선 말: 자리마다 실루엣과 색이 둘 다 다르다(색만으로 가르지 않는다, docs/48 7-1).
 * 기수는 위를 본다(판에서는 감싼 쪽이 돌린다). 위는 밝고 아래는 어두운 몸통, 창 반짝임,
 * 바깥 어두운 테로 칸 위에서도 또렷하다. 작은 표시(`detail` 끔, 기본은 16px 아래)는 실루엣과 창만.
 * `thrust`면 꽁무니에 짧은 엔진 빛
 */
export function ShipToken({
  seat,
  size = 14,
  className,
  style,
  detail,
  thrust = false,
  live = false,
}: {
  seat: number;
  size?: number;
  className?: string;
  style?: CSSProperties;
  detail?: boolean;
  thrust?: boolean;
  /** 판 위 말: 창이 천천히 반짝인다(움직임 줄이기면 CSS가 멈춘다). 그림자는 감싼 쪽이 화면 아래로 준다 */
  live?: boolean;
}) {
  const ship = shipOf(seat);
  const full = detail ?? size >= 16;
  const id = `ship${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const c = ship.color;
  const body = `url(#${id}-b)`;
  const shade = mix(c, OUTLINE, 0.35);
  const sw = full ? 5 : 7;
  const line = {
    stroke: OUTLINE,
    strokeWidth: sw,
    strokeLinejoin: "round" as const,
  };
  const win = (cx: number, cy: number, r: number) => (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={`url(#${id}-g)`}
        {...line}
        strokeWidth={sw - 1.5}
      />
      <circle
        cx={cx - r * 0.32}
        cy={cy - r * 0.34}
        r={Math.max(2, r * 0.3)}
        fill="#ffffff"
        className={live ? "galaxy-ship-glint" : undefined}
      />
    </g>
  );
  const shine = (d: string) =>
    full ? (
      <path
        d={d}
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.55"
        strokeWidth="4"
        strokeLinecap="round"
      />
    ) : null;
  const nozzle = (y: number) => (
    <path d={`M41 ${y} H59 L62 ${y + 9} H38 Z`} fill="#64748b" {...line} />
  );
  const ringW = full ? 15 : 17;
  let art: ReactNode;
  switch (ship.shape) {
    case "rocket":
      // 날렵한 로켓: 위아래로 긴 몸통, 양옆 꼬리 날개
      art = (
        <>
          <path d="M37 50 L15 74 L17 89 L39 80 Z" fill={shade} {...line} />
          <path d="M63 50 L85 74 L83 89 L61 80 Z" fill={shade} {...line} />
          {nozzle(80)}
          <path
            d="M50 3 C64 15 69 36 67 60 L62 83 H38 L33 60 C31 36 36 15 50 3 Z"
            fill={body}
            {...line}
          />
          {shine("M43 15 C39 27 38 42 39 60")}
          {win(50, 39, full ? 10 : 9)}
        </>
      );
      break;
    case "saucer":
      // 둥근 원반선: 위에서 본 원반, 둘레 불빛, 가운데 유리 지붕, 앞쪽 불 하나
      art = (
        <>
          {nozzle(84)}
          <circle cx="50" cy="52" r="41" fill={body} {...line} />
          {full && (
            <>
              <circle
                cx="50"
                cy="52"
                r="29"
                fill="none"
                stroke={shade}
                strokeWidth="3"
              />
              {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
                const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
                return (
                  <circle
                    key={k}
                    cx={50 + Math.sin(a) * 35}
                    cy={52 - Math.cos(a) * 35}
                    r="2.6"
                    fill={mix(c, "#ffffff", 0.75)}
                  />
                );
              })}
            </>
          )}
          {shine("M21 40 A33 33 0 0 1 44 20")}
          <circle cx="50" cy="17" r={full ? 3.5 : 5} fill="#ffffff" />
          {win(50, 52, full ? 16 : 17)}
        </>
      );
      break;
    case "probe":
      // 태양 전지판 탐사선: 가는 몸통 양옆에 넓은 전지판 날개, 위에 안테나
      art = (
        <>
          <rect
            x="28"
            y="45"
            width="44"
            height="8"
            fill="#94a3b8"
            {...line}
            strokeWidth={sw - 1.5}
          />
          {[3, 69].map((x) => (
            <g key={x}>
              <rect
                x={x}
                y="31"
                width="28"
                height="36"
                rx="3"
                fill={shade}
                {...line}
              />
              {full && (
                <path
                  d={`M${x + 9.3} 33 V65 M${x + 18.7} 33 V65 M${x + 2} 49 H${x + 26}`}
                  stroke={mix(c, "#ffffff", 0.35)}
                  strokeWidth="2"
                />
              )}
            </g>
          ))}
          {full && (
            <>
              <path
                d="M50 12 V4"
                stroke={OUTLINE}
                strokeWidth="6"
                strokeLinecap="round"
              />
              <path
                d="M50 12 V4"
                stroke="#cbd5e1"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle cx="50" cy="4" r="3" fill="#ffffff" />
            </>
          )}
          {nozzle(80)}
          <path
            d="M50 10 C60 10 63 19 63 28 V72 Q63 82 50 84 Q37 82 37 72 V28 C37 19 40 10 50 10 Z"
            fill={body}
            {...line}
          />
          {shine("M43 22 V58")}
          {win(50, 33, full ? 8.5 : 8)}
        </>
      );
      break;
    default:
      // 고리 셔틀: 둥근 몸통을 납작한 고리가 두른다(고리 뒤쪽 반 → 몸통 → 앞쪽 반)
      art = (
        <>
          <path
            d="M6 56 A44 15 0 0 1 94 56"
            fill="none"
            stroke={OUTLINE}
            strokeWidth={ringW}
          />
          <path
            d="M6 56 A44 15 0 0 1 94 56"
            fill="none"
            stroke={shade}
            strokeWidth="9"
          />
          {nozzle(83)}
          <path
            d="M50 6 C64 6 68 30 68 52 C68 72 62 84 50 86 C38 84 32 72 32 52 C32 30 36 6 50 6 Z"
            fill={body}
            {...line}
          />
          {shine("M41 20 C38 30 37 42 38 50")}
          {win(50, 31, full ? 9 : 8.5)}
          <path
            d="M6 56 A44 15 0 0 0 94 56"
            fill="none"
            stroke={OUTLINE}
            strokeWidth={ringW}
            strokeLinecap="round"
          />
          <path
            d="M6 56 A44 15 0 0 0 94 56"
            fill="none"
            stroke={mix(c, "#ffffff", 0.2)}
            strokeWidth="9"
            strokeLinecap="round"
          />
        </>
      );
  }
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      overflow="visible"
      data-ship-shape={ship.shape}
      className={cn(
        !live && "drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.85)]",
        className,
      )}
      style={style}
    >
      <defs>
        <linearGradient id={`${id}-b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={mix(c, "#ffffff", 0.55)} />
          <stop offset="45%" stopColor={c} />
          <stop offset="100%" stopColor={mix(c, OUTLINE, 0.45)} />
        </linearGradient>
        <radialGradient id={`${id}-g`} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#bae6fd" />
          <stop offset="45%" stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#0b1020" />
        </radialGradient>
        {thrust && (
          <linearGradient id={`${id}-f`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fffbea" />
            <stop
              offset="45%"
              stopColor={mix(c, "#ffffff", 0.3)}
              stopOpacity="0.95"
            />
            <stop offset="100%" stopColor={c} stopOpacity="0" />
          </linearGradient>
        )}
      </defs>
      {thrust && (
        <g data-ship-flame className="galaxy-flame">
          <path d="M35 86 Q50 172 65 86 Z" fill={`url(#${id}-f)`} />
          <path d="M43 86 Q50 132 57 86 Z" fill="#ffffff" fillOpacity="0.9" />
        </g>
      )}
      {art}
    </svg>
  );
}

/**
 * 판 위 우주선: 가는 쪽으로 기수를 돌리고(짧은 쪽으로 천천히 돈다), 미끄러지는 동안 꽁무니에 엔진 빛,
 * 멈춰 있으면 살짝 떠 있듯 천천히 오르내린다(그림자는 칸 위에 남아 오르면 작아진다).
 * 움직임 줄이기면 흔들림·꼬리·도는 연출 없이 방향만
 */
export function ShipPiece({
  seat,
  heading,
  thrust,
  moving,
  reduced,
}: {
  seat: number;
  heading: Heading;
  thrust: boolean;
  moving: boolean;
  reduced: boolean;
}) {
  // 270°(왼쪽)에서 0°(위)로 갈 때 거꾸로 세 바퀴 돌지 않게, 지난 각에서 가까운 쪽으로 이어 간다
  const angle = useRef<number>(heading);
  const was = ((angle.current % 360) + 360) % 360;
  const delta = ((((heading - was) % 360) + 540) % 360) - 180;
  angle.current += delta === -180 ? 180 : delta;
  const hover = !reduced && !moving;
  const delay = { animationDelay: `${-seat * 0.9}s` } as CSSProperties;
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-x-[18%] bottom-[-4%] h-[18%] rounded-[50%] bg-black/60 blur-[1.5px]",
          hover && "galaxy-ship-shadow",
        )}
        style={delay}
      />
      <span
        className={cn("absolute inset-0 block", hover && "galaxy-ship-hover")}
        style={{
          ...delay,
          filter: "drop-shadow(0 1.5px 1.5px rgba(0,0,0,0.85))",
        }}
      >
        <span
          className={cn(
            "absolute inset-0 block",
            !reduced && "transition-transform duration-[360ms] ease-in-out",
          )}
          style={{ transform: `rotate(${angle.current}deg)` }}
        >
          <ShipToken
            seat={seat}
            size={64}
            detail
            live={!reduced}
            thrust={thrust && !reduced}
            className="size-full"
          />
        </span>
      </span>
    </>
  );
}
