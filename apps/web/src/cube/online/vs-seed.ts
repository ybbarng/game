// 컴퓨터와 대결의 섞기를 화면 시험에서만 정해 두는 길(2026-11-05, #152 화면 시험이 섞기 운에 따라 흔들렸다).
// 대결 씨앗은 판 아이디와 모두의 공개값으로 정해지므로, 판 아이디 꼬리(`CubeRoomInit.raceTag`)와 공개값(`random`)을 정해 두면
// 섞기와 컴퓨터 계획이 늘 같다. 컴퓨터와 대결 화면만, 화면 시험 갈고리(`__cubeTestHooks`)가 켜졌을 때만 읽는다.
// 온라인 방에는 없다(남의 섞기를 고르는 길이 된다).
import { sha256Hex } from "@game/baseball-engine";

/** 씨앗 글 → 늘 같은 판 아이디 꼬리·같은 차례의 공개값 */
export function seededRace(seed: string): {
  random: () => string;
  raceTag: () => string;
} {
  let k = 0;
  let r = 0;
  return {
    random: () => sha256Hex(`cube-vs-seed|${seed}|${k++}`).slice(0, 24),
    raceTag: () => sha256Hex(`cube-vs-race|${seed}|${r++}`).slice(0, 8),
  };
}

/** 화면 시험: `window.__cubeVsSeed`가 있으면 그 씨앗(갈고리가 켜졌을 때만) */
export function testVsSeed(): {
  random?: () => string;
  raceTag?: () => string;
} {
  if (typeof window === "undefined") return {};
  const w = window as { __cubeTestHooks?: boolean; __cubeVsSeed?: unknown };
  if (!w.__cubeTestHooks || typeof w.__cubeVsSeed !== "string") return {};
  return seededRace(w.__cubeVsSeed);
}
