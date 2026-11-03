"use client";

import { useEffect, useRef, useState } from "react";

import { astronautOf, residentPhrase } from "../astronaut/identity";
import { greetNow } from "../greeting";
import { GAME_NS, getServices } from "../services";
import { BureauLogo } from "./BureauMarks";

/** 인사가 적어도 이만큼은 머문다(읽을 시간, 연출은 여유 있게) */
const HOLD_MS = 1300;
/** 물러나는 연출 길이(CSS sd-intro-leave와 같다) */
const LEAVE_MS = 700;
/** 장부가 이보다 늦으면 「하늘을 펴고 있습니다」(인사가 떠 있으면 인사 아래에, 없으면 빈 바탕 가운데에) */
export const SLOW_MS = 1800;

/**
 * 페이지를 불러올 때 우주국 인사를 보일지: 별 따기 화면 어디로 들어오든(새로 고침 포함) 장부를 기다리는 동안, 움직임
 * 줄이기가 아니면. 앱 안에서 화면을 오갈 때는 다시 나오지 않는다(StardrawApp이 처음 그릴 때 한 번만 묻는다).
 * 예전에는 탭 세션에 한 번, 홈으로 들어올 때만이었다. 휴대폰 브라우저는 탭이 며칠씩 살아 있어 첫날 한 번 뒤로는
 * 새로 고쳐도 인사가 없었고, 지금 회차 같은 다른 주소로 열면 빈 바탕만 보였다(2026-11-02 사용자, 휴대폰).
 * 화면 시험은 인사가 누르기를 가로채지 않게 `window.__stardrawNoIntro`로 끈다(e2e/test.ts)
 */
export function shouldShowIntro(): boolean {
  try {
    if ((window as { __stardrawNoIntro?: boolean }).__stardrawNoIntro)
      return false;
    return !matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** 인사의 로고·이름·문장 묶음(물러날 때 이 묶음이 위로 올라간다, CSS sd-intro-leave) */
function IntroShell({ children }: { children?: React.ReactNode }) {
  return (
    <div
      data-intro-shell
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <BureauLogo className="size-14 text-amber-200/85" />
      <span className="sd-intro-agency font-semibold text-amber-200/85 text-xs tracking-[0.35em]">
        카노푸스 우주국
      </span>
      {children}
    </div>
  );
}

/**
 * 장부를 기다리는 자리: 인사와 같은 밤하늘 바탕만 화면 전체에 깐다(정적 HTML에서부터 보인다).
 * 예전에는 여기에도 로고를 그려, 인사가 위에 뜨면 아래 줄 수가 달라 로고가 살짝 어긋나게 두 겹으로 보였다
 * (2026-11-02 사용자, 휴대폰). 인사가 뜨는 동안은 이 자리를 그리지 않는다(인사가 같은 바탕을 덮는다).
 * 인사 없이 들어왔는데 장부가 SLOW_MS보다 늦으면 「하늘을 펴고 있습니다」 한 줄만 조용히 띄운다
 */
export function SkyWait() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const late = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => window.clearTimeout(late);
  }, []);
  return (
    <div
      data-sky-wait
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#070d19]"
    >
      {slow && (
        <span className="text-sm text-white/50">하늘을 펴고 있습니다</span>
      )}
    </div>
  );
}

/**
 * 우주국 인사(2026-11-02 사용자: 홈에 들어오면 먼저 우주국 인사가 가운데 떠서 몰입감을 주고, 그 뒤 사이트가 펼쳐진다).
 * 장부를 받는 시간을 이 인사로 채운다. 장부가 준비되고 인사가 HOLD_MS 넘게 머물면 위로 물러나며 사라지고, 누르면 바로
 * 넘어간다(장부가 아직이면 준비되는 대로). 등록증은 이 기기에 있어 장부보다 먼저 읽는다
 */
export function IntroGate({
  ready,
  onLeave,
  onDone,
}: {
  /** 장부가 준비됐다 */
  ready: boolean;
  /** 물러나기 시작(뒤에서 홈이 펼쳐지기 시작한다) */
  onLeave: () => void;
  /** 다 사라졌다 */
  onDone: () => void;
}) {
  const [phrase, setPhrase] = useState<string | null | undefined>(undefined);
  const [held, setHeld] = useState(false);
  const [skip, setSkip] = useState(false);
  const [slow, setSlow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const left = useRef(false);

  useEffect(() => {
    try {
      const key = getServices(GAME_NS).wallet.loadKey();
      // 등록한 사람: 「○○에 거주하는 ○○ 님,」 + 시간대 인사(신분증 확인 뒤 창구 인사와 같은 모음, greeting.ts)
      setPhrase(
        key
          ? `${residentPhrase(astronautOf(key.pub))} 님, ${greetNow(Date.now(), "enter")}`
          : null,
      );
    } catch {
      setPhrase(null);
    }
    const hold = window.setTimeout(() => setHeld(true), HOLD_MS);
    const late = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(late);
    };
  }, []);

  // 물러난 뒤 부를 onDone은 늘 마지막 것으로
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const doneTimer = useRef<number | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 물러나는 것은 한 번뿐이다
  useEffect(() => {
    if (left.current || !ready || !(held || skip)) return;
    left.current = true;
    setLeaving(true);
    onLeave();
    // 타이머는 이 효과의 정리로 지우지 않는다. 물러나는 중에 held·skip이 바뀌면(인사를 일찍 누르고 1.3초가 지나면)
    // 정리가 타이머를 지우고 left 때문에 다시 걸지 않아, onDone이 끝내 불리지 않고 홈이 숨은 채 빈 화면으로 남았다
    // (2026-11-03 사용자, 맥 크롬)
    doneTimer.current = window.setTimeout(() => doneRef.current(), LEAVE_MS);
  }, [ready, held, skip]);
  useEffect(() => () => window.clearTimeout(doneTimer.current), []);

  return (
    // 누르면 넘어간다(키보드는 Enter·Space·Esc)
    <div
      role="dialog"
      aria-label="카노푸스 우주국 인사"
      data-intro={leaving ? "leave" : "hold"}
      tabIndex={-1}
      onClick={() => setSkip(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " " || e.key === "Escape")
          setSkip(true);
      }}
      className={
        leaving
          ? "sd-intro sd-intro-leave fixed inset-0 z-50 bg-[#070d19]"
          : "sd-intro fixed inset-0 z-50 bg-[#070d19]"
      }
    >
      <IntroShell>
        {phrase !== undefined && (
          <p className="sd-intro-line break-keep font-bold text-white/95 text-xl leading-snug">
            {phrase ? phrase : "카노푸스 우주국에 오신 것을 환영합니다."}
          </p>
        )}
        {slow && !ready && (
          <span className="text-sm text-white/50">하늘을 펴고 있습니다</span>
        )}
      </IntroShell>
    </div>
  );
}
