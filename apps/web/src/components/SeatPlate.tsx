"use client";

import type { Card } from "@game/mighty-engine";
import type { ReactNode } from "react";
import { cardLabel } from "@/game/terms";
import { PLATE_COMPACT_H, type Rect } from "@/layout/compute-layout";
import { cn } from "@/lib/cn";
import { SuitText } from "./SuitText";

import { Term } from "./TermHint";

interface SeatPlateProps {
  rect: Rect;
  name: string;
  handCount: number;
  /** 지금 차례 */
  active: boolean;
  /** 마이티: 딴 점수 카드(null이면 장수만). 주지 않으면 점수 카드 줄이 없다 */
  points?: Card[] | null;
  pointCount?: number;
  /** 마이티 돈(10배로 보인다). 주지 않거나 null이면 돈 줄을 숨긴다 */
  money?: number | null;
  declarer?: boolean;
  friend?: boolean;
  /** 이번 판을 이끄는 쪽(마이티 주공 편) */
  ruling?: boolean;
  /** 선(먼저 내는 사람) */
  leader?: boolean;
  /** 탈락 */
  dead?: boolean;
  /** 온라인 대전에서 연결이 끊겨 컴퓨터가 대신 두는 중 */
  offline?: boolean;
  /** 멘탈 포커 판: 컴퓨터가 대신할 수 없어 돌아오기를 기다린다 */
  waiting?: boolean;
  /** 내 기기가 이 자리의 부정을 찾았다 */
  accused?: boolean;
  bubble?: string | null;
  /** 포기했거나 다른 사람에게 밀린 공약 */
  bubbleDim?: boolean;
  /** 점수 카드를 글자 대신 장수로만 보인다 */
  compact?: boolean;
  /** 내 자리: 손패가 보이므로 장수를 빼고, 자리가 모자라면 한 줄로 줄인다 */
  mine?: boolean;
  /** 이름 옆에 더 붙일 표(예: 하트 넘기기를 골랐다는 ✓) */
  badges?: ReactNode;
  /**
   * 아래 줄에 게임마다 보일 것(하트 이번 판·합 점수, 화투 먹은 패 요약 등). 주면 마이티 점수 카드·돈 줄 대신
   * 이것을 그린다
   */
  extra?: ReactNode;
  /** 화면 읽기·시험용 이름표(예: 「민준 자리」) */
  label?: string;
}

/** 이보다 낮으면 한 줄로 줄인 판 */
const SLIM_H = 36;

function isRed(card: Card): boolean {
  return card.startsWith("H") || card.startsWith("D");
}

/**
 * 자리 판(마이티·하트 공통, 원카드·화투도 쓸 수 있다). 이름·장수·표와 아래 줄(마이티는 딴 점수 카드·돈,
 * 다른 게임은 `extra`)을 보여 준다. 다른 사람 손패 뒷면은 판 쪽이 자리 판 뒤에 펼친다(`fanSlot`)
 */
export function SeatPlate(props: SeatPlateProps) {
  const { rect } = props;
  const pointCount = props.pointCount ?? 0;
  const money = props.money ?? null;
  // 낮은 화면에서는 점수 카드 줄을 접어 한 줄로 보여 준다.
  const compact = rect.h < PLATE_COMPACT_H;
  // 내 자리 판을 줄였을 때는 이름·표시·점수 장수·돈을 한 줄에 놓는다.
  const slim = rect.h < SLIM_H;
  return (
    <SeatPlateFrame
      rect={rect}
      ruling={props.ruling ?? false}
      active={props.active}
      dead={props.dead ?? false}
      accused={props.accused ?? false}
      offline={props.offline ?? false}
      waiting={props.waiting ?? false}
      bubble={props.bubble ?? null}
      bubbleDim={props.bubbleDim ?? false}
      {...(props.label ? { label: props.label } : {})}
    >
      <div className={cn("flex items-center gap-1", slim && "h-full")}>
        <span className="min-w-[3.5em] truncate font-semibold">
          {props.name}
        </span>
        {props.declarer && (
          <Term
            id="declarer"
            className="shrink-0 whitespace-nowrap rounded bg-amber-400 px-1 text-[10px] text-black no-underline"
          >
            주공
          </Term>
        )}
        {props.friend && (
          <Term
            id="friend"
            className="shrink-0 whitespace-nowrap rounded bg-sky-300 px-1 text-[10px] text-black no-underline"
          >
            프렌드
          </Term>
        )}
        {props.leader && (
          <Term
            id="lead"
            className="shrink-0 whitespace-nowrap rounded bg-white/20 px-1 text-[10px] no-underline"
          >
            선
          </Term>
        )}
        {props.badges}
        {slim
          ? (pointCount > 0 || money !== null) && (
              <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] tabular-nums opacity-70">
                {pointCount > 0
                  ? `점수 ${pointCount}장${money !== null ? " · " : ""}`
                  : ""}
                {money !== null ? money * 10 : ""}
              </span>
            )
          : !props.mine && (
              <span
                className="ml-auto shrink-0 whitespace-nowrap tabular-nums opacity-80"
                title="남은 손패"
              >
                {props.dead ? "탈락" : `${props.handCount}장`}
              </span>
            )}
      </div>
      {slim ? null : props.extra !== undefined ? (
        props.extra
      ) : compact ? (
        <div className="flex items-center justify-between text-[10px] tabular-nums opacity-70">
          <span>{pointCount > 0 ? `점수 ${pointCount}장` : ""}</span>
          {money !== null && <span>{money * 10}</span>}
        </div>
      ) : (
        <>
          <div className="flex h-4 flex-nowrap items-center gap-0.5 overflow-hidden">
            {props.points == null || props.compact
              ? pointCount > 0 && (
                  <span className="opacity-80">점수 {pointCount}장</span>
                )
              : props.points.map((card) => (
                  <span
                    key={card}
                    className={cn(
                      "rounded bg-white px-0.5 text-[10px] leading-4 font-semibold",
                      isRed(card) ? "text-red-600" : "text-black",
                    )}
                  >
                    <SuitText text={cardLabel(card)} />
                  </span>
                ))}
          </div>
          {money !== null && (
            <div className="text-[10px] tabular-nums opacity-60">
              {money * 10}
            </div>
          )}
        </>
      )}
    </SeatPlateFrame>
  );
}

interface SeatPlateFrameProps {
  rect: Rect;
  /** 이번 판을 이끄는 사람(마이티 주공 쪽) */
  ruling?: boolean;
  /** 지금 차례 */
  active: boolean;
  dead?: boolean;
  accused?: boolean;
  offline?: boolean;
  waiting?: boolean;
  bubble?: string | null;
  bubbleDim?: boolean;
  children: ReactNode;
  /** 화면 읽기·시험용 이름표(예: 「민준 자리」) */
  label?: string;
  /** 판 안 내용 배치(기본: 위아래로 벌려 놓기) */
  className?: string;
}

/**
 * 둘러앉은 판의 자리 판 틀(마이티·화투 공통): 놓일 자리, 차례 빛, 탈락·부정 감지·연결 끊김 표, 말풍선.
 * 안의 내용(이름·장수·딴 카드)은 게임마다 넣는다
 */
export function SeatPlateFrame(props: SeatPlateFrameProps) {
  const { rect } = props;
  return (
    <div
      {...(props.label ? { role: "region", "aria-label": props.label } : {})}
      className={cn(
        "absolute flex flex-col justify-between overflow-visible rounded-xl border px-2 py-1 text-xs shadow-lg backdrop-blur-sm transition-[box-shadow,background-color,opacity] duration-300",
        props.ruling
          ? "border-amber-300/70 bg-amber-950/70"
          : "border-white/15 bg-black/45",
        props.active &&
          "shadow-[0_0_0_2px_#fde68a,0_0_20px_2px_rgba(253,230,138,0.55)]",
        props.dead && "opacity-40",
        props.accused &&
          "border-rose-400 shadow-[0_0_0_2px_#fb7185,0_0_22px_4px_rgba(244,63,94,0.6)]",
        props.className,
      )}
      // 손패 뒷면(z 1~13)보다 위, 카드 무대(손패 10~, 바닥 100~)와는 겹치지 않는다.
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        zIndex: 20,
      }}
    >
      {props.children}
      {props.accused ? (
        <div
          className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-rose-600 px-2 py-0.5 font-bold text-[10px] shadow"
          title="이 자리에서 규칙 위반이나 조작을 찾았습니다"
        >
          ⚠ 부정 감지
        </div>
      ) : (
        props.offline && (
          <div
            className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-rose-600 px-2 py-0.5 font-semibold text-[10px] shadow"
            title={
              props.waiting
                ? "연결이 끊겼습니다. 이 사람 카드는 이 사람만 열 수 있어 돌아오기를 기다립니다"
                : "연결이 끊겨 컴퓨터가 대신 둡니다"
            }
          >
            {props.waiting
              ? "연결 끊김 · 기다리는 중"
              : "연결 끊김 · 컴퓨터가 대신"}
          </div>
        )
      )}
      {props.bubble && (
        <div
          className={cn(
            "absolute -bottom-3 left-1/2 -translate-x-1/2 translate-y-full whitespace-nowrap rounded-full px-2 py-0.5 font-bold text-xs shadow transition-opacity",
            props.bubbleDim
              ? "bg-white/60 text-black/60"
              : "bg-white text-black",
          )}
        >
          <SuitText text={props.bubble} />
        </div>
      )}
    </div>
  );
}
