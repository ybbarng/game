import { onTestFinished } from "vitest";

/**
 * 시험 도우미: 시험이 끝나면 방을 닫는다. 닫지 않으면 멘탈 포커 기기들이 다음 판 섞기·증명 확인을 계속 계산해
 * 같은 파일의 다음 시험과 CPU를 나눠 쓴다(2026-11-17 재 보니 앞 시험이 남긴 계산이 다음 시험 CPU의 절반을 넘기도
 * 했다). 시험 중에 새로 연 방장도 이것으로 닫는다
 */
export function closeWhenDone(
  host: { close(): void },
  guests: readonly { leave(): void }[] = [],
): void {
  onTestFinished(() => {
    for (const g of guests) g.leave();
    host.close();
  });
}
