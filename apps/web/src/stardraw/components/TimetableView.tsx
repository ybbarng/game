"use client";

import { cn } from "@/lib/cn";

import type { LedgerStatus } from "../local-ledger";
import { roundShort } from "../round-label";
import type { Services } from "../services";
import {
  type TimetableRow,
  type TimetableState,
  timetable,
} from "../timetable";
import { watchRound } from "./BroadcastToast";
import { liveDrawRound } from "./RoomView";

const CLOCK = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const DAY = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "short",
});
const clock = (s: number) => CLOCK.format(new Date(s * 1000));
const day = (s: number) => DAY.format(new Date(s * 1000));

const STATE_LABEL: Record<TimetableState, string | null> = {
  upcoming: null,
  open: "예측 접수 중",
  closed: "마감",
  observing: "관측 중",
};

/** 회차 길이를 사람 말로: 3600 → "1시간", 1200 → "20분" */
function lengthWord(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}시간`;
  return `${Math.round(seconds / 60)}분`;
}

/**
 * 관측 시간표(/stardraw/timetable, 2026-11-02 사용자): 지금 회차부터 앞으로의 예측 접수·관측 시각.
 * 장부 규칙상 바뀔 수 없는 회차까지는 그대로, 그 뒤 예정 회차 앞에 공식 안내 문구를 둔다
 */
export function TimetableView({
  services,
  status,
}: {
  services: Services;
  status: LedgerStatus;
}) {
  const schedule = services.ledger.schedule;
  const lastRecord = services.ledger.closed().at(-1)?.record.round ?? 0;
  const observing = watchRound(services, status);
  const live = liveDrawRound(services, status) !== null;
  const table = timetable(
    schedule,
    lastRecord,
    status.now,
    status.round,
    observing,
    live,
  );
  const fixedRows = table.rows.filter((r) => r.fixed);
  const plannedRows = table.rows.filter((r) => !r.fixed);

  return (
    <section className="flex flex-col gap-4" aria-label="관측 시간표">
      <h2 className="text-center font-bold text-lg">관측 시간표</h2>
      {table.change && (
        <p
          data-timetable-change={table.change.fromRound}
          className="break-keep rounded-xl border border-amber-200/30 bg-amber-300/5 px-4 py-3 text-amber-100 text-sm"
        >
          {roundShort(schedule, table.change.fromRound)}부터 관측이{" "}
          {lengthWord(table.change.length)}마다로 바뀝니다.
        </p>
      )}
      <Rows rows={fixedRows} schedule={schedule} />
      {plannedRows.length > 0 && (
        <>
          <p
            data-timetable-planned={plannedRows[0]?.round}
            className="flex items-center gap-3 text-white/55 text-xs"
          >
            <span aria-hidden="true" className="h-px flex-1 bg-white/15" />
            <span className="break-keep text-center">
              이후 일정은 우주국 사정에 따라 변경될 수 있습니다.
            </span>
            <span aria-hidden="true" className="h-px flex-1 bg-white/15" />
          </p>
          <Rows
            rows={plannedRows}
            schedule={schedule}
            planned
            before={fixedRows.at(-1)}
          />
        </>
      )}
      <p className="break-keep text-center text-white/45 text-xs">
        일정을 바꿀 때는 세 회차 앞서 장부에 예고합니다.
      </p>
    </section>
  );
}

function Rows({
  rows,
  schedule,
  planned = false,
  before,
}: {
  rows: TimetableRow[];
  schedule: Services["ledger"]["schedule"];
  planned?: boolean;
  /** 앞 목록의 마지막 줄(같은 날이면 날짜를 다시 적지 않는다) */
  before?: TimetableRow | undefined;
}) {
  return (
    <ol className="flex flex-col gap-2">
      {rows.map((r, i) => {
        const prev = i === 0 ? before : rows[i - 1];
        const newDay = !prev || day(prev.opensAt) !== day(r.opensAt);
        const label = STATE_LABEL[r.state];
        const now = r.state !== "upcoming";
        return (
          <li key={r.round} className="flex flex-col gap-2">
            {newDay && (
              <span className="pt-1 pl-1 text-white/50 text-xs">
                {day(r.opensAt)}
              </span>
            )}
            <div
              data-timetable-round={r.round}
              data-state={r.state}
              data-fixed={r.fixed ? "1" : "0"}
              className={cn(
                "flex items-center gap-3 rounded-2xl border px-4 py-3 tabular-nums",
                now
                  ? "sd-glass border-amber-200/35"
                  : planned
                    ? "border-white/10 border-dashed text-white/60"
                    : "border-white/10 bg-white/[0.03]",
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2 font-semibold">
                  {now && (
                    <span
                      aria-hidden="true"
                      className="sd-live-dot"
                      data-live={r.state === "open" ? "open" : "drawing"}
                    />
                  )}
                  {roundShort(schedule, r.round)}
                  {label && (
                    <span className="rounded-full bg-amber-200/15 px-2 py-0.5 font-normal text-amber-100 text-xs">
                      {label}
                    </span>
                  )}
                </span>
                <span className="text-sm text-white/65">
                  예측 접수 {clock(r.opensAt)} ~ {clock(r.deadline)}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-white/50 text-xs">관측</span>
                <span className="font-bold font-mono text-lg">
                  {clock(r.observeAt)}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
