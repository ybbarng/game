import { timePieces } from "./progress-view";

/** 글 속 시간(「20:00.00」·「5.09초」)을 한 덩이로 그린다: 줄 끝에서 시간 가운데서 끊기지 않는다(`timePieces`) */
export function NoBreakTimes({ text }: { text: string }) {
  return (
    <>
      {timePieces(text).map((p, i) =>
        p.time ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: 조각 차례가 곧 자리다
          <span key={i} className="whitespace-nowrap">
            {p.text}
          </span>
        ) : (
          p.text
        ),
      )}
    </>
  );
}
