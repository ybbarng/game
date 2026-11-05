import { useSyncExternalStore } from "react";
import {
  DEFAULT_HERO_HIGHLIGHT,
  HERO_HIGHLIGHTS,
  type HeroHighlight,
} from "./hero/highlight";
import {
  DEFAULT_HERO_SIZE,
  findHeroMethod,
  HERO_ALTERNATE,
  type HeroChoice,
  type HeroSize,
  isHeroSize,
} from "./hero/methods";
import { DEFAULT_COLORS, type Quality } from "./view/types";

/**
 * 큐브 설정(docs/47 4·5절). 이 기기 localStorage에 둔다. 저장소가 막혀 있어도(사생활 창 등) 기본값으로 돈다.
 * 키 배치는 따로(`input/storage.ts`, 키 `cube.keymap.v1`).
 */

export type ColorScheme = "standard" | "highContrast" | "colorblind" | "custom";

export const COLOR_SCHEME_LABEL: Record<ColorScheme, string> = {
  standard: "표준",
  highContrast: "높은 대비",
  colorblind: "색약 친화",
  custom: "직접 고름",
};

/** 색 묶음(U R F D L B 차례). 「직접 고름」은 면마다 고른 색 */
export const COLOR_SCHEMES: Record<
  Exclude<ColorScheme, "custom">,
  readonly number[]
> = {
  standard: DEFAULT_COLORS,
  // 채도를 끝까지 올리고 빨강·주황, 흰색·노랑 사이를 넓혔다
  highContrast: [0xffffff, 0xe00000, 0x00b000, 0xffee00, 0xff8a00, 0x0040ff],
  // 오카베·이토 색(색약이 있어도 서로 구별되도록 고른 색). 위 흰·아래 노랑·앞 청록·뒤 파랑·오른쪽 주홍·왼쪽 주황
  colorblind: [0xffffff, 0xd55e00, 0x009e73, 0xf0e442, 0xe69f00, 0x0072b2],
};

export type BackView = "mirror" | "net" | "off";

export const BACK_VIEW_LABEL: Record<BackView, string> = {
  mirror: "거울",
  net: "펼친 그림",
  off: "끔",
};

/**
 * 수 흐름 띠(docs/51 1-1). 「켬」이면 혼자 맞추기·배우기는 크게, 대결은 작게. 「작게」면 어디서나 작게.
 * 움직임 줄이기를 켠 기기는 떴다 작아지는 움직임 없이 글자만 더한다
 */
export type FlowStripMode = "on" | "small" | "off";

export const FLOW_STRIP_LABEL: Record<FlowStripMode, string> = {
  on: "켬",
  small: "작게",
  off: "끔",
};

/**
 * 대결 알림(docs/51 1-3). 「켬」: 사람마다 단계 칩 + 이정표를 지나면 그 칸에 「십자 3.21초」 톡.
 * 「조용히」: 칩만. 「끔」: 칩도 톡도 없이 진행 막대와 단계 이름만(예전 모습).
 * 움직임 줄이기를 켠 기기에서는 「켬」도 「조용히」로 보인다(`effectiveRaceAlerts`)
 */
export type RaceAlertMode = "on" | "quiet" | "off";

export const RACE_ALERT_LABEL: Record<RaceAlertMode, string> = {
  on: "켬",
  quiet: "조용히(칩만)",
  off: "끔",
};

export function effectiveRaceAlerts(
  mode: RaceAlertMode,
  reducedMotion: boolean,
): RaceAlertMode {
  return mode === "on" && reducedMotion ? "quiet" : mode;
}

export interface CubeSettings {
  version: 1;
  colorScheme: ColorScheme;
  /** 면마다 색(U R F D L B). 색 묶음을 고르면 그 묶음의 색이 들어간다 */
  colors: number[];
  /** 한 수 회전 시간(0~200ms) */
  moveMs: number;
  quality: Quality;
  stickerless: boolean;
  /** 가린 스티커 색 */
  hidden: "black" | "gray";
  /** 큐브 소리(면 돌기·맞춤·살펴보기 알림) */
  sound: boolean;
  /** 혼자 맞추기의 15초 살펴보기 */
  inspection: boolean;
  /** 혼자 맞추기 「상황 알림」: 내 목록의 윗면 상황에 이르면 구석에 이름과 내 공식(2026-11-04, 기본 꺼짐) */
  caseAlert: boolean;
  /**
   * 키 그림에 면 색(2026-11-04, 기본 켬): 면 돌리기 키를 들고 있는 방향의 그 면 색으로, 반대 방향은 연하게·빗금.
   * 끄면 단색
   */
  keyColors: boolean;
  /** 키 그림에서 같은 면의 시계·반시계 두 키를 선으로 잇는다(2026-11-04, 기본 켬) */
  keyPairs: boolean;
  /** 키 그림에 가운데 줄 손가락 자리(검지·중지·약지·새끼)를 옅게 겹친다(2026-11-04, 기본 켬) */
  keyFingers: boolean;
  /**
   * 뒷면 보기(2026-11-04, 기본 거울): 안 보이는 세 면(뒤·왼쪽·아래)을 큐브 둘레에 떠 있는 거울 판으로, 또는 곁의
   * 펼친 그림으로 보인다. 끄면 큐브만. 3D를 못 그리는 기기는 늘 펼친 그림
   */
  backView: BackView;
  /**
   * 휴대폰에서 수 단추 줄 대신 키보드 그림을 눌러 친다(2026-11-05, 기본 꺼짐). 데스크톱과 같은 키 배치로 손에 익힌다.
   * 데스크톱은 늘 둘 다 보이고 키 그림도 누를 수 있다
   */
  touchKeyboard: boolean;
  /** 큐브 아래 키 그림을 펴 둔다(2026-11-05, 기본 켬). 「키 그림 접기」로 바꾸고 다음에 열어도 남는다 */
  keyGuideOpen: boolean;
  /** 거울 판·펼친 그림을 보인다(2026-11-05, 기본 켬). 「거울 숨기기」·「펼친 그림 숨기기」로 바꾸고 다음에 열어도 남는다 */
  backViewShown: boolean;
  /** 수 흐름 띠(2026-11-05, 기본 켬) */
  flowStrip: FlowStripMode;
  /** 대결 알림(2026-11-05, 기본 켬) */
  raceAlerts: RaceAlertMode;
  /** 첫 화면 큐브 연출의 크기 */
  heroSize: HeroSize;
  /** 첫 화면 큐브 연출의 해법: 「번갈아」 또는 해법 표(`hero/methods.ts`)의 id */
  heroMethod: HeroChoice;
  /** 첫 화면 큐브의 조각 강조(넣을 곳·찾은 조각·맞춘 조각): 끄기 / 잠깐 / 계속 */
  heroHighlight: HeroHighlight;
}

export const DEFAULT_SETTINGS: CubeSettings = {
  version: 1,
  colorScheme: "standard",
  colors: [...DEFAULT_COLORS],
  moveMs: 90,
  quality: "high",
  stickerless: false,
  hidden: "black",
  sound: true,
  inspection: true,
  caseAlert: false,
  keyColors: true,
  keyPairs: true,
  keyFingers: true,
  backView: "mirror",
  touchKeyboard: false,
  keyGuideOpen: true,
  backViewShown: true,
  flowStrip: "on",
  raceAlerts: "on",
  heroSize: DEFAULT_HERO_SIZE,
  heroMethod: HERO_ALTERNATE,
  heroHighlight: DEFAULT_HERO_HIGHLIGHT,
};

export const SETTINGS_KEY = "cube.settings.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const isColor = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 0xffffff;

/** 저장된 글을 읽는다. 모르는 값·틀린 값은 그 칸만 기본값으로 */
export function parseSettings(text: string | null | undefined): CubeSettings {
  if (!text) return { ...DEFAULT_SETTINGS, colors: [...DEFAULT_COLORS] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  const d = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<
    Record<keyof CubeSettings, unknown>
  >;
  const scheme =
    typeof d.colorScheme === "string" && d.colorScheme in COLOR_SCHEME_LABEL
      ? (d.colorScheme as ColorScheme)
      : "standard";
  const colors =
    scheme === "custom"
      ? Array.isArray(d.colors) &&
        d.colors.length === 6 &&
        d.colors.every(isColor)
        ? [...(d.colors as number[])]
        : [...DEFAULT_COLORS]
      : [...COLOR_SCHEMES[scheme]];
  const moveMs =
    typeof d.moveMs === "number" && Number.isFinite(d.moveMs)
      ? Math.min(200, Math.max(0, Math.round(d.moveMs)))
      : DEFAULT_SETTINGS.moveMs;
  const quality =
    d.quality === "high" || d.quality === "medium" || d.quality === "low"
      ? d.quality
      : DEFAULT_SETTINGS.quality;
  const heroSize = isHeroSize(d.heroSize) ? d.heroSize : DEFAULT_HERO_SIZE;
  // 그 크기의 해법이 아니면(표에서 빠졌거나 크기가 바뀜) 「번갈아」
  const heroMethod =
    typeof d.heroMethod === "string" &&
    findHeroMethod(d.heroMethod)?.size === heroSize
      ? d.heroMethod
      : HERO_ALTERNATE;
  const bool = (v: unknown, fallback: boolean) =>
    typeof v === "boolean" ? v : fallback;
  return {
    version: 1,
    colorScheme: scheme,
    colors,
    moveMs,
    quality,
    stickerless: bool(d.stickerless, DEFAULT_SETTINGS.stickerless),
    hidden: d.hidden === "gray" ? "gray" : "black",
    sound: bool(d.sound, DEFAULT_SETTINGS.sound),
    inspection: bool(d.inspection, DEFAULT_SETTINGS.inspection),
    caseAlert: bool(d.caseAlert, DEFAULT_SETTINGS.caseAlert),
    keyColors: bool(d.keyColors, DEFAULT_SETTINGS.keyColors),
    keyPairs: bool(d.keyPairs, DEFAULT_SETTINGS.keyPairs),
    keyFingers: bool(d.keyFingers, DEFAULT_SETTINGS.keyFingers),
    backView:
      d.backView === "net" || d.backView === "off" || d.backView === "mirror"
        ? d.backView
        : DEFAULT_SETTINGS.backView,
    touchKeyboard: bool(d.touchKeyboard, DEFAULT_SETTINGS.touchKeyboard),
    keyGuideOpen: bool(d.keyGuideOpen, DEFAULT_SETTINGS.keyGuideOpen),
    backViewShown: bool(d.backViewShown, DEFAULT_SETTINGS.backViewShown),
    flowStrip:
      typeof d.flowStrip === "string" && d.flowStrip in FLOW_STRIP_LABEL
        ? (d.flowStrip as FlowStripMode)
        : DEFAULT_SETTINGS.flowStrip,
    raceAlerts:
      typeof d.raceAlerts === "string" && d.raceAlerts in RACE_ALERT_LABEL
        ? (d.raceAlerts as RaceAlertMode)
        : DEFAULT_SETTINGS.raceAlerts,
    heroSize,
    heroMethod,
    heroHighlight: (HERO_HIGHLIGHTS as readonly unknown[]).includes(
      d.heroHighlight,
    )
      ? (d.heroHighlight as HeroHighlight)
      : DEFAULT_HERO_HIGHLIGHT,
  };
}

export function loadSettings(
  storage: StorageLike | null = defaultStorage(),
): CubeSettings {
  try {
    return parseSettings(storage?.getItem(SETTINGS_KEY));
  } catch {
    return parseSettings(null);
  }
}

/** 저장한다. 못 하면 false */
export function saveSettings(
  settings: CubeSettings,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

/** 색 묶음을 고른다 */
export function withScheme(
  s: CubeSettings,
  scheme: Exclude<ColorScheme, "custom">,
): CubeSettings {
  return { ...s, colorScheme: scheme, colors: [...COLOR_SCHEMES[scheme]] };
}

/** 면 하나의 색을 바꾼다(「직접 고름」이 된다) */
export function withFaceColor(
  s: CubeSettings,
  face: number,
  color: number,
): CubeSettings {
  const colors = [...s.colors];
  colors[face] = color;
  return { ...s, colorScheme: "custom", colors };
}

export const hexColor = (c: number): string =>
  `#${c.toString(16).padStart(6, "0")}`;

// ---------------------------------------------------------------- 화면에서 함께 쓰는 저장소

let current: CubeSettings | null = null;
const listeners = new Set<() => void>();

function snapshot(): CubeSettings {
  current ??= loadSettings();
  return current;
}

const SERVER_SNAPSHOT = DEFAULT_SETTINGS;

/** 설정을 바꿔 저장하고 큐브 화면들에 알린다 */
export function updateSettings(next: CubeSettings): void {
  current = next;
  saveSettings(next);
  for (const l of listeners) l();
}

/** 지금 설정(정적 빌드의 첫 그리기에서는 기본값, 그 뒤 이 기기 값) */
export function useCubeSettings(): CubeSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    snapshot,
    () => SERVER_SNAPSHOT,
  );
}
