/**
 * Cubie 앱의 투명 창에서 큐브가 바탕화면과 섞이지 않게 하는 윤곽(docs/47 15-23). 큐브 실루엣을 그대로 따라 도는 옅은
 * 밝은 테두리와 그 바깥의 어두운 그림자를 둔다. 검은·어두운 바탕은 밝은 테두리가, 밝은 바탕은 어두운 그림자가 큐브
 * 테두리를 갈라 준다. 거울 판도 캔버스에 함께 그려져 판마다 제 윤곽을 받는다.
 *
 * 예전에는 큐브·거울을 감싸는 둥근 받침(원반 그림자)을 깔았지만 큐브 크기와 맞지 않고 따로 놀아 없앴다(2026-11-11).
 */

/** 윤곽의 진하기와 폭. 검은(#000)·어두운 회색·흰·사진 바탕에서 떠 있을 때·맞추는 중을 찍어 견줘 골랐다 */
export const OUTLINE = {
  /**
   * 밝은 테두리: 좁게 흐린 흰 빛 두 겹. 한 겹은 흐림 때문에 가장자리에서 옅어져, 두 겹을 겹쳐 선처럼 또렷하게 한다
   * (흰색의 불투명도)
   */
  rim: [0.75, 0.6],
  /** 밝은 테두리 흐림 폭(창 짧은 변에 대한 비율) */
  rimBlur: 0.005,
  /** 가장 작은 창에서도 밝은 테두리가 사라지지 않게 하는 흐림 폭 하한(CSS px) */
  rimBlurMin: 0.4,
  /** 바깥 어두운 그림자(검정의 불투명도). 밝은 바탕에서 테두리를 맡는다 */
  shade: 0.55,
  /** 어두운 그림자 흐림 폭(창 짧은 변에 대한 비율) */
  shadeBlur: 0.022,
} as const;

/**
 * 큐브 윤곽(CSS filter, 3D 캔버스에 건다). 캔버스의 투명한 곳 둘레로만 생기므로 큐브·거울 판의 생김새를 따른다.
 * 브라우저가 GPU로 칠하는 `drop-shadow`만 쓰고, 장면을 다시 그릴 때만 다시 칠하므로 가만히 있을 때 비용이 없다
 */
export function outlineFilter(shortSide: number): string {
  const s = Math.max(shortSide, 1);
  const px = (k: number, min: number) => `${Math.max(min, s * k).toFixed(1)}px`;
  const { rim, rimBlur, rimBlurMin, shade, shadeBlur } = OUTLINE;
  return [
    ...rim.map(
      (a) =>
        `drop-shadow(0 0 ${px(rimBlur, rimBlurMin)} rgba(255,255,255,${a}))`,
    ),
    `drop-shadow(0 0 ${px(shadeBlur, 0.5)} rgba(0,0,0,${shade}))`,
  ].join(" ");
}
