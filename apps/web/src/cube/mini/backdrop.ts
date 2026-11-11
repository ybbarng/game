/**
 * Cubie 앱의 투명 창에서 큐브가 바탕화면과 섞이지 않게 하는 윤곽(docs/47 15-23). 큐브 실루엣을 그대로 따라 도는
 * 또렷한 밝은 선과 그 바깥의 어두운 그림자를 둔다. 검은·어두운 바탕은 밝은 선이, 밝은 바탕은 어두운 그림자가 큐브
 * 테두리를 갈라 준다. 거울 판도 캔버스에 함께 그려져 판마다 제 윤곽을 받는다.
 *
 * 예전에는 큐브·거울을 감싸는 둥근 받침(원반 그림자)을 깔았지만 큐브 크기와 맞지 않고 따로 놀아 없앴다(2026-11-11).
 * 밝은 선을 좁게 흐린 빛으로 만들던 때는 앱 엔진(WebKit)에서 흐림이 옅게 그려져 검은 바탕에서 거의 안 보였다.
 * 그래서 흐림 없는 그림자를 상하좌우로 밀어 겹친 선으로 바꿨다(엔진마다 흐림 계산이 달라도 같은 선이 나온다).
 */

/** 윤곽의 진하기와 폭. WebKit으로 검은(#000)·어두운 회색·흰·사진 바탕 × 떠 있을 때·맞추는 중을 찍어 견줘 골랐다 */
export const OUTLINE = {
  /** 밝은 선: 흐림 없이 상하좌우로 민 흰 그림자 네 겹 하나하나의 불투명도 */
  rim: 0.55,
  /** 밝은 선 굵기(창 짧은 변에 대한 비율) */
  rimWidth: 0.005,
  /** 가장 작은 창에서도 밝은 선이 보이게 하는 굵기 하한(CSS px, 배율 2에서 장치 2px) */
  rimWidthMin: 1,
  /** 바깥 어두운 그림자(검정의 불투명도). 밝은 바탕에서 테두리를 맡는다 */
  shade: 0.55,
  /** 어두운 그림자 흐림 폭(창 짧은 변에 대한 비율) */
  shadeBlur: 0.022,
} as const;

/**
 * 큐브 윤곽(CSS filter, 3D 캔버스에 건다). 캔버스의 투명한 곳 둘레로만 생기므로 큐브·거울 판의 생김새를 따른다.
 * 흐림 없는 흰 그림자를 오른쪽·왼쪽·아래·위로 차례로 밀어 겹치면 앞 겹까지 함께 밀려 실루엣이 사방으로 굵어진 또렷한
 * 선이 된다. 브라우저가 칠하는 `drop-shadow`만 쓰고, 장면을 다시 그릴 때만 다시 칠하므로 가만히 있을 때 비용이 없다
 */
export function outlineFilter(shortSide: number): string {
  const s = Math.max(shortSide, 1);
  const { rim, rimWidth, rimWidthMin, shade, shadeBlur } = OUTLINE;
  const d = Math.max(rimWidthMin, s * rimWidth).toFixed(1);
  const white = `rgba(255,255,255,${rim})`;
  return [
    `drop-shadow(${d}px 0 0 ${white})`,
    `drop-shadow(-${d}px 0 0 ${white})`,
    `drop-shadow(0 ${d}px 0 ${white})`,
    `drop-shadow(0 -${d}px 0 ${white})`,
    `drop-shadow(0 0 ${Math.max(0.5, s * shadeBlur).toFixed(1)}px rgba(0,0,0,${shade}))`,
  ].join(" ");
}
