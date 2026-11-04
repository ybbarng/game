import type { Keymap } from "../input/keymaps";
import { faceHands } from "./tutorial";

/**
 * 키 그림의 짝 잇기·손가락 자리(2026-11-04, docs/47 4-5). 같은 면의 시계·반시계 두 키(「두 손」의 I·K, J·F)를
 * 선으로 이어 「한 면 = 두 키」를 한눈에 보이고, 가운데 줄에 손가락 자리를 옅게 겹친다. 그리는 쪽은 `KeyGuide`.
 */

export interface KeyPair {
  face: string;
  /** 시계(`R`)·반시계(`R'`) 키(조합 키 없이 치는 것) */
  cw: string;
  ccw: string;
}

/** 지금 배치에서 같은 면 두 키의 짝(두 키가 모두 조합 키 없이 놓인 면만) */
export function facePairs(keymap: Keymap): KeyPair[] {
  return faceHands(keymap).map(({ face, cw, ccw }) => ({ face, cw, ccw }));
}

export interface FingerHome {
  code: string;
  hand: "left" | "right";
  /** 손가락 이름 */
  finger: "검지" | "중지" | "약지" | "새끼";
}

/** 두 손을 가운데 줄에 올렸을 때 손가락 자리(F·J에 검지) */
export const FINGER_HOMES: FingerHome[] = [
  { code: "KeyA", hand: "left", finger: "새끼" },
  { code: "KeyS", hand: "left", finger: "약지" },
  { code: "KeyD", hand: "left", finger: "중지" },
  { code: "KeyF", hand: "left", finger: "검지" },
  { code: "KeyJ", hand: "right", finger: "검지" },
  { code: "KeyK", hand: "right", finger: "중지" },
  { code: "KeyL", hand: "right", finger: "약지" },
  { code: "Semicolon", hand: "right", finger: "새끼" },
];

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 두 키를 잇는 선(SVG path). 키 글을 가리지 않게 키 사이 틈으로 돌아간다.
 * - 같은 줄: 두 키 아래 가장자리에서 줄 아래 틈으로 내려가 옆으로 간 뒤 다시 올라온다
 * - 다른 줄: 위 키 아래 가장자리 → 두 줄 사이 틈 → 옆으로 → 아래 키 위 가장자리
 */
export function pairPath(
  a: Box,
  b: Box,
  gap: number,
  /** 같은 틈을 지나는 선끼리 겹치지 않게 위아래로 비킨다(px) */
  shift = 0,
): string {
  const r = (v: number) => Math.round(v * 10) / 10;
  const ax = a.x + a.w / 2;
  const bx = b.x + b.w / 2;
  if (Math.abs(a.y - b.y) < 1) {
    const bottom = Math.max(a.y + a.h, b.y + b.h);
    const y = bottom + gap / 2 + shift;
    return `M${r(ax)} ${r(a.y + a.h)} V${r(y)} H${r(bx)} V${r(b.y + b.h)}`;
  }
  const [up, down] = a.y < b.y ? [a, b] : [b, a];
  const ux = up.x + up.w / 2;
  const dx = down.x + down.w / 2;
  const y = (up.y + up.h + down.y) / 2 + shift;
  return `M${r(ux)} ${r(up.y + up.h)} V${r(y)} H${r(dx)} V${r(down.y)}`;
}
