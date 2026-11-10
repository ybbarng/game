import { type MyTier, tierName } from "../tiers/rank";

/**
 * Cubie 프로필(docs/47 15-22). 맥 앱 메뉴 맨 위 칸에 보이는 이름·사진·티어의 자료 꼴을 이곳 한곳에 둔다.
 *
 * - 지금은 로그인이 없어 이 기기에서 한 번 지은 「익명 큐버 #1234」를 쓴다. 번호는 처음 열 때 고르고 이 기기(앱의 웹
 *   저장소)에 남긴다. 앱을 다시 켜거나 기록 창을 열어도 같은 이름이다.
 * - 나중에 사이트 패스키 로그인이 생기면 계정은 사이트(웹)의 것이라 이름·사진도 웹이 받아 이 꼴에 채운다
 *   (`signedIn: true`, `photo`에 주소). 앱은 받은 대로 그리기만 해서 앱을 새로 내지 않아도 바뀐다.
 * - 앱에는 다리 메시지 `profile`(app-bridge.ts)로 보낸다. 티어 글과 엠블럼 그림도 웹이 만든다(그림은 PNG data URL).
 */

export const PROFILE_KEY = "cube.mini.profile.v1";

export interface MiniProfile {
  /** 보이는 이름 */
  name: string;
  /** 프로필 사진 주소. 없으면 앱이 무채색 사람 모양을 그린다 */
  photo: string | null;
  /** 로그인한 계정의 프로필인가(지금은 늘 false) */
  signedIn: boolean;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** 익명 이름: `r`(0 이상 1 미만)로 고른 네 자리 번호를 붙인다 */
export function anonymousName(r: number): string {
  const k = Math.min(8999, Math.max(0, Math.floor(r * 9000)));
  return `익명 큐버 #${1000 + k}`;
}

/**
 * 이 기기의 프로필. 처음이면 익명 이름을 지어 남긴다(저장소가 막혀 있으면 이번만 쓴다).
 * 남긴 값이 망가졌으면 새로 짓는다
 */
export function loadMiniProfile(
  storage: StorageLike | null = defaultStorage(),
  random: () => number = Math.random,
): MiniProfile {
  try {
    const text = storage?.getItem(PROFILE_KEY);
    if (text) {
      const d = JSON.parse(text) as { name?: unknown } | null;
      if (d && typeof d.name === "string" && d.name.trim())
        return { name: d.name, photo: null, signedIn: false };
    }
  } catch {
    // 아래에서 새로 짓는다
  }
  const profile: MiniProfile = {
    name: anonymousName(random()),
    photo: null,
    signedIn: false,
  };
  try {
    storage?.setItem(
      PROFILE_KEY,
      JSON.stringify({ version: 1, name: profile.name }),
    );
  } catch {
    // 저장소가 막혀도 이번 화면에서는 그대로 쓴다
  }
  return profile;
}

/** 메뉴 칸의 티어 글: 「3×3 골드 II」, 티어가 아직 없으면 기록 창과 같은 「3×3 5판 뒤에」 */
export function profileTierText(n: number, mine: MyTier | null): string {
  return `${n}×${n} ${mine ? tierName(mine.place) : "5판 뒤에"}`;
}
