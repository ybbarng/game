"use client";

import { cardOf, type HwatuCard } from "@game/hwatu";
import { type CSSProperties, type ReactNode, useId } from "react";

import { useFlightHidden } from "@/components/card-fx/flights";
import { cardHeight, HWATU_SHAPE } from "@/components/card-fx/kind";
import { cn } from "@/lib/cn";

import {
  CardArt,
  DEEP_RED,
  GOLD,
  GwangMark,
  MonthIndex,
  PAPER,
  SsangpiMark,
} from "./HwatuArt";

/*
 * 화투 카드 한 장(docs/27 2절). 한국 화투처럼 흰 바탕에 진한 색과 굵은 윤곽선으로 그리고,
 * 가장자리는 붉은 뒷면이 앞으로 접혀 온 것처럼 붉은 테를 두른다.
 * 왼쪽 위에 달 숫자를 작게 써서 겹쳐 놓은 먹은 패도 알아보게 한다.
 * 그림 상자 60×96(화투 비율 5:8)
 */

const W = HWATU_SHAPE.art.w;
const H = HWATU_SHAPE.art.h;
const BACK_RED = "#b5161f";

/** 너비가 이보다 작으면 잔무늬를 빼고 달 숫자를 크게 쓴다 */
const LITE_BELOW = 30;

/** 앞면: 붉은 테, 흰 바탕, 그림, 종류 표시, 달 숫자 */
function Face({ card, lite }: { card: HwatuCard; lite: boolean }): ReactNode {
  // 그림이 흰 바탕 끝까지 차도록 붉은 테 안쪽으로 자른다
  const clip = `hw-${useId().replace(/:/g, "")}`;
  return (
    <g>
      <rect
        x={0.5}
        y={0.5}
        width={W - 1}
        height={H - 1}
        rx={5}
        fill={DEEP_RED}
      />
      <clipPath id={clip}>
        <rect x={2.4} y={2.4} width={W - 4.8} height={H - 4.8} rx={3.4} />
      </clipPath>
      <rect
        x={2.4}
        y={2.4}
        width={W - 4.8}
        height={H - 4.8}
        rx={3.4}
        fill={PAPER}
      />
      <g clipPath={`url(#${clip})`}>
        <CardArt card={card} lite={lite} />
      </g>
      {card.kind === "gwang" && <GwangMark />}
      {card.kind === "pi" && card.piValue === 2 && <SsangpiMark lite={lite} />}
      <MonthIndex month={card.month} lite={lite} />
    </g>
  );
}

/** 마름모 무늬 점들(뒷면) */
const BACK_DOTS = Array.from({ length: 9 }, (_, row) =>
  Array.from({ length: row % 2 === 0 ? 5 : 4 }, (_, col) => {
    const x = (row % 2 === 0 ? 12 : 17) + col * 9;
    const y = 12 + row * 9;
    return `M${x} ${y - 2.2}l2.2 2.2l-2.2 2.2l-2.2 -2.2Z`;
  }).join(""),
).join("");

/** 뒷면: 진한 빨강 바탕에 금테와 가운데 꽃 문양 */
function Back({ lite }: { lite: boolean }): ReactNode {
  return (
    <g>
      <rect
        x={0.5}
        y={0.5}
        width={W - 1}
        height={H - 1}
        rx={5}
        fill={BACK_RED}
        stroke="#5c0a10"
        strokeWidth={1}
      />
      {!lite && <path d={BACK_DOTS} fill="#9a0f18" />}
      <rect
        x={5}
        y={5}
        width={W - 10}
        height={H - 10}
        rx={3}
        fill="none"
        stroke={GOLD}
        strokeWidth={lite ? 2.4 : 1.2}
      />
      {!lite && (
        <rect
          x={7.5}
          y={7.5}
          width={W - 15}
          height={H - 15}
          rx={2}
          fill="none"
          stroke={GOLD}
          strokeOpacity={0.6}
          strokeWidth={0.5}
        />
      )}
      <circle
        cx={30}
        cy={48}
        r={lite ? 14 : 11}
        fill="#8c0d15"
        stroke={GOLD}
        strokeWidth={lite ? 2.4 : 1.2}
      />
      <path
        d={Array.from({ length: 5 }, (_, k) => {
          const a = ((-90 + k * 72) * Math.PI) / 180;
          const s = lite ? 1.25 : 1;
          const x = 30 + 5 * s * Math.cos(a);
          const y = 48 + 5 * s * Math.sin(a);
          const r = 3.4 * s;
          return `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${(2 * r).toFixed(1)} 0a${r} ${r} 0 1 0 ${(-2 * r).toFixed(1)} 0`;
        }).join("")}
        fill={GOLD}
      />
      <circle cx={30} cy={48} r={lite ? 2.6 : 2} fill="#8c0d15" />
    </g>
  );
}

/**
 * 화투 카드 한 장. `id`가 없거나 `faceDown`이면 뒷면.
 * 크기는 `width`(px), 높이는 화투 비율(5:8)로 정해진다. 누를 수 있으면 단추로 그린다
 */
export function HwatuCardView({
  id,
  faceDown = false,
  width = 56,
  selected = false,
  dim = false,
  highlight = false,
  onClick,
  className,
  style,
  flip,
  decorative = false,
}: {
  id?: string;
  /**
   * 장면이 바뀔 때 옮겨 가 보일 이름(card-fx `useCardFlip`의 `data-flip`). 보통 카드 id. 그 카드의 겉그림이 날아오는
   * 동안은 가린다(`useFlightHidden`)
   */
  flip?: string;
  /** 연출용 겉그림: 화면 읽기·화면 시험(`data-card`)에 잡히지 않는다 */
  decorative?: boolean;
  faceDown?: boolean;
  width?: number;
  /** 고른 카드(위로 살짝 뜬다) */
  selected?: boolean;
  /** 지금 낼 수 없는 카드(흐리게) */
  dim?: boolean;
  /** 짝이 맞는 바닥 카드 등(테두리 강조) */
  highlight?: boolean;
  onClick?: () => void;
  className?: string;
  /** 겹쳐 놓기 등 놓는 쪽이 정하는 자리 */
  style?: CSSProperties;
}) {
  const card = id && !faceDown ? cardOf(id) : null;
  const lite = width < LITE_BELOW;
  const arriving = useFlightHidden(flip);
  const svg = (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={width}
      height={cardHeight(HWATU_SHAPE, width)}
      aria-hidden="true"
      className="block"
    >
      {card ? <Face card={card} lite={lite} /> : <Back lite={lite} />}
    </svg>
  );
  // 날아오는 동안 가린다. 투명도는 전환(`transition`)으로 서서히 바뀌어 visibility로 바로 숨기고 바로 보인다
  const shown: CSSProperties | undefined = arriving
    ? { ...style, visibility: "hidden" }
    : style;
  const label = card ? card.name : "뒷면 화투";
  if (decorative)
    return (
      <span
        aria-hidden
        className={cn(
          "relative inline-block shrink-0 rounded-md shadow-[1px_2px_4px_rgba(0,0,0,0.45)]",
          className,
        )}
        style={shown}
      >
        {svg}
      </span>
    );
  const classes = cn(
    "relative shrink-0 rounded-md shadow-[1px_2px_4px_rgba(0,0,0,0.45)] transition",
    selected && "-translate-y-2 ring-2 ring-amber-300",
    // 휴대폰에서도 잘 보이게 두꺼운 테두리, 빛, 살짝 뜨기
    highlight &&
      "-translate-y-1 shadow-[0_0_14px_rgba(125,211,252,0.85)] ring-[3px] ring-sky-300",
    dim && "opacity-45",
    className,
  );
  return onClick ? (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      data-card={id}
      data-flip={flip}
      onClick={onClick}
      // Enter·Space는 여기서 처리하고 막는다(손패 조작의 Enter가 고른 카드를 한 번 더 내지 않게)
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={classes}
      style={shown}
    >
      {svg}
    </button>
  ) : (
    <span
      role="img"
      aria-label={label}
      data-card={card ? id : undefined}
      data-flip={flip}
      className={cn(classes, "inline-block")}
      style={shown}
    >
      {svg}
    </span>
  );
}
