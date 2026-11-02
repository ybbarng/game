"use client";

import { useState } from "react";
import { StageOverlay, useReducedMotion } from "./StageOverlay";

/**
 * 처음 온 사람(이 기기에 등록증이 없음)에게 카노푸스 우주국이 보낸 편지(docs/36 11-34). 입구에는 봉투만 두고,
 * 열면 우주국이 찾은 여섯 별, 그것을 맞히는 일이 하늘의 별 따기라는 것, 가장 잘 예측하는 우주인을 찾는다는 것을
 * 편지지로 보인다(2026-11-02 사용자: 입구 문구가 길다). 오버레이 편지 아래에서 바로 우주인 등록. 입구(첫 화면)와 등록증 없이
 * 연 응모 화면이 같이 쓴다. 움직임 줄이기면 오버레이 대신 그 자리에서 펼친다(등록 단추는 바로 아래 입구 것을 쓴다)
 */
export function BureauWelcome({
  cadence,
  onRegister,
}: {
  cadence: string;
  /** 편지 아래 「우주인 등록」(없으면 단추 없이 닫기만) */
  onRegister?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const register = onRegister
    ? () => {
        setOpen(false);
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
          <span className="text-[11px] text-slate-600">우주인 후보께</span>
          <span className="font-bold">편지 열기</span>
        </button>
      )}
      {open && !reduce && (
        <StageOverlay label="카노푸스 우주국 편지" align="center" scroll>
          <div className="flex flex-col items-center gap-4">
            <Letter cadence={cadence} />
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
              onClick={() => setOpen(false)}
              className="text-sm text-white/70 underline underline-offset-2"
            >
              닫기
            </button>
          </div>
        </StageOverlay>
      )}
    </section>
  );
}

/** 편지지. 우주국장의 짧은 편지 */
function Letter({ cadence }: { cadence: string }) {
  return (
    <article
      data-letter
      className="sd-text-in mx-auto flex w-full max-w-md flex-col gap-3 break-keep rounded-sm bg-[#f3eedf] px-6 py-6 text-left text-[15px] text-slate-800 leading-relaxed shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
    >
      <p className="font-bold">우주인 후보께.</p>
      <p>
        카노푸스 우주국은 오랜 관측 끝에, 서울 하늘의 밝은 별 45개 가운데{" "}
        {cadence} 6개가 빛난다는 것을 알아냈습니다. 그러나 다음에 빛날 별을 미리
        맞히는 일은 말 그대로 하늘의 별 따기였습니다.
      </p>
      <p>
        그래서 우주국은 다음에 빛날 별을 가장 잘 예측하는 우주인을 찾습니다.
        우주인으로 등록하고 답안지를 내 주세요.
      </p>
      <p className="self-end font-semibold">카노푸스 우주국장</p>
    </article>
  );
}
