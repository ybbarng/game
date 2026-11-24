/**
 * 소리마다 조금씩 다르게 들리게 하는 난수. 평소에는 Math.random이고,
 * renderCue는 씨앗을 고정해 같은 소리를 몇 번 그려도 똑같이 나오게 한다(크기 시험이 흔들리지 않게).
 * 소리 상자(`sound.ts` buildGraph)와 소리 짜기(`render.ts`)가 함께 쓴다
 */
let source: () => number = Math.random;

export function random(): number {
  return source();
}

/** 난수 출처를 바꾼다(없으면 Math.random으로 되돌린다) */
export function setRandom(next?: () => number): void {
  source = next ?? Math.random;
}
