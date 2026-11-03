"use client";

import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/cn";
import { AstronautCard, BlankAstronautCard } from "../astronaut/AstronautCard";
import { astronautOf } from "../astronaut/identity";
import { EASE, EASE_OUT, FX } from "../fx-timing";
import { lockScroll } from "../scroll-lock";
import type { Services } from "../services";
import { useIssued } from "./AstronautPanel";
import { IdleHint, useIdleHint } from "./IdleHint";
import { useSwipeUp } from "./swipe-up";

/**
 * 등록증 자리: 아래에 숨음 / 가운데에서 지문 단추 누르기를 기다림 / 내밀어 살짝 떠오름 / 가운데 자리 잡음(확인 표시).
 * 기다릴 때와 자리 잡을 때가 같은 가운데라, 확인 뒤에는 떠오른 등록증이 제자리로 내려앉기만 한다
 */
export type CardSpot = "hidden" | "ready" | "lift" | "up";

/**
 * 신분증 제시 화면(입장·응모). Apple Pay의 카드 제시처럼 한 번에 하나씩: 위쪽 문구 → 인증 → 등록증이 아래에서 올라옴 →
 * 확인 표시 → (입장은 인사로 바뀌어 머묾) → 등록증이 아래로 내려감. 움직이는 것은 등록증뿐이고 문구는 고정 자리에서
 * 바뀐다. 차례와 시간은 부르는 쪽이 정한다(fx-timing의 FX). 화면 전체를 덮는 오버레이 층이라 탭바·메뉴가 가려지고
 * 뒤 화면은 조작되지 않는다. 응모처럼 이미 오버레이가 떠 있으면 `backdrop={false}`로 얹는다.
 * 움직임 줄이기면 부르는 쪽에서 아예 그리지 않는다
 */
export function IdFlyer({
  services,
  pub,
  card,
  checked = false,
  text,
  note,
  closing = false,
  backdrop = true,
  press,
  blank = false,
  help,
}: {
  /** 위쪽 문구 아래 안내(앱 안 브라우저에서 패스키가 실패했을 때 바깥 브라우저로 여는 안내) */
  help?: ReactNode;
  /** 아직 누구인지 모를 때(pub 없음) 실루엣 카드로 기다린다 */
  blank?: boolean;
  /**
   * 사람이 할 일이 있을 때만: 등록증 아래 지문 단추(「본인 확인」)를 누르면 `onPress`를 그 누름 안에서 바로 부른다
   * (패스키 창은 누름 직후에만 열리는 브라우저가 있다). 등록증 자체도 단추로 남아 밀어 올리거나 누르면(Enter·Space·↑도)
   * 같은 `onPress`. 작은 「취소」로 돌아간다. 기다리기만 하면 되는 때는 없다(docs/36 11-63)
   */
  press?:
    | { label: string; onPress: () => void; onCancel: () => void }
    | undefined;
  services: Services;
  /** 아직 누구인지 모르면(인증 전) null: 등록증 없이 문구만 */
  pub: Uint8Array | null;
  card: CardSpot;
  /** 인증이 끝나 확인 표시를 그린다 */
  checked?: boolean;
  /** 위쪽 고정 자리 문구(바뀌면 부드럽게 바뀐다) */
  text?: ReactNode;
  /** 위쪽 문구 아래 작은 글: 무엇을 위해 제시하는지와 무엇이 보이는지(회차 방 대화 등) */
  note?: ReactNode;
  /** 걷히는 중 */
  closing?: boolean;
  backdrop?: boolean;
}) {
  // 떠 있는 동안 뒤 화면은 스크롤되지 않는다
  useEffect(() => (backdrop ? lockScroll() : undefined), [backdrop]);
  const up = card === "up";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="우주인 등록증"
      data-id-flyer={up ? "shown" : "away"}
      className="sd-stage-pad fixed inset-0 z-[75] flex flex-col items-center"
      style={{
        opacity: closing ? 0 : 1,
        transition: `opacity ${FX.stageOut}ms ${EASE_OUT}`,
      }}
    >
      {backdrop && (
        <div
          aria-hidden="true"
          className="sd-stage-in absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(22,30,56,0.95),rgba(5,9,18,0.97))] backdrop-blur-md"
        />
      )}
      {text && (
        <p
          key={String(typeof text === "string" ? text : "")}
          aria-live="polite"
          className="sd-text-in relative min-h-14 break-keep px-6 text-center font-bold text-amber-100 text-lg"
        >
          {text}
        </p>
      )}
      {/* 앱 안 안내가 뜨면 작은 글은 걷는다(작은 휴대폰에서 등록증·지문 단추 자리가 모자라지 않게, 할 일은 안내가 말한다) */}
      {note && !help && (
        <p
          data-id-note
          className="sd-text-in relative -mt-6 max-w-sm break-keep px-6 text-center text-sm text-white/70 leading-relaxed"
        >
          {note}
        </p>
      )}
      {help && (
        <div data-id-help className="relative mt-2 w-full max-w-sm px-6">
          {help}
        </div>
      )}
      <div
        className={cn(
          // 남은 높이(cqh)에 맞춰 등록증 너비를 줄인다(작은 휴대폰에 위쪽 안내가 길게 붙어도 지문 단추와 겹치지 않게)
          "relative flex min-h-0 w-full flex-1 flex-col items-center justify-center [container-type:size]",
        )}
      >
        {(pub || blank) && (
          <FlyingCard
            services={services}
            pub={pub}
            spot={card}
            onPress={press?.onPress}
            label={press?.label}
          />
        )}
      </div>
      {/* 지문 단추와 확인 표시가 같은 자리를 나눠 쓴다(누르면 단추가 걷히고 그 자리에 확인 표시). 엄지가 닿는 화면 아래쪽,
          「취소」 바로 위에 둔다(2026-11-03 사용자: 삼성페이 결제처럼 더 아래에). 늘 자리를 차지해 단추가 생기고 사라져도
          등록증이 움직이지 않는다 */}
      <div className="relative mt-4 mb-14 h-[5.75rem] w-full shrink-0">
        <div className="absolute inset-x-0 top-0 flex justify-center">
          <CheckMark shown={checked} />
        </div>
        {press && card === "ready" && (
          <FingerButton label={press.label} onPress={press.onPress} />
        )}
      </div>
      {/* 자리를 차지하지 않게 아래에 띄운다(사라질 때 등록증이 밀리지 않게) */}
      {press && (
        <button
          type="button"
          onClick={press.onCancel}
          className="sd-text-in absolute left-1/2 -translate-x-1/2 rounded-xl px-4 py-2 text-sm text-white/60 hover:text-white"
          style={{
            bottom: "max(20px, calc(env(safe-area-inset-bottom, 0px) + 12px))",
          }}
        >
          취소
        </button>
      )}
    </div>
  );
}

/**
 * 지문 단추(2026-11-03 사용자: 신분증 화면에서 지문 인증을 해야 한다는 걸 알기 어려웠다). 둥근 단추 안 지문 그림과
 * 아래 작은 글자 「본인 확인」이 한 덩어리로 눌린다(PC는 지문 그림만으로 무엇인지 모를 수 있다). 누르면(Enter·Space도,
 * 단추라 브라우저가 click으로 바꾼다) `onPress`를 그 처리기 안에서 바로 부른다. 등록증이 가운데에 다 올라온 뒤 나타나고
 * (동시에 움직이지 않기), 은은하게 숨 쉬듯 빛난다. 가만히 있으면 그 위에 누르는 손짓이 나오고, 손짓이 움직이는 동안
 * 빛남은 멈춘다. 움직임 줄이기면 빛남도 멈춘다(globals.css). 우주인 등록 신청서의 지문 서명도 같은 단추를 같은 자리에 쓴다
 * (RegisterForm, docs/36 11-65)
 */
export function FingerButton({
  label,
  onPress,
  delay = FX.idIn,
}: {
  label: string;
  onPress: () => void;
  /** 나타나기 전 기다림(앞 물건이 다 올라온 뒤에 나타나게). 신분증은 등록증이 올라오는 시간 */
  delay?: number;
}) {
  const hint = useIdleHint(true);
  return (
    <button
      type="button"
      aria-label={`본인 확인으로 ${label}`}
      data-id-finger
      onClick={onPress}
      className="sd-finger-in absolute top-0 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 rounded-2xl px-3 pt-0.5 pb-1 text-amber-100 outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70"
      style={{ ["--finger-delay" as string]: `${delay}ms` }}
    >
      <span
        className="sd-finger-glow relative grid size-16 place-items-center rounded-full border border-amber-200/45 bg-amber-200/10"
        style={{ animationPlayState: hint ? "paused" : "running" }}
      >
        <FingerprintIcon className="size-9" />
        {/* 손끝(80칸 상자의 36.5, 19 자리)이 지문 가운데에 오게 */}
        {hint && (
          <span
            className="pointer-events-none absolute size-20"
            style={{ left: "calc(50% - 36.5px)", top: "calc(50% - 19px)" }}
          >
            <IdleHint kind="tap" shown />
          </span>
        )}
      </span>
      <span className="text-amber-100/85 text-xs">본인 확인</span>
    </button>
  );
}

/** 지문: 가운데 소용돌이를 둘러싼 고리들(PlaceIcons·손 그림과 같은 꼴: 24칸, 선 1.5, 글자색) */
function FingerprintIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M5.2 6.6A8.5 8.5 0 0 1 18.8 6.6" />
      <path d="M3.8 10.2a8.5 8.5 0 0 0-.3 2.3" />
      <path d="M20.2 10.2c.3 1 .4 2.1.3 3.3" />
      <path d="M6.5 16.5c-.4-1.2-.6-2.6-.5-4a6 6 0 0 1 12 0v1c0 1.8-.3 3.6-.9 5.2" />
      <path d="M8.8 19.6c-.8-1.8-1.3-3.7-1.3-5.6v-1.5a4.5 4.5 0 0 1 9 0v.8" />
      <path d="M9.5 12.5a2.5 2.5 0 0 1 5 0v1.5c0 2.3-.5 4.6-1.5 6.6" />
      <path d="M12 12.5v1.5c0 2.6-.6 5.1-1.8 7.4" />
      <path d="M16.3 16.8c-.3 1.4-.7 2.7-1.3 4" />
    </svg>
  );
}

/**
 * 움직이는 등록증. `onPress`가 있으면 등록증도 단추다(내 앞의 물건을 위로 내밀기: 밀어 올리거나 한 번 누르기).
 * 끄는 동안 손을 따라오고, 일정 거리·속도를 넘기거나 누르면 `onPress`를 그 동작 안에서 바로 부른다. 못 미치면 제자리.
 * 끌기 판정은 예측서와 같은 `useSwipeUp`(swipe-up.ts). 기다리는 동안 등록증은 가만히 있다(지문 단추가 빛나는 동안
 * 함께 떠오르지 않게)
 */
function FlyingCard({
  services,
  pub,
  spot,
  onPress,
  label,
}: {
  services: Services;
  /** 없으면 실루엣 카드(누구인지 모를 때). 확인되면 같은 자리에서 실제 등록증으로 바뀐다 */
  pub: Uint8Array | null;
  spot: CardSpot;
  onPress?: (() => void) | undefined;
  label?: string | undefined;
}) {
  const pressable = !!onPress && spot === "ready";
  const swipe = useSwipeUp(pressable, () => onPress?.());
  const drag = swipe.drag;
  /** 실루엣으로 기다렸으면 확인된 등록증은 칸마다 채워지며 나타난다 */
  const sawBlank = useRef(!pub);
  if (!pub) sawBlank.current = true;
  const transform =
    drag !== null
      ? `translateY(${drag}px) scale(0.98)`
      : spot === "lift"
        ? "translateY(-14px) scale(1.02)"
        : spot === "up" || spot === "ready"
          ? "translateY(0) scale(1)"
          : "translateY(110vh) scale(0.96)";
  const transition =
    drag !== null
      ? "none"
      : spot === "hidden"
        ? `transform ${FX.idOut}ms ${EASE_OUT}`
        : spot === "lift"
          ? `transform ${FX.idLift}ms ${EASE}`
          : `transform ${FX.idIn}ms ${EASE}`;
  return (
    // biome-ignore lint/a11y/useSemanticElements: 등록증 그림 전체를 끌어 올리는 덩어리라 button으로 감싸지 않는다
    <div
      role="button"
      aria-label={label ?? "우주인 등록증"}
      aria-disabled={!pressable}
      tabIndex={pressable ? 0 : -1}
      data-id-card-press={pressable || undefined}
      data-id-card
      {...swipe.handlers}
      onKeyDown={(e) => {
        if (pressable && ["Enter", " ", "ArrowUp"].includes(e.key)) {
          e.preventDefault();
          onPress?.();
        }
      }}
      className={cn(
        // 등록증 높이 = 너비 ÷ 1.586 + 아래 두께 자리(약 1.75rem). 7.25rem은 아래 지문 단추 자리와 사이 간격
        "relative w-[min(20rem,86vw,calc((100cqh_-_2rem)_*_1.586))] shrink-0 touch-none select-none rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.55)] outline-none",
        // 초점 테두리는 내밀기를 기다릴 때만(낸 뒤에는 남지 않게)
        pressable && "focus-visible:ring-2 focus-visible:ring-amber-200/70",
        pressable
          ? drag === null
            ? "cursor-grab"
            : "cursor-grabbing"
          : "pointer-events-none",
      )}
      style={{ transform, transition }}
    >
      <div className="pointer-events-none">
        {pub ? (
          <div className={cn(sawBlank.current && "sd-id-fill")}>
            <RealCard services={services} pub={pub} />
          </div>
        ) : (
          <BlankAstronautCard />
        )}
      </div>
    </div>
  );
}

function RealCard({ services, pub }: { services: Services; pub: Uint8Array }) {
  const a = useMemo(() => astronautOf(pub), [pub]);
  const issued = useIssued(services, pub);
  return <AstronautCard astronaut={a} issued={issued} clock={services.clock} />;
}

/** 확인 표시: 원이 그려지고 체크가 그어진다(Apple Pay의 완료 표시처럼) */
function CheckMark({ shown }: { shown: boolean }) {
  return (
    <svg
      viewBox="0 0 52 52"
      aria-hidden="true"
      data-id-check={shown || undefined}
      className={cn(
        // 보이지 않을 때도 자리를 차지해 아래로 내려가 기다리는 등록증과 겹친다: 누름을 받지 않는다
        "sd-check pointer-events-none size-12",
        shown && "sd-check-on",
      )}
      style={{ ["--check-ms" as string]: `${FX.idCheck}ms` }}
    >
      <circle
        cx="26"
        cy="26"
        r="23"
        fill="none"
        stroke="#6ee7b7"
        strokeWidth="2.5"
        pathLength={1}
        className="sd-check-circle"
      />
      <path
        d="M15 27 l7 7 l15 -16"
        fill="none"
        stroke="#6ee7b7"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="sd-check-tick"
      />
    </svg>
  );
}
