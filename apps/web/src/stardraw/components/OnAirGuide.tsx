"use client";

import { acceptFrom, DRAND_DELAY, roundTimes } from "@game/stardraw-core";

import { roundShort } from "../round-label";
import type { Services } from "../services";

const CLOCK = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const clock = (s: number) => CLOCK.format(new Date(s * 1000));

/**
 * 관측 방송 안내(2026-11-02 사용자): 관측 시간에는 홈도 관측지를 보여서, 처음 온 사람도 지금 무엇을 하는 시간인지
 * 알 수 있게 관측지 머리(장소·회차) 아래에 짧게 풀어 둔다. 다음 회차 시간표 한 줄과, 등록증이 없으면 우주인 등록 단추.
 * 등록증이 있는 사람에게는 다음 회차 한 줄만. 그 줄은 「다음 회차」로 시작한다: 이름만 있으면 관측이 시작되기 전에는
 * 지금 보는 회차보다 먼저 눈에 들어와 아직 열리지 않은 접수 시각이 지금 회차 것처럼 읽혔다(2026-11-02 사용자 휴대폰)
 */
export function OnAirGuide({
  services,
  round,
  hasKey,
  onRegister,
}: {
  services: Services;
  /** 지금 관측 중인 회차 */
  round: number;
  hasKey: boolean;
  onRegister: () => void;
}) {
  const schedule = services.ledger.schedule;
  const next = round + 1;
  const nextTimes = roundTimes(schedule, next);
  const opens = acceptFrom(schedule, next);
  return (
    <aside
      aria-label="관측 안내"
      data-on-air={round}
      className="flex flex-col gap-2.5 rounded-2xl border border-amber-200/25 bg-amber-300/[0.06] px-4 py-3"
    >
      {!hasKey && (
        <p className="break-keep text-sm text-white/85 leading-relaxed">
          카노푸스 우주국이 지금 {roundShort(schedule, round)}의 여섯 별을
          관측하고 있습니다. 모두 함께 지켜보는 이 1분이 지나면 다음 회차 예측이
          열립니다.
        </p>
      )}
      <div className="flex items-center gap-3">
        <p
          data-on-air-next={next}
          className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-sm tabular-nums"
        >
          <span className="text-white/55">다음 회차</span>
          <span className="font-semibold">{roundShort(schedule, next)}</span>
          <span className="text-white/70">
            예측 접수 {clock(opens)} ~ {clock(nextTimes.entryDeadline)}
          </span>
          <span className="text-white/50">
            관측 {clock(nextTimes.closesAt + DRAND_DELAY)}
          </span>
        </p>
        {!hasKey && (
          <button
            type="button"
            onClick={onRegister}
            className="sd-cta shrink-0 rounded-xl px-3.5 py-2 font-bold text-slate-950 text-sm"
          >
            우주인 등록
          </button>
        )}
      </div>
    </aside>
  );
}
