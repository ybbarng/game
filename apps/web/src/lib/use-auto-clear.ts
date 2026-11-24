import { useEffect } from "react";

/** 잠깐 뜨는 알림(잘못 누름, 차례 아님 등)이 머무는 시간. 모든 게임이 같은 시간을 쓴다 */
export const NOTICE_MS = 2200;

/** 값(알림 글)이 생기면 `ms` 뒤에 `clear`를 부른다. 그 전에 값이 바뀌면 다시 잰다 */
export function useAutoClear(
  value: unknown,
  clear: () => void,
  ms: number = NOTICE_MS,
): void {
  useEffect(() => {
    if (!value) return;
    const id = setTimeout(clear, ms);
    return () => clearTimeout(id);
  }, [value, clear, ms]);
}
