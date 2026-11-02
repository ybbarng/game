"use client";

import { useEffect, useRef, useState } from "react";

import { astronautOf, residentPhrase } from "../astronaut/identity";
import { GAME_NS, getServices } from "../services";

/** 인사가 적어도 이만큼은 머문다(읽을 시간, 연출은 여유 있게) */
const HOLD_MS = 1300;
/** 물러나는 연출 길이(CSS sd-intro-leave와 같다) */
const LEAVE_MS = 700;
/** 장부가 이보다 늦으면 인사 아래에 「하늘을 펴고 있습니다」 */
const SLOW_MS = 1800;

const SEEN_KEY = "stardraw-intro-seen";

/**
 * 첫 화면에 들어올 때 우주국 인사를 보일지: 한 방문(탭 세션)에 한 번, 홈으로 들어왔을 때만, 움직임 줄이기가 아니면.
 * 정한 순간 본 것으로 적는다(같은 탭에서 다른 화면을 오가거나 홈 탭을 눌러도 다시 나오지 않는다)
 */
export function shouldShowIntro(): boolean {
  try {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    if (sessionStorage.getItem(SEEN_KEY)) return false;
    sessionStorage.setItem(SEEN_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/** 장부를 기다리는 자리(정적 HTML에서부터 같은 자리·모양이라 인사로 넘어갈 때 튀지 않는다) */
export function IntroShell({ children }: { children?: React.ReactNode }) {
  return (
    <div
      data-intro-shell
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <span className="sd-intro-agency font-semibold text-amber-200/85 text-xs tracking-[0.35em]">
        카노푸스 우주국
      </span>
      {children}
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
      setPhrase(key ? residentPhrase(astronautOf(key.pub)) : null);
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: 물러나는 것은 한 번뿐이다
  useEffect(() => {
    if (left.current || !ready || !(held || skip)) return;
    left.current = true;
    setLeaving(true);
    onLeave();
    const t = window.setTimeout(onDone, LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [ready, held, skip]);

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
            {phrase
              ? `${phrase} 님, 반갑습니다.`
              : "카노푸스 우주국에 오신 것을 환영합니다."}
          </p>
        )}
        {slow && !ready && (
          <span className="text-sm text-white/50">하늘을 펴고 있습니다</span>
        )}
      </IntroShell>
    </div>
  );
}
