/**
 * 휴대폰 안전 영역(노치·홈 막대·둥근 모서리). 루트 layout이 `viewportFit: "cover"`라 화면이 그 밑까지 깔리니,
 * 글과 단추는 이 칸만큼 안으로 들인다. globals.css에 넣지 않고 화면 틀이 이 꾸밈을 붙인다(standing-rules 4절).
 * Tailwind가 소스에서 낱말을 찾아 만들므로 값마다 글자 그대로 둔다.
 */

/**
 * 절대 좌표 무대(`useStageSize`를 쓰는 카드 판): 투명한 테두리로 안전 영역을 비운다.
 * 절대 위치 자식의 기준(안쪽 칸)과 ResizeObserver가 재는 크기가 모두 테두리 안쪽이라 배치 계산은 그대로 두고,
 * 배경은 테두리 밑까지 칠해진다.
 */
export const SAFE_STAGE =
  "border-solid border-transparent border-t-[length:env(safe-area-inset-top)] border-r-[length:env(safe-area-inset-right)] border-b-[length:env(safe-area-inset-bottom)] border-l-[length:env(safe-area-inset-left)]";

/** 안쪽 여백 1rem(p-4) 화면: 안전 영역이 더 크면 그만큼 */
export const SAFE_P4 =
  "pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]";

/** 위아래 0.75rem·양옆 1rem(py-3 px-4) 화면(판 게임 틀) */
export const SAFE_PY3_PX4 =
  "pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]";

/** 위아래 0.5rem·양옆 0.75rem(py-2 px-3) 화면 */
export const SAFE_PY2_PX3 =
  "pt-[max(0.5rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))]";
