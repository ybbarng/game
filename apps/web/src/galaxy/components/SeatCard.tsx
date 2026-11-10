"use client";

import {
  type GalaxyView,
  requestById,
  requestProgress,
} from "@game/galaxy-engine";
import { type ReactNode, useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import {
  REACTIONS,
  type Reaction,
  type ReactionKind,
  useChat,
} from "@/net/chat";

import { money, shipOf } from "../format";
import { groupColor } from "../star-color";
import { ShipToken } from "./parts";
import "@/galaxy/components/galaxy.css";

/** 반응이 떠올라 있는 시간(globals.css `galaxy-react`와 같다) */
const REACTION_SHOWN_MS = 1800;

const REACTION_NAMES: Record<ReactionKind, string> = {
  clap: "박수",
  wow: "놀람",
  aww: "아쉬움",
};

/** 이 자리에 온 반응 가운데 아직 떠 있는 것. 떠 있는 동안만 다시 그린다 */
function useShownReactions(seat: number): Reaction[] {
  const reactions = useChat((s) => s.reactions);
  const [now, setNow] = useState(() => Date.now());
  const mine = reactions.filter(
    (r) => r.to === seat && now - r.at < REACTION_SHOWN_MS,
  );
  const latest = reactions.filter((r) => r.to === seat).at(-1)?.at ?? 0;
  useEffect(() => {
    const t = Date.now();
    setNow(t);
    const left = latest + REACTION_SHOWN_MS - t;
    if (left <= 0) return;
    const id = setTimeout(() => setNow(Date.now()), left + 20);
    return () => clearTimeout(id);
  }, [latest]);
  return mine;
}

/** 별자리 이름을 짧게(「자리」를 뗀다) */
const shortName = (ko: string) => ko.replace(/자리$/, "");

export interface SeatCardProps {
  view: GalaxyView;
  seat: number;
  /** 연출에 맞춰 보이는 별빛 */
  cash: number;
  rank: number | null;
  name: string;
  /** 지금 차례 */
  turn: boolean;
  /** 이 기기 사람의 자리 */
  mine: boolean;
  /** 좁은 화면: 별자리 진행 줄을 뺀다 */
  compact: boolean;
  /** 내 관측 의뢰(내 자리만, 모르면 null) */
  request: number | null;
  /** 개인 시계(있는 판만) */
  clock?: ReactNode;
  /** 반응을 보낼 수 있으면(남의 자리) */
  onReact?: (kind: ReactionKind) => void;
}

/**
 * 판 둘레 자리 카드(docs/48 15-6): 우주선·이름·별빛·순위·가진 별, 별자리 진행(넓은 화면), 차례인 자리는 제 색 테와 빛.
 * 내 자리에는 접어 둔 관측 의뢰서, 판 끝에는 모두의 의뢰가 펼쳐진다. 남의 자리를 누르면 짧은 반응을 보낸다
 */
export function SeatCard({
  view,
  seat,
  cash,
  rank,
  name,
  turn,
  mine,
  compact,
  request,
  clock,
  onReact,
}: SeatCardProps) {
  const [picking, setPicking] = useState(false);
  const [slipOpen, setSlipOpen] = useState(false);
  const shown = useShownReactions(seat);
  const color = shipOf(seat).color;
  const out = view.out[seat];
  const stars = view.owners.filter((o) => o === seat).length;
  const groups = view.board.groups
    .map((g, i) => ({
      g,
      i,
      owned: g.squares.filter((sq) => view.owners[sq] === seat).length,
    }))
    .filter((r) => r.owned > 0);
  const revealed = view.requests?.reveals[seat] ?? null;
  const slip = revealed?.card ?? (mine ? request : null);
  const progress =
    slip !== null ? requestProgress(view, seat, slip) : { have: 0, need: 0 };

  return (
    <div
      data-player={seat}
      data-turn={turn || undefined}
      className={cn(
        "relative flex min-w-0 flex-col gap-0.5 rounded-2xl border bg-slate-950/70 px-2.5 py-1.5 text-sm shadow-lg backdrop-blur-sm transition-[box-shadow,border-color,opacity] duration-300",
        turn ? "border-2" : "border-white/10",
        out && "opacity-40",
      )}
      style={
        turn
          ? {
              borderColor: color,
              boxShadow: `0 0 0 1px ${color}66, 0 0 22px 2px ${color}55`,
            }
          : undefined
      }
    >
      <button
        type="button"
        disabled={!onReact}
        aria-label={onReact ? `${name}에게 반응 보내기` : undefined}
        onClick={() => setPicking((p) => !p)}
        className="flex min-w-0 items-center gap-1.5 text-left disabled:cursor-default"
      >
        <ShipToken seat={seat} size={compact ? 14 : 18} />
        <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
        <span
          data-cash={seat}
          className="font-bold text-amber-100 tabular-nums"
        >
          {money(cash)}
        </span>
      </button>
      <div className="flex items-center gap-1.5 text-[11px] text-white/55">
        <span>{out ? "운항 중단" : `${rank ?? ""}위 · 별 ${stars}`}</span>
        {clock && <span className="ml-auto">{clock}</span>}
      </div>
      {!compact && groups.length > 0 && (
        <ul className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-white/70">
          {groups.map(({ g, i, owned }) => (
            <li
              key={g.id}
              className="flex items-center gap-0.5"
              data-seat-group={g.id}
            >
              <span
                aria-hidden="true"
                className="tracking-[-0.15em]"
                style={{ color: groupColor(view.board, i) }}
              >
                {"●".repeat(owned)}
              </span>
              <span className="ml-0.5">
                {shortName(g.ko)}
                {owned >= g.squares.length ? " 완성" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {slip !== null && (
        <button
          type="button"
          data-request-slip={seat}
          data-request-done={revealed?.done || undefined}
          onClick={() => setSlipOpen((o) => !o)}
          className={cn(
            "mt-0.5 flex min-w-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-left text-[11px]",
            revealed
              ? revealed.done
                ? "border-emerald-300/50 bg-emerald-300/10 text-emerald-100"
                : "border-white/15 bg-white/5 text-white/60"
              : "border-amber-100/30 bg-[#f6efe0]/10 text-amber-50/90",
          )}
        >
          <span aria-hidden="true">✉</span>
          <span className="truncate">{requestById(slip).title}</span>
          <span className="ml-auto shrink-0 tabular-nums">
            {revealed
              ? revealed.done
                ? "이룸"
                : "못 이룸"
              : `${Math.min(progress.have, progress.need)}/${progress.need}`}
          </span>
        </button>
      )}
      {slipOpen && slip !== null && (
        <p className="rounded-md bg-[#f6efe0] px-2 py-1 text-[11px] text-slate-900 leading-snug">
          {requestById(slip).text}
        </p>
      )}
      {picking && onReact && (
        <div
          data-reaction-picker
          className="absolute -top-11 left-1/2 z-30 flex -translate-x-1/2 gap-1 rounded-full border border-white/15 bg-slate-900/95 px-1.5 py-1 shadow-xl"
        >
          {(Object.keys(REACTIONS) as ReactionKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-label={REACTION_NAMES[kind]}
              data-react={kind}
              onClick={() => {
                onReact(kind);
                setPicking(false);
              }}
              className="grid size-8 place-items-center rounded-full text-lg hover:bg-white/10"
            >
              {REACTIONS[kind]}
            </button>
          ))}
        </div>
      )}
      {shown.map((r, i) => (
        <span
          key={r.id}
          data-reaction={r.kind}
          role="img"
          aria-label={REACTION_NAMES[r.kind]}
          className="galaxy-react pointer-events-none absolute -top-3 z-30 text-2xl drop-shadow-lg"
          style={{ right: `${12 + i * 22}px` }}
        >
          {REACTIONS[r.kind]}
        </span>
      ))}
    </div>
  );
}
