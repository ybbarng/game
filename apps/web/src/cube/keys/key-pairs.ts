/**
 * 키 그림의 손가락 자리(2026-11-04, docs/47 4-5). 가운데 줄에 손가락 자리를 옅게 겹친다. 그리는 쪽은 `KeyGuide`
 * `KeyOverlay`. 같은 면의 두 키를 잇던 선(짝 잇기)은 2026-11-05에 뺐다(사용자 「같은 색으로 연결되니까, 같은 색끼리
 * 연결 선은 필요 없을 것 같아」).
 */

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
