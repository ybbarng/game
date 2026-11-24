/** 판 끝 주 단추 모양(게임이 따로 주지 않으면) */
const PRIMARY = "rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black";
/** 판 끝 보조 단추 모양 */
const SECONDARY = "rounded-xl border border-white/10 bg-black/35 px-4 py-2";

/** 결과 패널(`Panel`) 안에 둘 때: 패널 단추(`ActionButton`)와 같은 모양 */
export const PANEL_BUTTONS = {
  primaryClass:
    "rounded-xl bg-amber-400 px-4 py-2 font-semibold text-black text-sm hover:bg-amber-300",
  secondaryClass:
    "rounded-xl bg-white/15 px-4 py-2 font-semibold text-sm hover:bg-white/25",
};

/**
 * 게임이 끝났을 때 단추. 모든 게임이 같은 이름·같은 차례로 둔다(2026-11-24 사용자 결정).
 * - 혼자 하기: 「다시 하기」(같은 규칙·단계·자리로 새 판을 바로 시작, 씨앗은 새로) · 「처음으로」(게임 첫 화면) · 「게임 목록」
 * - 온라인·다시 보기: 「처음으로」 · 「게임 목록」(같은 방 한 판 더는 따로)
 *
 * 연습·문제·튜토리얼은 그 자리를 다시 시작하는 단추를 따로 둔다(이 단추를 쓰지 않는다).
 * 단추만 내므로 감싸는 줄은 게임 화면이 둔다
 */
export function RoundEndButtons({
  onRestart,
  onHome,
  primaryClass = PRIMARY,
  secondaryClass = SECONDARY,
}: {
  /** 같은 설정으로 새 판. 없으면(온라인·다시 보기) 「다시 하기」를 두지 않는다 */
  onRestart?: (() => void) | undefined;
  /** 게임 첫 화면으로 */
  onHome: () => void;
  primaryClass?: string;
  secondaryClass?: string;
}) {
  return (
    <>
      {onRestart && (
        <button
          type="button"
          data-primary=""
          onClick={onRestart}
          className={primaryClass}
        >
          다시 하기
        </button>
      )}
      <button
        type="button"
        {...(onRestart ? {} : { "data-primary": "" })}
        onClick={onHome}
        className={onRestart ? secondaryClass : primaryClass}
      >
        처음으로
      </button>
      <a href="/" className={secondaryClass}>
        게임 목록
      </a>
    </>
  );
}
