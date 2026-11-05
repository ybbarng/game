"use client";

import {
  canTakeOver,
  type GalaxyView,
  NUMBERS,
  rentOf,
  starAt,
  takeoverPriceOf,
} from "@game/galaxy-engine";
import { useLayoutEffect, useRef, useState } from "react";
import { StarGlyph } from "@/components/star/StarGlyph";
import { cn } from "@/lib/cn";
import {
  money,
  SEASON_NAMES,
  squareName,
  starFacts,
  starInfo,
} from "../format";
import { STAR_FACTS } from "../star-facts";
import { rentTable } from "./Decision";
import { ShipToken } from "./parts";
import { SEASON_KO, SeasonMark } from "./SeasonMark";

/**
 * 모퉁이·공문 칸 설명(2026-11-05 사용자 「특수칸의 역할을 잘 모르겠음」). 칸 카드와 옆 칸 정보가 같은 글을 쓴다
 */
export function cornerHelp(view: GalaxyView, square: number): string[] {
  const kind = view.board.squares[square]?.kind;
  switch (kind) {
    case "base":
      return [
        `출발 칸이에요. 지나가거나 멈추면 우주국 지원금 ${money(NUMBERS.salary)}을 받아요.`,
        `별빛이 ${money(NUMBERS.salaryFree)} 넘게 있으면 넘는 몫의 5분의 1만큼 덜 받아요.`,
      ];
    case "asteroid":
      return [
        "주사위를 굴려 여기 멈추면 아무 일도 없어요.",
        "우주국 공문 「궤도 이탈」을 받거나, 한 차례에 더블(주사위 두 개가 같은 숫자)이 세 번 연달아 나오면 여기에 걸려요.",
        `걸리면 다음 차례에 ${money(NUMBERS.asteroidFine)}을 내고 바로 나가 굴리거나, 주사위를 굴려 더블이 나오면 그 눈만큼 나가요. 더블이 아니면 그 차례는 쉬고, 그다음 차례에 그냥 나가요.`,
      ];
    case "observatory": {
      const amounts =
        NUMBERS.observatory[view.rules.players as 2 | 3 | 4] ?? [];
      const ranks = amounts
        .map((a, i) => `${i + 1}위 ${a > 0 ? money(a) : "없음"}`)
        .reverse()
        .join(" · ");
      return [
        "멈추면 관측 지원금을 받아요. 자산 순위가 낮을수록 많아요.",
        ranks,
      ];
    }
    case "comet":
      return [
        "멈추면 주사위를 한 번 더 굴려 그만큼 더 가요. 이때 더블(주사위 두 개가 같은 숫자)이 나와도 한 번 더 굴리지 않아요.",
      ];
    default:
      return [
        "멈추면 카노푸스 우주국 공문 한 장을 펴서 따라요.",
        "별빛을 받거나 내거나, 다른 칸으로 곧장 가요. 별 사실 공문은 가진 별의 실제 밝기·온도·거리로 계산해요.",
      ];
  }
}

/** 이 칸 별의 이용료 단계 글(칸 모양과 같은 단계) */
export function tierText(view: GalaxyView, square: number): string | null {
  const s = starAt(view.board, square);
  const owner = view.owners[square] ?? -1;
  if (!s || owner < 0) return null;
  const group = view.board.groups[s.group];
  const owned =
    group?.squares.filter((sq) => view.owners[sq] === owner).length ?? 0;
  const size = group?.squares.length ?? 3;
  const level = view.levels[square] ?? 1;
  const station =
    level >= 4 ? "큰 정거장" : level >= 2 ? `정거장 ${level}단` : null;
  const set =
    owned >= size
      ? "별자리 완성 · 이용료 2배"
      : owned >= 2
        ? "같은 별자리 둘 · 이용료 1.5배"
        : `별자리 별 ${owned}/${size}`;
  return station ? `${set} · ${station}` : set;
}

/**
 * 칸 카드: 누른 칸을 판 가운데에 크게 보인다(2026-11-05 사용자 「터치하면 그 칸을 확대해서 볼 수 있고 설명도」).
 * 별 칸은 별 그림·별자리·계절·값·주인·지금 이용료·이용료 표·같은 별자리 별·별 이야기, 모퉁이·공문은 하는 일
 */
export function SquareCard({
  view,
  square,
  name,
  onClose,
}: {
  view: GalaxyView;
  square: number;
  name: (seat: number) => string;
  onClose: () => void;
}) {
  const board = view.board;
  const s = starAt(board, square);
  const info = starInfo(board, square);
  return (
    <section
      data-square-card={square}
      aria-label={`${squareName(board, square)} 칸 카드`}
      className="galaxy-card pointer-events-auto relative flex max-h-full w-full flex-col overflow-y-auto rounded-2xl border border-sky-100/20 bg-slate-950/92 p-2.5 text-white shadow-[0_18px_50px_rgba(0,0,0,0.65)] backdrop-blur"
    >
      <div className="flex items-start gap-2.5 pr-5">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-slate-900/80">
          {s && info ? (
            <StarGlyph
              k={info.star.k}
              mag={info.star.mag}
              seed={square}
              base={44}
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-2xl">
              {board.squares[square]?.kind === "notice" ? "✉" : "✦"}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-black text-base leading-tight">
            {squareName(board, square)}
          </p>
          {s && info && (
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-sm text-white/75">
              {info.constellation}
              {board.groups[s.group]?.season && (
                <span
                  data-card-season
                  className="inline-flex items-center gap-0.5 rounded-full bg-white/8 px-1.5 text-xs"
                >
                  <SeasonMark
                    season={board.groups[s.group]?.season ?? null}
                    className="size-3"
                  />
                  {
                    SEASON_KO[
                      board.groups[s.group]?.season as keyof typeof SEASON_KO
                    ]
                  }{" "}
                  하늘
                </span>
              )}
              <span className="font-bold text-amber-200">
                {money(info.value)}
              </span>
            </p>
          )}
          {info && (
            <p
              data-star-line
              className="mt-0.5 text-[11px] text-sky-100/80 leading-snug"
            >
              {starFacts(info.star)}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="닫기"
          data-card-close
          onClick={onClose}
          className="absolute top-1 right-1 px-2 py-1 text-white/60 hover:text-white"
        >
          ✕
        </button>
      </div>
      {s && info ? (
        <StarBody view={view} square={square} name={name} />
      ) : (
        <div className="mt-2 flex flex-col gap-1 text-sm text-white/85 leading-snug">
          {cornerHelp(view, square).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
    </section>
  );
}

/** 남의 별에 멈춰 이용료를 낸 뒤 사들이는 값, 사들일 수 없으면 까닭(docs/48 2-8) */
function takeoverText(view: GalaxyView, square: number): string {
  if (canTakeOver(view, view.mySeat, square))
    return `멈추면 사들이기 ${money(takeoverPriceOf(view.board, square))}`;
  if (view.mortgaged[square]) return "맡긴 별이라 사들일 수 없어요";
  return "주인이 별자리를 완성해 사들일 수 없어요";
}

function StarBody({
  view,
  square,
  name,
}: {
  view: GalaxyView;
  square: number;
  name: (seat: number) => string;
}) {
  const board = view.board;
  const s = starAt(board, square);
  const info = starInfo(board, square);
  if (!s || !info) return null;
  const owner = view.owners[square] ?? -1;
  const rents = rentTable(view, square);
  const group = board.groups[s.group];
  const fact = STAR_FACTS[info.star.id];
  const tier = tierText(view, square);
  const inSeason =
    !view.meteor && view.season !== null && group?.home === view.season;
  return (
    <div className="mt-1.5 flex flex-col gap-1 text-sm">
      <div className="rounded-xl bg-white/5 px-2.5 py-1.5">
        {owner >= 0 ? (
          <>
            {/* 한 줄: 주인과 지금 이용료. 다음 줄: 단계·사들이기 */}
            <p className="flex flex-wrap items-center gap-x-1.5">
              <ShipToken seat={owner} size={11} />
              <span className="font-semibold">{name(owner)}의 별</span>
              {view.mortgaged[square] && (
                <span className="text-white/50 text-xs">· 맡김</span>
              )}
              <span className="ml-auto">
                지금 이용료{" "}
                <span
                  data-card-rent
                  className="font-black text-amber-200 text-base tabular-nums"
                >
                  {money(rentOf(view, square))}
                </span>
              </span>
            </p>
            {(inSeason || view.meteor) && (
              <p className="text-right text-amber-100/70 text-xs">
                {view.meteor
                  ? "유성우의 밤 2배"
                  : `${SEASON_NAMES[view.season ?? 0]} 제철 1.5배`}
              </p>
            )}
            <p className="mt-0.5 text-white/70 text-xs leading-snug">
              {tier && <span data-card-tier>{tier}</span>}
              {tier && owner !== view.mySeat && view.rules.takeover && " · "}
              {owner !== view.mySeat && view.rules.takeover && (
                <span data-card-takeover>{takeoverText(view, square)}</span>
              )}
            </p>
          </>
        ) : (
          <p className="text-white/70">
            주인 없는 별 · 멈춘 사람이 {money(info.value)}에 살 수 있어요.
          </p>
        )}
      </div>
      {rents && (
        <dl
          data-card-rents
          className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[11px] text-white/60 tabular-nums"
        >
          {(
            [
              ["1단", rents.single],
              ["별 둘", rents.pair],
              ["완성", rents.complete],
              ["2단", rents.level2],
              ["3단", rents.level3],
              ["큰 정거장", rents.grand],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-1">
              <dt>{k}</dt>
              <dd className="text-white/85">{money(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {group && (
        <ul className="flex flex-wrap gap-1" aria-label="같은 별자리 별">
          {group.squares.map((sq) => {
            const o = view.owners[sq] ?? -1;
            return (
              <li
                key={sq}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-1.5 text-[11px] leading-5",
                  sq === square
                    ? "border-sky-200/60 bg-sky-200/10"
                    : "border-white/10",
                )}
              >
                {o >= 0 ? <ShipToken seat={o} size={11} /> : <span>·</span>}
                {squareName(board, sq)}
              </li>
            );
          })}
        </ul>
      )}
      {fact && <StarStory key={square} text={fact} />}
    </div>
  );
}

/**
 * 별 이야기: 두 줄까지 보이고 넘치면 「더 보기」로 편다. 휴대폰 세로에서 칸 카드가 판 안쪽에 스크롤 없이 들어가게
 * (2026-11-05 사용자 「스크롤해야 하는 거 조금 불편」)
 */
function StarStory({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setLong(el.scrollHeight > el.clientHeight + 1);
  }, [open]);
  return (
    <div data-star-story={open ? "open" : "short"} className="relative">
      <p
        ref={ref}
        className={cn(
          "text-white/75 text-xs leading-relaxed",
          !open && "line-clamp-2",
        )}
      >
        {text}
      </p>
      {/* 둘째 줄 끝에 겹쳐 둔다(줄을 하나 더 쓰지 않게) */}
      {long && !open && (
        <button
          type="button"
          data-star-more
          onClick={() => setOpen(true)}
          className="absolute right-0 bottom-0 bg-[linear-gradient(90deg,transparent,rgb(2_6_23)_1.2rem)] pl-6 text-sky-200/90 text-xs leading-relaxed underline-offset-2 hover:underline"
        >
          더 보기
        </button>
      )}
    </div>
  );
}
