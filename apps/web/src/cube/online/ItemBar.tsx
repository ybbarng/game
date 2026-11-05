"use client";

import {
  COLOR_PATTERNS,
  GRAY,
  PATTERN_LABELS,
  patternStyle,
} from "../item-look";
import { hexColor } from "../settings";
import { ITEM_LABELS, type ItemKind } from "./items";

/**
 * 아이템전 화면 조각(docs/51 3-3, docs/47 9-7): 아이콘, 내 아이템 칸, 맞은 쪽 표시, 흑백 화면의 색·무늬 표.
 * 아이콘은 한 가지 굵기의 선 그림(24 칸)이다. 꾸미지 않고 큐브 화면의 다른 아이콘과 같은 결로 둔다
 */

const PATHS: Record<ItemKind, string> = {
  // 두 화살이 엇갈려 도는 모양
  mix: "M4 9a8 8 0 0 1 14-3l2-2v6h-6l2.4-2.4A6 6 0 0 0 6 9zM20 15a8 8 0 0 1-14 3l-2 2v-6h6l-2.4 2.4A6 6 0 0 0 18 15z",
  // 구름
  fog: "M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z",
  // 반이 까만 칸
  blind: "M4 4h16v16H4zM4 4l16 16V4z",
  // 맞바꾸는 두 화살
  swap: "M4 8h13l-3-3M20 16H7l3 3",
  // 반만 찬 동그라미
  gray: "M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18",
  shield: "M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z",
  // 거꾸로 도는 화살
  rewind: "M5 12a7 7 0 1 0 2-5M5 4v4h4",
  // 전구
  hint: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z",
  // 돋보기
  find: "M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM15.5 15.5L20 20",
  // 모래시계
  heal: "M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9",
};

export function ItemIcon({
  item,
  className = "h-4 w-4",
}: {
  item: ItemKind;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[item]} />
    </svg>
  );
}

/**
 * 내가 맞은 방해 표시(큐브 바로 위 아이템 줄 안, 2026-11-05 자리 배치). 구석에 작게 뜨던 것을 줄 가운데에 크게 둔다.
 * 움직임 줄이기면 깜빡이지 않고 글만
 */
export function ItemNotices({
  notices,
  nameOf,
  reduced,
  className = "",
}: {
  notices: readonly {
    key: string;
    item: ItemKind;
    by: string;
    blocked: boolean;
  }[];
  nameOf: (id: string) => string;
  reduced: boolean;
  className?: string;
}) {
  if (notices.length === 0) return null;
  const n = notices[0] as (typeof notices)[number];
  return (
    <span
      key={n.key}
      role="status"
      data-cube-item-notice={n.item}
      data-cube-item-blocked={n.blocked ? "" : undefined}
      className={`flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 font-semibold text-sm shadow-lg ${
        n.blocked
          ? "border-sky-200/50 bg-sky-950/80 text-sky-100"
          : "border-rose-200/50 bg-rose-950/80 text-rose-100"
      } ${reduced ? "" : "cube-item-hit"} ${className}`}
    >
      {!reduced && <ItemIcon item={n.blocked ? "shield" : n.item} />}
      {n.blocked
        ? `방패로 막음 · ${ITEM_LABELS[n.item]}`
        : `${ITEM_LABELS[n.item]} · ${nameOf(n.by)}`}
    </span>
  );
}

/**
 * 흑백 화면 동안 색과 무늬의 짝(여섯 칸: 내 색 배치의 색 칸과 그 무늬 칸). 한눈에 읽히게 칸을 크게 두고 짝마다
 * 테두리로 묶는다(2026-11-05 「너무 작고 빽빽하다」)
 */
export function GrayLegend({ colors }: { colors: readonly number[] }) {
  return (
    <ol
      data-cube-gray-legend
      aria-label="색과 무늬의 짝"
      className="flex shrink-0 items-center gap-1 md:gap-1.5"
    >
      {COLOR_PATTERNS.map((p, c) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: 색 번호가 곧 자리
          key={c}
          className="flex items-center gap-0.5 rounded-md border border-white/15 bg-black/30 p-0.5"
          title={PATTERN_LABELS[p]}
        >
          <span
            className="h-4 w-4 rounded-[3px] border border-black/40 md:h-5 md:w-5"
            style={{ backgroundColor: hexColor(colors[c] ?? 0) }}
          />
          <span
            data-cube-gray-pattern={p}
            className="h-4 w-4 rounded-[3px] border border-black/40 md:h-5 md:w-5"
            style={{ backgroundColor: hexColor(GRAY), ...patternStyle(p) }}
          />
        </li>
      ))}
    </ol>
  );
}

/** 내 아이템 칸(가진 것·방패). 쓰기는 살펴보기 키(기본 Space)나 단추 */
export function ItemSlot({
  item,
  guard,
  pending,
  onUse,
  useKey,
}: {
  item: ItemKind | null;
  guard: boolean;
  /** 썼고 아직 판정되지 않았다 */
  pending: boolean;
  onUse: () => void;
  /** 쓰는 키 이름(키보드가 없으면 없음) */
  useKey: string | null;
}) {
  return (
    <div className="flex items-center gap-1.5" data-cube-item-bar>
      <button
        type="button"
        data-cube-item-slot={item ?? ""}
        disabled={!item || pending}
        onClick={onUse}
        className={`flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs ${
          item && !pending
            ? "border-amber-300/50 bg-amber-300/15 text-amber-100 hover:bg-amber-300/25"
            : "border-white/10 bg-white/5 text-white/40"
        }`}
      >
        {item ? <ItemIcon item={item} /> : null}
        {item ? ITEM_LABELS[item] : "아이템 없음"}
        {item && !pending && useKey && (
          <kbd className="rounded bg-black/40 px-1 font-mono text-[10px] text-white/70 max-md:hidden">
            {useKey}
          </kbd>
        )}
      </button>
      {guard && (
        <span
          data-cube-item-guard
          title={ITEM_LABELS.shield}
          className="flex h-7 items-center gap-1 rounded-full border border-sky-300/40 bg-sky-300/10 px-2 text-sky-100 text-xs"
        >
          <ItemIcon item="shield" />
          방패
        </span>
      )}
    </div>
  );
}
