import type { StudyProgressStore } from "@/study/progress";
import { dueToday, localDay, reviewNext } from "@/study/review";

/*
 * 「오늘 복습」에서 연 문제를 다 풀면 「다음 문제」가 묶음의 다음 문제가 아니라 복습 줄의 다음 문제로 간다
 * (docs/23 「날짜 간격 복습」). 장기·체스·바둑·오목의 문제 화면과 수순 화면이 함께 쓴다.
 */

export interface ReviewRun {
  /** 복습 줄에서 지금 문제 차례(0부터)와 줄 길이(머리줄 「오늘 복습 2/5」) */
  index: number;
  total: number;
  /** 다음으로 풀 복습 문제. 부를 때의 기록으로 센다(방금 푼 문제가 기록된 뒤에 그린다). 없으면 null */
  next: () => string | null;
  /** 복습 줄의 다른 문제를 연다 */
  open: (id: string) => void;
  /** 복습 줄을 끝냈다(목록으로 돌아가 「오늘 복습을 다 했어요.」) */
  done: () => void;
}

/**
 * 화면 상태에 남긴 복습 줄(`queue`)로 지금 문제의 복습 흐름을 만든다. 복습으로 연 문제가 아니면 undefined.
 * `now`는 시험이 넣는 때(제품은 부를 때마다 지금)
 */
export function reviewRunFor({
  queue,
  current,
  progress,
  open,
  done,
  now = Date.now,
}: {
  queue: readonly string[] | undefined;
  current: string;
  progress: StudyProgressStore;
  open: (id: string, queue: readonly string[]) => void;
  done: () => void;
  now?: () => number;
}): ReviewRun | undefined {
  if (!queue) return undefined;
  const index = queue.indexOf(current);
  if (index < 0) return undefined;
  return {
    index,
    total: queue.length,
    next: () => {
      const records = progress.getState().records;
      const still = new Set(dueToday(queue, records, now(), localDay));
      return reviewNext(queue, current, (id) => still.has(id));
    },
    open: (id) => open(id, queue),
    done,
  };
}

/** 푼 뒤 단추: 복습 중이면 복습 줄의 다음 문제(줄 끝이면 「복습 마치기」), 아니면 묶음의 다음 */
export function nextButton(
  review: ReviewRun | undefined,
  onNext: (() => void) | null,
  onExit: () => void,
  nextLabel: string,
): { label: string; onClick: () => void } {
  if (review) {
    const id = review.next();
    return id
      ? { label: "다음 문제", onClick: () => review.open(id) }
      : { label: "복습 마치기", onClick: review.done };
  }
  return onNext
    ? { label: nextLabel, onClick: onNext }
    : { label: "목록으로", onClick: onExit };
}
