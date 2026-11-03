/**
 * 뒤 페이지 스크롤 막기. 덮개(StageOverlay)·더 보기 목록이 열린 동안 html의 overflow를 hidden으로 둔다.
 *
 * 예전에는 덮개마다 「열 때의 값」을 기억했다가 닫을 때 되돌렸다. 덮개가 겹쳐 열리고(편지 → 우주인 등록 신청)
 * 먼저 열린 쪽이 먼저 닫히면, 나중 덮개가 기억한 값이 hidden이라 마지막에 hidden으로 되돌아가 페이지가 더는
 * 스크롤되지 않았다(2026-11-03 PC 사용자 제보). 이제 연 수를 세어 하나라도 열려 있으면 막고, 모두 닫히면 처음 값으로 푼다
 */
let count = 0;
let before = "";

export function lockScroll(): () => void {
  const root = document.documentElement;
  if (count === 0) {
    before = root.style.overflow;
    root.style.overflow = "hidden";
  }
  count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count--;
    if (count === 0) root.style.overflow = before;
  };
}
