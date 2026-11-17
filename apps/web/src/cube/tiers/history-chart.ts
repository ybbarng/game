/**
 * 티어 이력 그래프의 자리 셈(docs/47 14-8). 사이트 `TierHistoryChart.tsx`(SVG)와 앱 `TierHistoryView`(Core Graphics)가 같은
 * 자리에 그리도록 순수 함수로 둔다(앱 `apps/cubie/Sources/CubieCore/TierHistoryLayout.swift`가 같은 셈, 같은 시험 값).
 *
 * - 가로: 판 차례(오래된 판이 왼쪽). 날짜가 바뀌는 판에 「11/15」 눈금, 앞 눈금과 40px 안이면 건너뛴다.
 * - 세로: 그 판까지의 최고 5판 평균, 빠를수록 위. 시간은 로그 눈금(구간 상한이 비율로 나뉘어 띠 두께가 고르다).
 * - 뒤에 티어 띠(티어 색, 띠가 11px 이상이면 오른쪽 끝에 이름), 선은 계단(최고값은 좋아질 때만 바뀐다), 티어가 바뀐 판에 점.
 */
import type { TierChange, TierHistoryPoint } from "./rank";
import { placeAt, tierName } from "./rank";
import { TIER_TABLE, type TierId } from "./table";

export const CHART_PAD = { left: 8, right: 76, top: 8, bottom: 22 } as const;
/** 날짜 눈금 사이 가장 좁은 간격(px) */
export const TICK_GAP = 40;
/** 띠 이름을 적는 가장 얇은 띠(px) */
export const BAND_LABEL_MIN = 11;

export interface ChartBand {
  tier: TierId;
  /** 위·아래 y(px) */
  y0: number;
  y1: number;
  /** 띠 끝에 이름을 적는가 */
  label: boolean;
}

export interface ChartLayout {
  width: number;
  height: number;
  plot: { x: number; y: number; w: number; h: number };
  bands: ChartBand[];
  /** 계단 선의 꺾이는 점들 */
  line: [number, number][];
  /** 티어가 바뀐 판의 점 */
  dots: [number, number][];
  /** 날짜 눈금. 그림 칸 끝에 가까우면 글을 안쪽으로 붙인다(잘리지 않게) */
  ticks: { x: number; label: string; anchor: "start" | "middle" | "end" }[];
}

/** 「11/15」(이 기기 시간대) */
export function monthDay(at: number): string {
  const d = new Date(at);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** 바뀐 순간 한 줄: 「11/15 브론즈 III → 브론즈 II」, 첫 티어는 「11/12 아이언 I」 */
export function changeLine(
  c: TierChange,
  dateOf: (at: number) => string = monthDay,
): string {
  const to = tierName(c.to);
  return c.from
    ? `${dateOf(c.at)} ${tierName(c.from)} → ${to}`
    : `${dateOf(c.at)} ${to}`;
}

/** 그림 설명(화면 읽기용): 「3×3 티어 이력, 11판. 아이언 I에서 브론즈 II까지 올랐어요.」 */
export function chartLabel(
  n: number,
  history: {
    points: readonly TierHistoryPoint[];
    changes: readonly TierChange[];
  },
): string {
  const { points, changes } = history;
  const first = changes[0];
  const last = changes[changes.length - 1];
  const head = `${n}×${n} 티어 이력, ${points.length}판.`;
  if (!first || !last) return head;
  return first === last
    ? `${head} 지금 ${tierName(last.to)}.`
    : `${head} ${tierName(first.to)}에서 ${tierName(last.to)}까지.`;
}

/** 판이 하나도 5판 평균을 갖지 않으면 null */
export function chartLayout(
  n: number,
  history: {
    points: readonly TierHistoryPoint[];
    changes: readonly TierChange[];
  },
  width: number,
  height: number,
  dateOf: (at: number) => string = monthDay,
): ChartLayout | null {
  const { points, changes } = history;
  const vals = points.map((p) => p.ms).filter((v): v is number => v !== null);
  const table = TIER_TABLE[n];
  if (vals.length === 0 || !table) return null;
  const plot = {
    x: CHART_PAD.left,
    y: CHART_PAD.top,
    w: width - CHART_PAD.left - CHART_PAD.right,
    h: height - CHART_PAD.top - CHART_PAD.bottom,
  };
  const count = points.length;
  const xOf = (i: number) =>
    round1(plot.x + (count === 1 ? plot.w / 2 : (i / (count - 1)) * plot.w));
  // 세로 범위: 처음 최고(가장 느림)부터 지금 최고와 바로 위 구간 상한(다음 목표)까지, 위아래로 조금 여유
  const last = vals[vals.length - 1] as number;
  const lastStep = changes.length
    ? (changes[changes.length - 1] as TierChange).to.step
    : -1;
  const goal = lastStep >= 0 ? placeAt(n, lastStep + 1)?.cutMs : undefined;
  const lo = Math.min(...vals, goal ?? last) / 1.12;
  const hi = Math.max(...vals) * 1.12;
  const span = Math.log(hi) - Math.log(lo);
  const yOf = (v: number) =>
    round1(plot.y + ((Math.log(v) - Math.log(lo)) / span) * plot.h);
  const bands: ChartBand[] = [];
  table.forEach((row, i) => {
    const upper = (row.cuts[0] as number) * 1000;
    const next = table[i + 1];
    const lower = next ? (next.cuts[0] as number) * 1000 : 0;
    const y0 = yOf(Math.max(lower, lo));
    const y1 = yOf(Math.min(upper, hi));
    if (y1 - y0 <= 0) return;
    bands.push({ tier: row.tier, y0, y1, label: y1 - y0 >= BAND_LABEL_MIN });
  });
  const line: [number, number][] = [];
  let prev: number | null = null;
  points.forEach((p, i) => {
    if (p.ms === null) return;
    if (prev === null) line.push([xOf(i), yOf(p.ms)]);
    else if (p.ms !== prev) {
      line.push([xOf(i), yOf(prev)]);
      line.push([xOf(i), yOf(p.ms)]);
    }
    prev = p.ms;
  });
  line.push([xOf(count - 1), yOf(last)]);
  const dots: [number, number][] = changes.map((c) => {
    const i = points.findIndex((p) => p.no === c.no && p.at === c.at);
    return [xOf(Math.max(0, i)), yOf(c.ms)];
  });
  const ticks: ChartLayout["ticks"] = [];
  let day = "";
  points.forEach((p, i) => {
    const label = dateOf(p.at);
    if (label === day) return;
    day = label;
    const x = xOf(i);
    const before = ticks[ticks.length - 1];
    if (before && x - before.x < TICK_GAP) return;
    const anchor =
      x - plot.x < TICK_GAP / 2
        ? "start"
        : plot.x + plot.w - x < TICK_GAP / 2
          ? "end"
          : "middle";
    ticks.push({ x, label, anchor });
  });
  return { width, height, plot, bands, line, dots, ticks };
}
