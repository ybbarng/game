"use client";

import type { BoardSquare, GalaxyBoard } from "@game/galaxy-engine";
import type { CSSProperties } from "react";
import { StarGlyph } from "@/components/star/StarGlyph";
import { glowOf, sizeOf } from "@/components/star/star-look";
import { cn } from "@/lib/cn";
import { BureauLogo } from "@/stardraw/components/BureauMarks";

import { shipOf, squareName } from "../format";
import type { GroupArt } from "../sky-art";
import { cellOf } from "../sky-art";
import { groupColor } from "../star-color";
import { SeasonMark } from "./SeasonMark";
import { nebulaStyle, TileSky } from "./TileSky";

const pct = (n: number) => `${(n / 9) * 100}%`;

/**
 * 별 칸의 이용료 단계(2026-11-05 사용자 「이용료가 클수록 무서워 보이게」). 모양이 단계를 말한다:
 * 주인 없음 → 주인 색 띠 → 같은 별자리 둘(띠에 엷은 빛) → 완성(주인 색 빛 테가 숨 쉰다).
 * 정거장은 별 둘레를 도는 점(1~3단), 큰 정거장은 별을 감싸는 고리와 한층 밝은 별빛
 */
export type TileTier = "free" | "owned" | "pair" | "complete";

/** 정거장 단이 바뀌는 순간(그 칸에 점이 붙거나 떨어진다) */
export type StationFx = "built" | "sold" | null;

function CornerArt({ kind }: { kind: string }) {
  const common = "size-[62%] opacity-90";
  if (kind === "base")
    // 카노푸스 우주국: 별 따기와 같은 로고를 금빛 한 색으로(docs/48 15-4)
    return (
      <span aria-hidden="true" className={cn(common, "block text-amber-300")}>
        <BureauLogo className="size-full drop-shadow-[0_0_6px_rgba(252,211,77,0.45)]" />
      </span>
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

/** 정거장 점: 별 둘레 궤도를 천천히 돈다(1~3단은 점이 단마다 하나, 큰 정거장은 고리) */
function Station({
  level,
  color,
  fx,
}: {
  level: number;
  color: string;
  fx: StationFx;
}) {
  if (level >= 4)
    return (
      <span
        aria-hidden="true"
        data-level={level}
        className={cn(
          "pointer-events-none absolute top-1/2 left-1/2 block size-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px]",
          fx === "built" && "galaxy-ring-in",
        )}
        style={{
          borderColor: color,
          boxShadow: `0 0 6px ${color}, inset 0 0 6px ${color}88`,
        }}
      />
    );
  const dots = Math.max(0, Math.min(3, level));
  return (
    <span
      aria-hidden="true"
      data-level={level}
      className="galaxy-orbit pointer-events-none absolute top-1/2 left-1/2 block size-[60%] -translate-x-1/2 -translate-y-1/2"
    >
      {Array.from({ length: dots }, (_, i) => {
        const a = (i / Math.max(1, dots)) * Math.PI * 2 - Math.PI / 2;
        const last = i === dots - 1;
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: 단 점은 차례만 있다
            key={i}
            className={cn(
              "absolute block size-[14%] min-h-[3px] min-w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full",
              last && fx === "built" && "galaxy-dot-in",
            )}
            style={{
              left: `${50 + 50 * Math.cos(a)}%`,
              top: `${50 + 50 * Math.sin(a)}%`,
              background: color,
              boxShadow: `0 0 4px ${color}`,
            }}
          />
        );
      })}
      {fx === "sold" && (
        <span
          className="galaxy-dot-out absolute block size-[14%] min-h-[3px] min-w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `${50 + 50 * Math.cos(Math.PI / 6)}%`,
            top: `${50 + 50 * Math.sin(Math.PI / 6)}%`,
            background: color,
          }}
        />
      )}
    </span>
  );
}

/** HDR 별 핵 그림(BT.2020 PQ AVIF, `scripts/build-stardraw-hdr-glow.mjs`). 밝은 별은 빛줄기가 함께 있는 그림 */
export const HDR_CORE_SRC = "/galaxy/star-core-hdr.avif";
export const HDR_CORE_SPIKED_SRC = "/galaxy/star-core-hdr-spiked.avif";

/**
 * HDR 화면에서만 별 핵 위에 겹치는 흰색보다 밝은 빛(docs/48 15-9). 밝은 별일수록 세다(큰 정거장은 한층 더).
 * Safari가 transform이 걸린 HDR 그림을 SDR로 그린 적이 있어(별 따기) 자리는 left·top으로만 잡는다
 */
export function hdrStrength(mag: number, grand: boolean): number {
  const base = Math.min(0.85, Math.max(0.3, 0.5 + (1.2 - mag) * 0.16));
  return Math.min(1, base + (grand ? 0.25 : 0));
}

function HdrCore({ mag, grand }: { mag: number; grand: boolean }) {
  // 원반(StarGlyph 기본 지름 28% × 크기)의 2.4배. 빛줄기 그림은 칸의 빛줄기 그림과 같은 크기(세로 빛줄기 끝까지)
  const spike = glowOf(mag).spike;
  const w =
    28 * sizeOf(mag) * (spike > 0 ? spike * 2 * 1.15 : 2.4) * (grand ? 1.1 : 1);
  return (
    // biome-ignore lint/performance/noImgElement: 정적 내보내기라 next/image를 쓰지 않는다(별 따기 HDR 별빛과 같다)
    <img
      src={spike > 0 ? HDR_CORE_SPIKED_SRC : HDR_CORE_SRC}
      alt=""
      aria-hidden="true"
      draggable={false}
      data-hdr-core
      className="sd-hdr pointer-events-none absolute max-w-none"
      style={{
        width: `${w}%`,
        height: `${w}%`,
        left: `${50 - w / 2}%`,
        top: `${44 - w / 2}%`,
        opacity: `calc(var(--sd-hdr-strength) * ${hdrStrength(mag, grand).toFixed(2)})`,
      }}
    />
  );
}

export interface BoardTileProps {
  board: GalaxyBoard;
  sq: BoardSquare;
  art: GroupArt | undefined;
  /** 보이는 주인(연출 전 사기는 아직 -1) */
  owner: (square: number) => number;
  ownerName: string | null;
  tier: TileTier;
  level: number;
  mortgaged: boolean;
  inSeason: boolean;
  moonlit: boolean;
  selected: boolean;
  /** 누른 칸과 같은 별자리(함께 밝힌다) */
  kin: boolean;
  /** 누른 칸이 있어 나머지가 한 발 물러난다 */
  faded: boolean;
  marked: boolean;
  pulse: boolean;
  sparkle: boolean;
  /** 별자리 완성 순간 이 칸이 반짝일 차례 */
  flash: boolean;
  station: StationFx;
  label: string;
  /** HDR 화면: 별 원반 가운데에 흰색보다 밝은 빛을 겹친다 */
  hdr: boolean;
  onPick: ((square: number) => void) | undefined;
  onHover: ((square: number | null) => void) | undefined;
}

/** 판 둘레 칸 하나| null) => void;
}

/** 판 둘레 칸 하나 */
export function BoardTile(p: BoardTileProps) {
  const { sq, board } = p;
  const { col, row } = cellOf(sq.index);
  const star = sq.star;
  const o = p.owner(sq.index);
  const ownerColor = o >= 0 ? shipOf(o).color : null;
  const group = star ? board.groups[star.group] : undefined;
  return (
    <button
      type="button"
      data-square={sq.index}
      data-owner={o >= 0 ? o : undefined}
      data-tier={star ? p.tier : undefined}
      data-complete={p.tier === "complete" || undefined}
      data-selected={p.selected || undefined}
      data-kin={p.kin || undefined}
      data-moonlit={p.moonlit || undefined}
      data-season={group?.season}
      aria-label={p.label}
      onClick={() => p.onPick?.(sq.index)}
      onPointerEnter={(e) => e.pointerType === "mouse" && p.onHover?.(sq.index)}
      onPointerLeave={(e) => e.pointerType === "mouse" && p.onHover?.(null)}
      className={cn(
        "absolute flex flex-col items-center justify-center overflow-hidden rounded-[10%] border bg-slate-900/55 p-0 outline-none transition-[box-shadow,border-color,opacity,filter] duration-500",
        "focus-visible:ring-2 focus-visible:ring-white",
        ownerColor ? "" : "border-white/10",
        p.inSeason && "galaxy-season",
        p.tier === "complete" && "galaxy-complete",
        p.selected && "ring-2 ring-white/90",
        p.kin && !p.selected && "ring-2 ring-sky-200/70",
        p.faded && "opacity-45 saturate-50",
        p.marked && "ring-2 ring-amber-200",
        p.pulse && "galaxy-pulse",
        p.sparkle && "galaxy-sparkle",
        p.flash && "galaxy-tile-flash",
        p.mortgaged && "opacity-55",
      )}
      style={{
        left: `calc(${pct(col)} + 1px)`,
        top: `calc(${pct(row)} + 1px)`,
        width: `calc(${pct(1)} - 2px)`,
        height: `calc(${pct(1)} - 2px)`,
        ...(ownerColor
          ? ({
              borderColor: `${ownerColor}${p.tier === "complete" ? "" : "aa"}`,
              "--owner": ownerColor,
            } as CSSProperties)
          : {}),
      }}
    >
      {star ? (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-0"
            style={nebulaStyle(sq.index, groupColor(board, star.group))}
          />
          {p.art && <TileSky art={p.art} square={sq.index} owner={p.owner} />}
          {/* 위 띠: 별자리 색(같은 별자리를 이어 보게) */}
          <span
            className="absolute inset-x-0 top-0 h-[11%]"
            style={{ background: groupColor(board, star.group), opacity: 0.85 }}
          />
          {group && (
            <SeasonMark
              season={group.season}
              className="absolute top-[14%] left-[7%] size-[17%]"
            />
          )}
          <StarGlyph
            k={star.star.k}
            mag={star.star.mag}
            seed={sq.index}
            className={cn(
              "top-[44%] transition-opacity duration-700",
              p.moonlit && "opacity-45",
              // 큰 정거장: 별빛이 한층 밝다
              p.level >= 4 && "scale-110 brightness-125",
            )}
          />
          {p.hdr && !p.moonlit && (
            <HdrCore mag={star.star.mag} grand={p.level >= 4} />
          )}
          {ownerColor && p.level > 0 && (
            <span className="absolute top-[44%] left-1/2 block size-full -translate-x-1/2 -translate-y-1/2">
              <Station level={p.level} color={ownerColor} fx={p.station} />
            </span>
          )}
          {p.moonlit && (
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(241,245,249,0.32),rgba(241,245,249,0.06)_55%,transparent_75%)]"
            />
          )}
          {/* 아래 띠: 주인 색(둘이면 엷은 빛, 완성이면 테와 함께 숨 쉰다) */}
          {ownerColor && (
            <span
              aria-hidden="true"
              data-owner-band
              className="absolute inset-x-0 bottom-0 h-[24%]"
              style={{
                background: `linear-gradient(0deg, ${ownerColor}${p.tier === "free" || p.tier === "owned" ? "99" : "dd"}, ${ownerColor}55)`,
                boxShadow:
                  p.tier === "pair" || p.tier === "complete"
                    ? `0 -2px 8px ${ownerColor}`
                    : undefined,
              }}
            />
          )}
          <span
            className={cn(
              "absolute bottom-[5%] max-w-full truncate px-0.5 text-[clamp(6px,1.75cqw,11px)] leading-none [text-shadow:0_1px_2px_#000]",
              ownerColor ? "font-semibold text-white" : "text-white/85",
            )}
          >
            {star.star.ko}
          </span>
          {p.mortgaged && (
            <span className="absolute inset-x-0 top-[38%] bg-black/65 text-center text-[clamp(6px,1.4cqw,9px)] text-white/85">
              맡김
            </span>
          )}
        </>
      ) : (
        <>
          <CornerArt kind={sq.kind} />
          <span className="max-w-full truncate px-0.5 text-[clamp(6px,1.6cqw,10px)] text-white/70 leading-none">
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
}
