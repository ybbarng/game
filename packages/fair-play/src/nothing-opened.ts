/**
 * 첫 판 패도 모를 때(첫 판 카드를 다 열기 전에 그만둠)의 다시 계산 결과: 기록 처음에서 멈춘다.
 * 다른 판과 같게 「아직 패를 모르는 판에 들어서면 거기서 멈춘다」로 다룬다. 네 게임(마이티 `checkReplay`,
 * 하트 `checkHeartsReplay`, 화투 `checkHwatuReplay`, 원카드 `checkOnecardReplay`)이 함께 쓴다.
 * 멈춘 판이 정말 끝나지 않은 판인지는 게임 끝 검증이 따로 본다(웹 `net/fair-verify.ts` `unopenedRoundProblem`)
 */
export function nothingOpened<State>(): {
  ok: true;
  state: null;
  states: State[];
  upTo: 0;
} {
  return { ok: true, state: null, states: [], upTo: 0 };
}
