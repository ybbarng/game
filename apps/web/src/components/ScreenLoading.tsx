/**
 * 화면 하나를 따로 불러오는 동안(next/dynamic) 잠깐 보이는 자리. 글은 넣지 않고 엠블럼·온라인 알림과 같은
 * 작은 돌기 표시만 둔다(2026-11-25 첫 화면 가볍게)
 */
export function ScreenLoading() {
  return (
    <div
      className="grid min-h-dvh place-items-center"
      aria-busy="true"
      data-screen-loading=""
    >
      <span
        aria-hidden="true"
        className="size-6 animate-spin rounded-full border-2 border-white/15 border-t-white/60"
      />
    </div>
  );
}
