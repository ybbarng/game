import { sha256, taggedHash } from "@game/stardraw-core";

/**
 * 등록증 뒷면의 별 무늬(docs/36 11-9, 11-66). 등록번호 40비트(`serialOf`, 공개 열쇠에서 나온다)에서 정해지는 무늬라
 * 같은 열쇠면 어느 기기에서든 같은 그림이다. 꾸밈일 뿐 무엇을 판정하는 데 쓰지 않는다.
 * 예전에는 공개 열쇠 x·y 바이트를 그대로 썼다. 등록증 공유본(/stardraw/card)이 열쇠 없이 같은 그림을 그리도록
 * 앞면에 이미 보이는 등록번호에서 정하게 바꿨다(2026-11-03).
 */

/** 그림 판(가로:세로 = 카드 비율 1.586) */
export const ART_W = 158.6;
export const ART_H = 100;

export const KEY_ART_TAG = "stardraw/key-art/v2";

export type ArtStar = { x: number; y: number; r: number; o: number };

export type KeyArt = {
  stars: ArtStar[];
  /** 별자리 선: 별 번호 둘 */
  lines: [number, number][];
  /** 무늬 색(0~359) */
  hue: number;
};

/** 별 수 */
const STARS = 20;
/** 선으로 잇는 밝은 별 수 */
const LINKED = 7;

/** 등록번호 40비트(5바이트) → 별 무늬 */
export function keyArt(serial: Uint8Array): KeyArt {
  if (serial.length !== 5) throw new Error("등록번호는 5바이트여야 한다");
  const seed = taggedHash(KEY_ART_TAG, serial);
  // 무늬에 쓰는 64바이트: 씨앗에서 두 번 늘린다
  const bytes = new Uint8Array(64);
  bytes.set(sha256(seed, Uint8Array.of(0)), 0);
  bytes.set(sha256(seed, Uint8Array.of(1)), 32);
  const b = (i: number) => bytes[i % 64] as number;
  const stars: ArtStar[] = [];
  for (let i = 0; i < STARS; i++) {
    stars.push({
      x: 8 + (b(2 * i) / 255) * (ART_W - 16),
      y: 8 + (b(2 * i + 1) / 255) * (ART_H - 16),
      r:
        i < LINKED ? 1.6 + (b(40 + i) % 4) * 0.35 : 0.5 + (b(40 + i) % 4) * 0.2,
      o: i < LINKED ? 1 : 0.45 + (b(50 + i) % 5) * 0.1,
    });
  }
  // 밝은 별을 왼쪽에서 오른쪽 차례로 이어 별자리 하나를 만든다
  const order = [...Array(LINKED).keys()].sort(
    (p, q) => (stars[p] as ArtStar).x - (stars[q] as ArtStar).x,
  );
  const lines: [number, number][] = [];
  for (let k = 1; k < order.length; k++)
    lines.push([order[k - 1] as number, order[k] as number]);
  return { stars, lines, hue: Math.round((b(63) / 255) * 359) };
}
