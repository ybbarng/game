"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import { Seal } from "../astronaut/marks";
import { BureauLogo, WaxSeal } from "./BureauMarks";
import { StageOverlay, useReducedMotion } from "./StageOverlay";

/** 생애 첫 방문에 편지를 저절로 연 적이 있는지(이 기기). 한 번 열면 그 뒤로는 홈의 봉투로만 연다 */
const AUTO_KEY = "stardraw-letter-auto";

/** 생애 첫 방문이라 편지를 저절로 열 차례인지(읽기만, 움직임 줄이기면 아니다) */
export function letterAutoPending(): boolean {
  try {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    return !localStorage.getItem(AUTO_KEY);
  } catch {
    return false;
  }
}

function takeAutoLetter(): boolean {
  try {
    if (localStorage.getItem(AUTO_KEY)) return false;
    localStorage.setItem(AUTO_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/** 봉투가 열리는 연출(덮개 젖힘 → 봉투 물러남) 길이. CSS sd-env-open과 맞춘다 */
const OPEN_MS = 1200;

/**
 * 처음 온 사람(이 기기에 등록증이 없음)에게 카노푸스 우주국이 보낸 편지(docs/36 11-34). 입구에는 봉투만 두고,
 * 열면 봉투가 열리며 편지지가 펼쳐진다(2026-11-02 사용자). 오버레이 편지 아래에서 바로 우주인 등록(패스키는 누른 순간에
 * 불러야 해서 등록 기능 곁에 둔다). 입구(첫 화면)와 등록증 없이 연 응모 화면이 같이 쓴다.
 * 생애 첫 방문(`autoOpen`)에는 우주국 인사 뒤 저절로 열고, 닫히면 홈이 펼쳐진다(`onClosed`).
 * 움직임 줄이기면 오버레이 대신 그 자리에서 펼친다(등록 단추는 바로 아래 입구 것을 쓴다)
 */
export function BureauWelcome({
  cadence,
  onRegister,
  autoOpen = false,
  onClosed,
}: {
  cadence: string;
  /** 편지 아래 「우주인 등록」(없으면 단추 없이 닫기만) */
  onRegister?: () => void;
  /** 생애 첫 방문이면 저절로 연다(이 기기에서 한 번) */
  autoOpen?: boolean;
  /** 저절로 연 편지가 닫혔다(등록을 눌렀거나 둘러보기) */
  onClosed?: (() => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [auto, setAuto] = useState(false);
  const reduce = useReducedMotion();
  const asked = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 저절로 열 차례가 오면 한 번만 정한다
  useEffect(() => {
    if (!autoOpen || asked.current) return;
    asked.current = true;
    if (takeAutoLetter()) {
      setAuto(true);
      setOpen(true);
    } else onClosed?.();
  }, [autoOpen]);
  const close = () => {
    setOpen(false);
    if (auto) {
      setAuto(false);
      onClosed?.();
    }
  };
  const register = onRegister
    ? () => {
        close();
        onRegister();
      }
    : undefined;
  return (
    <section
      aria-label="카노푸스 우주국 편지"
      data-gate
      className="sd-glass flex flex-col items-center gap-3 rounded-3xl px-5 py-5 text-center"
    >
      <p className="font-semibold text-amber-100">
        카노푸스 우주국에서 편지가 왔어요.
      </p>
      {open && reduce ? (
        <Letter cadence={cadence} />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-letter-envelope
          aria-label="우주국 편지 열기"
          className="sd-envelope sd-letter-envelope flex h-28 w-48 flex-col items-center justify-end rounded-xl pb-3 text-slate-900"
        >
          <span className="-translate-x-1/2 -translate-y-1/2 absolute top-[46%] left-1/2">
            <WaxSeal className="sd-env-seal block size-8" />
          </span>
          <span className="text-[11px] text-slate-600">처음 오신 우주인께</span>
          <span className="font-bold">편지 열기</span>
        </button>
      )}
      {open && !reduce && (
        <StageOverlay label="카노푸스 우주국 편지" align="center" scroll>
          <LetterStage cadence={cadence} fromTop={auto}>
            {register && (
              <button
                type="button"
                onClick={register}
                className="sd-cta w-full max-w-xs rounded-2xl py-3 font-black text-lg text-slate-950"
              >
                우주인 등록
              </button>
            )}
            <button
              type="button"
              onClick={close}
              data-letter-close
              className="text-sm text-white/70 underline underline-offset-2"
            >
              {auto ? "먼저 둘러볼게요" : "닫기"}
            </button>
          </LetterStage>
        </StageOverlay>
      )}
    </section>
  );
}

/**
 * 봉투에서 편지를 꺼내는 연출(2026-11-02 사용자): 봉투가 위에서 내려와 가운데 멈추고(`arrive`), 누르면 덮개가 젖혀지며
 * 봉인이 풀리고(`open`) 편지지가 올라와 펼쳐진다(`letter`). 홈의 봉투를 눌러 열었으면 이미 누른 셈이라 `open`부터
 */
function LetterStage({
  cadence,
  fromTop,
  children,
}: {
  cadence: string;
  /** 위에서 내려와 누르기를 기다린다(생애 첫 방문에 저절로 열 때) */
  fromTop: boolean;
  children: React.ReactNode;
}) {
  const [stage, setStage] = useState<"arrive" | "open" | "letter">(
    fromTop ? "arrive" : "open",
  );
  useEffect(() => {
    if (stage !== "open") return;
    const t = window.setTimeout(() => setStage("letter"), OPEN_MS);
    return () => window.clearTimeout(t);
  }, [stage]);
  if (stage !== "letter")
    return (
      <div className="flex min-h-[60dvh] w-full items-center justify-center">
        <button
          type="button"
          onClick={() => setStage("open")}
          disabled={stage === "open"}
          aria-label="편지 꺼내기"
          data-letter-stage={stage}
          className={cn(
            "sd-envelope sd-letter-envelope flex h-40 w-64 flex-col items-center justify-end rounded-xl pb-4 text-slate-900",
            stage === "arrive" ? "sd-env-drop" : "sd-env-open",
          )}
        >
          <span className="-translate-x-1/2 -translate-y-1/2 absolute top-[46%] left-1/2">
            <WaxSeal className="sd-env-seal block size-10" />
          </span>
          <span className="text-slate-600 text-xs">처음 오신 우주인께</span>
        </button>
      </div>
    );
  return (
    <div
      className="flex w-full flex-col items-center gap-4"
      data-letter-stage="letter"
    >
      <Letter cadence={cadence} unfold />
      {children}
    </div>
  );
}

const DATE = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Seoul",
});

/** 편지지: 우주국 머리글, 우주국장의 짧은 편지, 날짜와 직인 */
function Letter({
  cadence,
  unfold = false,
}: {
  cadence: string;
  /** 위에서부터 펼쳐지며 나타난다(봉투 연출 뒤) */
  unfold?: boolean;
}) {
  return (
    <article
      data-letter
      className={cn(
        "sd-letter-paper relative mx-auto flex w-full max-w-md flex-col gap-3 break-keep rounded-[3px] px-6 pt-5 pb-7 text-left text-[15px] text-stone-800 leading-[1.85]",
        unfold ? "sd-letter-unfold" : "sd-text-in",
      )}
    >
      <header className="flex flex-col items-center gap-1 pb-1">
        <BureauLogo className="size-11 text-stone-700" />
        <span className="font-semibold text-[13px] text-stone-700 tracking-[0.3em]">
          카노푸스 우주국
        </span>
        <span
          aria-hidden="true"
          className="block h-[3px] w-full border-stone-500/50 border-y"
        />
      </header>
      <p className="font-bold">처음 오신 우주인께.</p>
      <p>
        카노푸스 우주국은 오랜 관측 끝에, 서울 하늘의 밝은 별 45개 가운데{" "}
        {cadence} 6개가 빛난다는 것을 알아냈습니다. 그러나 다음에 빛날 별을 미리
        맞히는 일은 말 그대로 하늘의 별 따기였습니다.
      </p>
      <p>
        그래서 우주국은 다음에 빛날 별을 가장 잘 예측하는 우주인을 찾고
        있습니다. 별을 맞혀 보고 싶은 분이라면 누구든 반갑게 맞이하겠습니다.
        우주인으로 등록하시면 곧바로 예측서를 내실 수 있습니다.
      </p>
      <p>같은 하늘 아래에서 함께 별을 지켜보게 되기를 바랍니다.</p>
      <p className="self-end pt-2 text-[13px] text-stone-600">
        {DATE.format(new Date())}
      </p>
      <p className="relative self-end pr-9 font-semibold tracking-wide">
        카노푸스 우주국장
        <Seal className="-right-3 -top-4 absolute size-14 rotate-[-8deg] opacity-90 mix-blend-multiply" />
      </p>
    </article>
  );
}
