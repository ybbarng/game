/**
 * 전체 효과음 크기(0~1). 설정(`settings.ts`)이 정하고 소리(`sound.ts`)가 따라간다.
 * 설정이 소리 파일을 직접 부르면 설정만 읽는 화면(첫 화면 등)도 소리 코드를 실어, 둘 사이에 이 작은 칸을 둔다
 * (2026-11-25 첫 화면 가볍게)
 */
let volume = 0.8;
const listeners = new Set<(volume: number) => void>();

export function getVolume(): number {
  return volume;
}

export function setVolume(next: number): void {
  volume = Math.min(1, Math.max(0, next));
  for (const l of listeners) l(volume);
}

/** 크기가 바뀔 때마다 부른다(돌려준 함수로 끈다) */
export function onVolume(listener: (volume: number) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
