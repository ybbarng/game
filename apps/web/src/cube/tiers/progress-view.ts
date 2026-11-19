/**
 * 기록 화면에서 티어를 정한 5판과 다음 판 목표를 보이는 도우미(docs/47 14-8). 사이트 혼자 맞추기 기록 칸(`SolveApp`),
 * Cubie 기록 창 사이트 화면(`MiniCubeApp` `RecordsPanel`), 티어 화면(`TierShowcase`)이 함께 쓰고, 앱 네이티브 창은 같은 글을
 * `apps/cubie/Sources/CubieCore/RecordsSheet.swift`·`TierSheet.swift`에 둔다(`native-windows-text.test.ts`가 본다).
 */
import { formatMs } from "../records";
import {
  bestFiveDetail,
  type NextSolve,
  type TierBand,
  type Timeable,
  tierName,
} from "./rank";

type Numbered = Timeable & { no?: number };

/** 티어를 정한 5판을 기록 줄에 짚기 */
export interface BestFiveView {
  /** 최고 5판 평균(ms) */
  ms: number;
  /** 그 5판의 가장 오래된·새 번호(「7~11번」) */
  first: number;
  last: number;
  /** 번호 → 그 판의 몫: 평균에 든 판(`in`), 빠진 가장 빠른 판(`fast`)·가장 느린 판(`slow`) */
  marks: ReadonlyMap<number, "in" | "fast" | "slow">;
}

/** 기록(새것이 앞, 번호 있음)과 따로 남겨 둔 최고 5판에서 티어를 정한 5판. 없거나 번호를 모르면 null */
export function bestFiveView(
  records: readonly Numbered[],
  bestFive: readonly Numbered[] = [],
): BestFiveView | null {
  const d = bestFiveDetail(records, bestFive);
  if (!d) return null;
  const five =
    d.from === "list" ? records.slice(d.at, d.at + 5) : bestFive.slice(0, 5);
  const nos = five.map((r) => r.no);
  if (nos.some((no) => no === undefined)) return null;
  const marks = new Map<number, "in" | "fast" | "slow">();
  for (const [i, r] of five.entries())
    marks.set(
      r.no as number,
      i === d.fast ? "fast" : i === d.slow ? "slow" : "in",
    );
  const list = nos as number[];
  return {
    ms: d.ms,
    first: Math.min(...list),
    last: Math.max(...list),
    marks,
  };
}

/** 「7~11번」 */
export function rangeText(v: Pick<BestFiveView, "first" | "last">): string {
  return `${v.first}~${v.last}번`;
}

/** 기록 화면 요약의 이름(최근 n판과 티어를 정한 최고 5판을 이름으로 가른다) */
export const RECENT5_LABEL = "최근 5판 평균";
export const RECENT12_LABEL = "최근 12판 평균";
export const BEST5_LABEL = "최고 5판 평균";

/**
 * 다음 판 목표 글: 「다음 판 2:51.56 안이면 브론즈 I」, 「다음 판을 맞추면 브론즈 I」,
 * 「다음 판 하나로는 브론즈 I에 못 닿아요. 최고 5판 평균을 5.09초 줄여야 해요.」
 */
export function nextSolveText(s: NextSolve): string {
  const to = tierName(s.to);
  if (s.kind === "within") return `다음 판 ${formatMs(s.ms)} 안이면 ${to}`;
  if (s.kind === "any") return `다음 판을 맞추면 ${to}`;
  return `다음 판 하나로는 ${to}에 못 닿아요. 최고 5판 평균을 ${formatMs(s.gapMs)}초 줄여야 해요.`;
}

/**
 * 글을 시간(「20:00.00초」·「2:51.56」·「5.09초」)과 나머지 조각으로 나눈다. 화면은 시간 조각을 한 덩이로 둬
 * 줄 끝에서 「20: / 00.00초」처럼 시간 가운데서 끊기지 않게 한다(WebKit은 `break-keep`에서도 「:」 뒤를 끊었다)
 */
export function timePieces(text: string): { text: string; time: boolean }[] {
  const out: { text: string; time: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(/\d+(?::\d+)*\.\d+초?/g)) {
    const i = m.index ?? 0;
    if (i > at) out.push({ text: text.slice(at, i), time: false });
    out.push({ text: m[0], time: true });
    at = i + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), time: false });
  return out;
}

/** 상한 없는 맨 아래 구간의 왼쪽 끝 글(티어표 `cutText`와 같다) */
export const BAND_OPEN_LOW = "다 맞춤";

/** 구간 안 자리 막대(세 칸 사다리)의 글(docs/47 14-9). 앱 `TierProgress.bandView`가 같은 글을 낸다 */
export interface BandView {
  /** 칸 이름: 왼쪽 칸 = 바로 아래 구간(맨 아래면 null), 가운데 칸 = 지금 구간, 오른쪽 칸 = 바로 위 구간(꼭대기면 null) */
  downName: string | null;
  hereName: string;
  upName: string | null;
  /** 왼쪽 경계 눈금 아래 시간(지금 구간 상한, 상한 없으면 「다 맞춤」) */
  lowTime: string;
  /** 오른쪽 경계 눈금 아래 시간(바로 위 구간 상한, 꼭대기면 「0.00」) */
  highTime: string;
  /** 지금 자리 위 숫자(최고 5판 평균) */
  value: string;
  /** 0 왼쪽 경계 ~ 1 오른쪽 경계 */
  ratio: number;
  /** 접근성 이름: 「브론즈 II 3:10.00 → 브론즈 I 2:30.00 · 최고 5판 평균 2:35.09」 */
  label: string;
}

/** 옆 칸(바로 아래·위 구간)의 가장 좁은 폭(px). 이름 글이 짧아도 칸으로 보이게 */
export const BAND_MIN_SIDE = 24;
/** 칸 이름 앞 엠블럼 정지 그림 크기(px). 옆 칸 이름이 칸에 안 들어가면 이것만 둔다 */
export const BAND_EMBLEM = 14;
/** 칸 사이 틈(px). 같은 색 티어(플래티넘 II·I)끼리도 경계가 보이게 */
export const BAND_GAP = 1;
/**
 * 칸 색 진하기(0~1, 티어 색에 곱함): 지금 칸의 지나온 부분 `done`, 남은 부분 `rest`, 옆 칸 `side`(사용자 2026-11-19 「현재 티어도
 * 남은 공간은 연한 색」). 옆 칸은 지금 칸 남은 부분과 섞여 보이지 않게 그보다 더 흐리게. 앱 `TierProgress.bandAlpha`가 같은 값
 */
export const BAND_ALPHA = { done: 1, rest: 0.4, side: 0.16 } as const;

/** 막대 폭과 잰 글 폭(px). 앱 `TierProgress.bandLayout`이 같은 값을 받는다 */
export interface BandWidths {
  width: number;
  /** 칸 이름 글 폭(엠블럼·사이 틈 포함). 그 칸이 없으면 null */
  down: number | null;
  here: number;
  up: number | null;
  /** 경계 시간 글 폭 */
  low: number;
  high: number;
  /** 숫자 글 폭 */
  value: number;
}

/** 구간 안 자리 막대의 그리기 좌표(px, 막대 왼쪽 끝이 0). 앱 `TierProgress.bandLayout`이 같은 셈을 한다 */
export interface BandLayout {
  /** 옆 칸 폭(있는 쪽은 같은 폭) */
  side: number;
  /** 왼쪽 경계(지금 칸 시작)·오른쪽 경계(지금 칸 끝)·지금 자리의 x. 옆 칸이 없으면 경계가 막대 끝(0·width) */
  lowX: number;
  highX: number;
  markX: number;
  /** 칸 이름 글의 왼쪽 x(없는 칸은 null) */
  downX: number | null;
  hereX: number;
  upX: number | null;
  /** 옆 칸 이름이 칸 폭에 안 들어가 엠블럼만 둔다 */
  downShort: boolean;
  upShort: boolean;
  /** 경계 시간 글·숫자 글의 왼쪽 x */
  lowTimeX: number;
  highTimeX: number;
  valueX: number;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * 막대는 세 칸 사다리다(docs/47 14-9, 사용자 2026-11-19 「뭔가 애매해 보이네」): 왼쪽 칸 = 바로 아래 구간, 가운데 칸 = 지금
 * 구간, 오른쪽 칸 = 바로 위 구간. 옆 칸 폭은 이름 글이 들어갈 만큼(있는 쪽은 같은 폭, 짧아도 `BAND_MIN_SIDE`, 길어도 막대의
 * 1/4). 막대의 1/4에도 안 들어가는 이름은 엠블럼만 둔다. 꼭대기·맨 아래처럼 옆 칸이 없으면 그 자리를 비우지 않고 지금 칸이
 * 막대 끝까지 넓어진다(사용자 2026-11-19). 칸 이름은 칸 아래 가운데, 경계 시간은 경계 바로 아래 가운데, 숫자는 지금 자리 위
 * 가운데에 두되 막대 밖으로 나가면 안쪽으로 밀어 넣는다. 자리(ratio)는 두 경계 사이에서 센다
 */
export function bandLayout(ratio: number, w: BandWidths): BandLayout {
  const { width } = w;
  const sides = [w.down, w.up].filter((v): v is number => v !== null);
  const side =
    sides.length > 0 ? clamp(Math.max(...sides), BAND_MIN_SIDE, width / 4) : 0;
  const lowX = w.down !== null ? side : 0;
  const highX = w.up !== null ? width - side : width;
  const markX = lowX + clamp(ratio, 0, 1) * (highX - lowX);
  const downShort = w.down !== null && w.down > side;
  const upShort = w.up !== null && w.up > side;
  const fit = (v: number, short: boolean) => (short ? BAND_EMBLEM : v);
  const at = (center: number, v: number) => clamp(center - v / 2, 0, width - v);
  return {
    side,
    lowX,
    highX,
    markX,
    downX: w.down !== null ? at(side / 2, fit(w.down, downShort)) : null,
    hereX: at((lowX + highX) / 2, w.here),
    upX: w.up !== null ? at(width - side / 2, fit(w.up, upShort)) : null,
    downShort,
    upShort,
    lowTimeX: at(lowX, w.low),
    highTimeX: at(highX, w.high),
    valueX: at(markX, w.value),
  };
}

export function bandView(b: TierBand, ms: number): BandView {
  const hereName = tierName(b.here);
  const lowTime = b.lowMs === null ? BAND_OPEN_LOW : formatMs(b.lowMs);
  const upName = b.up ? tierName(b.up) : null;
  const highTime = formatMs(b.highMs);
  const value = formatMs(ms);
  const right = upName ? `${upName} ${highTime}` : highTime;
  return {
    downName: b.down ? tierName(b.down) : null,
    hereName,
    upName,
    lowTime,
    highTime,
    value,
    ratio: b.ratio,
    label: `${hereName} ${lowTime} → ${right} · ${BEST5_LABEL} ${value}`,
  };
}
