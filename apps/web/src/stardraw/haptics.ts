/**
 * 별 따기 진동 한 곳(docs/45 2절, docs/36 11-70). 안드로이드 Chrome·삼성 인터넷처럼 `navigator.vibrate`가 있는 기기에서
 * 화면을 보고 있고 한 번이라도 누른 뒤에만 울린다(브라우저 규칙). 아이폰처럼 없는 기기, 거절하거나 던지는 기기는 조용히 넘어간다.
 *
 * - 「더 보기」의 「진동」을 끄면(이 기기 `localStorage` `stardraw-vibrate`) 모든 진동이 멈춘다. 기본은 켬.
 * - 움직임 줄이기(`prefers-reduced-motion`)와는 묶지 않는다: 진동은 움직임이 아니라 촉감이다. 화면 연출이 어지러워
 *   움직임 줄이기를 켠 사람도 촉감 알림은 받는다(2026-11-03 사용자 결정, 문서 추천).
 */

/** 진동 종류 */
export type BuzzKind =
  | "broadcast" // 방송 토스트가 내려올 때(회차마다 한 번)
  | "countdown" // 관측 10초 카운트다운이 시작될 때(회차마다 한 번)
  | "seal1" // 1등 입상 직인이 찍힐 때
  | "seal" // 2·3등 입상 직인이 찍힐 때
  | "confirm" // 등록증 발급·신분증 확인·예측서 제출
  | "tap"; // 풍등 길게 누르기

/** 무늬(ms). 짧게, 과하지 않게: 알림 둘은 「톡톡」과 「톡」 하나 */
export const BUZZ_PATTERN: Record<BuzzKind, number | number[]> = {
  broadcast: [30, 80, 30],
  countdown: 60,
  seal1: [40, 60, 80],
  seal: 40,
  confirm: 20,
  tap: 15,
};

export const VIBRATE_KEY = "stardraw-vibrate";

/** 이 기기가 진동 함수를 갖고 있는가(없으면 「진동」 설정 줄도 보이지 않는다) */
export function canVibrate(): boolean {
  try {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    );
  } catch {
    return false;
  }
}

/** 진동을 켜 두었는가(저장소를 못 읽으면 켬) */
export function vibrateOn(): boolean {
  try {
    return localStorage.getItem(VIBRATE_KEY) !== "off";
  } catch {
    return true;
  }
}

const listeners = new Set<() => void>();

/** 진동 켜고 끄기(저장하지 못하면 이 페이지 동안만 따르지 않는다: 다시 읽으면 켬) */
export function setVibrateOn(on: boolean): void {
  try {
    if (on) localStorage.removeItem(VIBRATE_KEY);
    else localStorage.setItem(VIBRATE_KEY, "off");
  } catch {
    // 저장하지 못해도 된다
  }
  for (const f of listeners) f();
}

/** 설정이 바뀌면 알린다(useSyncExternalStore용) */
export function subscribeVibrate(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** 한 번 짧게 떤다. 울렸으면(브라우저가 받았으면) true */
export function buzz(kind: BuzzKind): boolean {
  if (!canVibrate() || !vibrateOn()) return false;
  try {
    return navigator.vibrate(BUZZ_PATTERN[kind]) === true;
  } catch {
    // 떨림을 못 하면 그냥 넘어간다
    return false;
  }
}

const done = new Set<string>();

/**
 * 같은 일(`kind` + `key`, 보통 회차 번호)에 한 번만 떤다. 화면을 옮겨 토스트가 다시 내려와도 그 회차에는 다시 울리지 않는다.
 * 진동이 꺼져 있거나 없는 기기면 한 번 낸 것으로 친다(나중에 켜도 지난 알림을 뒤늦게 울리지 않는다)
 */
export function buzzOnce(kind: BuzzKind, key: string | number): boolean {
  const id = `${kind}:${key}`;
  if (done.has(id)) return false;
  done.add(id);
  return buzz(kind);
}

/** 시험: 한 번 낸 기록을 지운다 */
export function forgetBuzzed(): void {
  done.clear();
}
