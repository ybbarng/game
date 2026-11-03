import { createBadukSearchBot, EXPERT_PLAYOUTS } from "@game/baduk-ai";

/** 힌트에 쓰는 컴퓨터: 고수와 같은 나무 탐색을 판 수만 3분의 1로(휴대폰에서도 1초 안팎) */
export const badukAdvisor = createBadukSearchBot(
  Math.round(EXPERT_PLAYOUTS / 3),
);
