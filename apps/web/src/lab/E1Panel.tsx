"use client";

import { useEffect, useRef, useState } from "react";

import { diag, startDiag } from "@/net/diag";

import {
  collectFrames,
  deviceInfo,
  frameRate,
  summarizeTaps,
  type TapRecord,
  timerStep,
} from "./device-probe";
import { ExportButtons } from "./ExportButtons";

/** 누름 재기를 진단 기록으로 보내는 수 */
const TAPS_TO_SEND = 10;

/**
 * E1 기기 혼자(docs/43 5절). 열면 저절로 타이머 단위·주사율을 재고 진단 기록으로 보낸다.
 * 누름 칸을 누르면 `event.timeStamp` 단위, pointerdown과 click 차이, 입력 처리 지연을 더한다.
 */
export function E1Panel() {
  const [auto, setAuto] = useState<Record<string, unknown> | null>(null);
  const [taps, setTaps] = useState<TapRecord[]>([]);
  const pendingDown = useRef<{ index: number; ts: number } | null>(null);
  const sentTaps = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await startDiag("lab-reaction", { role: "host", game: "lab-reaction" });
      const timer = timerStep();
      const frames = frameRate(await collectFrames());
      if (cancelled) return;
      const result = {
        device: deviceInfo(),
        timer,
        frames,
        visibility: document.visibilityState,
      };
      setAuto(result);
      diag("lab-e1", result);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tapSummary = taps.length > 0 ? summarizeTaps(taps) : null;

  useEffect(() => {
    if (sentTaps.current || taps.length < TAPS_TO_SEND || !tapSummary) return;
    sentTaps.current = true;
    diag("lab-e1-taps", tapSummary);
  }, [taps, tapSummary]);

  const frames = auto?.frames as ReturnType<typeof frameRate> | undefined;
  const timer = auto?.timer as ReturnType<typeof timerStep> | undefined;

  return (
    <section className="flex flex-col gap-3" data-lab-e1>
      <h2 className="font-bold text-lg">기기 혼자 재기</h2>
      {auto ? (
        <dl
          className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm"
          data-lab-e1-done
        >
          <dt className="text-white/60">타이머 최소 간격</dt>
          <dd data-lab-timer-step>
            {timer?.minStepMs ?? "모름"} ms (서로 다른 간격{" "}
            {timer?.distinctSteps}
            가지)
          </dd>
          <dt className="text-white/60">화면 주사율</dt>
          <dd data-lab-hz>
            약 {frames?.hz ?? "?"} Hz (프레임 간격 중앙값{" "}
            {frames?.intervals.p50} ms, p95 {frames?.intervals.p95} ms)
          </dd>
          <dt className="text-white/60">브라우저</dt>
          <dd className="break-all text-xs">
            {String((auto.device as { ua: string }).ua)}
          </dd>
        </dl>
      ) : (
        <p className="text-sm text-white/70">재는 중…</p>
      )}

      <button
        type="button"
        data-lab-tap
        className="flex h-40 select-none items-center justify-center rounded-xl bg-white/10 text-lg active:bg-white/25"
        style={{ touchAction: "manipulation" }}
        onPointerDown={(event) => {
          const lag = performance.now() - event.timeStamp;
          const index = taps.length;
          pendingDown.current = { index, ts: event.timeStamp };
          setTaps((list) => [
            ...list,
            {
              downTs: event.timeStamp,
              handlerLagMs: lag,
              clickMinusDownMs: null,
              pointerType: event.pointerType,
            },
          ]);
        }}
        onClick={(event) => {
          const down = pendingDown.current;
          if (!down) return;
          pendingDown.current = null;
          setTaps((list) =>
            list.map((t, i) =>
              i === down.index
                ? { ...t, clickMinusDownMs: event.timeStamp - down.ts }
                : t,
            ),
          );
        }}
      >
        여기를 {TAPS_TO_SEND}번 눌러 주세요 ({taps.length})
      </button>
      {tapSummary && (
        <p className="text-sm" data-lab-taps>
          누름 시각 단위 {tapSummary.timeStampUnitMs ?? "?"} ms · 누르고
          떼기까지 중앙값 {tapSummary.clickMinusDown.p50 ?? "?"} ms · 처리 지연
          중앙값 {tapSummary.handlerLag.p50 ?? "?"} ms
        </p>
      )}
      <ExportButtons
        name="lab-e1"
        data={() => ({ e1: auto, taps, tapSummary })}
      />
    </section>
  );
}
