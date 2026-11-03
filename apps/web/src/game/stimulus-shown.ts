/**
 * 판(자극)을 실제로 그린 프레임 시각을 적는 조각(docs/43 4-1 `useStimulusShown`, 2-1 "그 판 번호" 규칙).
 *
 * 판 번호가 바뀐 화면을 React가 DOM에 반영하면, 바로 다음 `requestAnimationFrame` 콜백 시각을 `shownAt`으로
 * 적는다. 그 프레임이 바뀐 화면을 그리는 프레임이다(docs/31 방법 3: 한 프레임 안 오차).
 * `requestAnimationFrame` 시각·`event.timeStamp`·`performance.now`는 같은 기준이라 바로 빼서 rt를 낸다.
 * 누르면 누른 시각 이전에 그려진 마지막 판을 `seen`으로 삼는다. 그래서 rt는 늘 0 이상이고,
 * 새 판이 뜨기 직전 누름은 옛 판 청구가 된다.
 */
import { useCallback, useLayoutEffect, useRef } from "react";

export interface ShownEntry {
  stimulus: number;
  shownAt: number;
}

export interface SeenStimulus extends ShownEntry {
  /** pressedAt − shownAt, 0 이상 */
  rtMs: number;
}

/** 그린 판의 목록(오래된 것은 버린다) */
export class ShownHistory {
  private readonly entries: ShownEntry[] = [];

  constructor(private readonly keep = 32) {}

  record(stimulus: number, shownAt: number): void {
    // 같은 판을 두 번 적지 않는다(다시 그리기)
    if (this.entries.some((e) => e.stimulus === stimulus)) return;
    this.entries.push({ stimulus, shownAt });
    this.entries.sort((a, b) => a.shownAt - b.shownAt);
    if (this.entries.length > this.keep) this.entries.shift();
  }

  /** 누른 순간 화면에 있던 판. 아직 아무 판도 그리지 않았으면 null */
  seen(pressedAt: number): SeenStimulus | null {
    let found: ShownEntry | null = null;
    for (const entry of this.entries)
      if (entry.shownAt <= pressedAt) found = entry;
    return found ? { ...found, rtMs: pressedAt - found.shownAt } : null;
  }

  shownAt(stimulus: number): number | null {
    return this.entries.find((e) => e.stimulus === stimulus)?.shownAt ?? null;
  }

  list(): readonly ShownEntry[] {
    return this.entries;
  }
}

type Raf = (callback: (time: number) => void) => number;

/**
 * 판 번호(`stimulus`, 아직 없으면 null)가 바뀌면 그린 프레임 시각을 적는다.
 * `onShown`은 적은 순간 불린다(측정 화면이 자동 누르기를 걸 때).
 */
export function useStimulusShown(
  stimulus: number | null,
  {
    onShown,
    raf,
    cancelRaf,
  }: {
    onShown?: (entry: ShownEntry) => void;
    raf?: Raf;
    cancelRaf?: (id: number) => void;
  } = {},
): {
  seen(pressedAt: number): SeenStimulus | null;
  history: ShownHistory;
} {
  const history = useRef(new ShownHistory()).current;
  const onShownRef = useRef(onShown);
  onShownRef.current = onShown;

  useLayoutEffect(() => {
    if (stimulus === null) return;
    const request: Raf = raf ?? ((cb) => requestAnimationFrame(cb));
    const cancel = cancelRaf ?? ((id: number) => cancelAnimationFrame(id));
    const id = request((time) => {
      history.record(stimulus, time);
      onShownRef.current?.({ stimulus, shownAt: time });
    });
    return () => cancel(id);
  }, [stimulus, history, raf, cancelRaf]);

  const seen = useCallback(
    (pressedAt: number) => history.seen(pressedAt),
    [history],
  );
  return { seen, history };
}
