// 서버에서 그리는 페이지도 쓰는 값이라 "use client" 모듈(marks.tsx) 밖에 둔다(클라이언트 모듈의 배열은 서버에서 참조로만 넘어온다)

/**
 * 용골자리(카노푸스가 속한 별자리) 밝은 별 자리(동쪽이 왼쪽, 0~100 칸 위쪽). 우주국장 직인과 편지 실링왁스가 같이 쓴다.
 * 카노푸스 α, χ, ε(아비오르), ι(아스피디스케), q, p, θ, ω, β(미아플라키두스), υ
 */
export const CARINA_STARS = {
  alpha: [84, 18],
  chi: [61, 19],
  epsilon: [54, 31],
  iota: [40, 30],
  q: [25, 34],
  p: [21, 35],
  theta: [18, 40],
  omega: [26, 49],
  beta: [41, 48],
  upsilon: [33, 40],
} as const;
export type CarinaStar = keyof typeof CARINA_STARS;
export const CARINA_LINES: CarinaStar[][] = [
  ["alpha", "chi", "epsilon", "iota", "q", "p", "theta"],
  ["epsilon", "beta", "omega", "theta"],
  ["iota", "upsilon", "beta"],
];
/** 네 갈래 빛줄기 별 모양 */
export function starPath(x: number, y: number, r: number): string {
  return `M${x} ${y - r} L ${x + r * 0.3} ${y - r * 0.3} L ${x + r} ${y} L ${x + r * 0.3} ${y + r * 0.3} L ${x} ${y + r} L ${x - r * 0.3} ${y + r * 0.3} L ${x - r} ${y} L ${x - r * 0.3} ${y - r * 0.3} Z`;
}
