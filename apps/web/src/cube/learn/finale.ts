// 과정 끝 마무리 단원(docs/47 8-1): 단계별 해 보기는 앞 단계까지 맞춘 상태에서 시작하므로,
// 섞인 큐브 하나를 처음부터 끝까지 맞춰 보는 단원을 과정 끝에 붙인다. 단원 자료 파일을 고치지 않고 과정 정의(index.ts)에서 붙인다.
import type { AlgSet, Course, Lesson, ScrambleRule } from "./types";

export interface FinaleSpec {
  /** 모두 섞는 규칙(random-cross·2x2-random·4x4-random 등) */
  rule: ScrambleRule;
  /** 배운 차례(단계 이름) */
  stages: string[];
  /** 이 마무리 뒤에 이어 할 공식 훈련 묶음 */
  drill?: AlgSet;
}

/** 차례 고르기 문제의 틀린 보기: 센터 둘을 바꾼 것, 뒤 둘을 바꾼 것 */
function shuffledOrders(stages: string[]): string[][] {
  const swap = (i: number, j: number) => {
    const s = [...stages];
    [s[i], s[j]] = [s[j] as string, s[i] as string];
    return s;
  };
  const last = stages.length - 1;
  return [swap(0, 1), swap(last - 1, last)];
}

export function finaleLesson(course: Course, spec: FinaleSpec): Lesson {
  const order = spec.stages.join(" → ");
  const [wrongA, wrongB] = shuffledOrders(spec.stages).map((s) =>
    s.join(" → "),
  );
  return {
    id: `${course.id}-finale`,
    size: course.size,
    title: "처음부터 끝까지",
    summary: "섞인 큐브 하나를 배운 차례대로 끝까지 맞춰요.",
    ...(spec.drill ? { drill: spec.drill } : {}),
    steps: [
      {
        kind: "quiz",
        body: "단원마다 해 본 해 보기는 앞 단계까지 맞춘 큐브에서 시작했어요. 이제 섞인 큐브 하나를 처음부터 끝까지 혼자 맞춰요. 먼저 차례를 떠올려 보세요.",
        setup: { rule: spec.rule },
        quiz: {
          question: "맞추는 차례로 알맞은 것은?",
          // 답 자리를 가운데에 둔다
          choices: [wrongA as string, order, wrongB as string],
          answer: 1,
          why: `${order} 차례예요. 막히면 그 단원으로 돌아가 다시 봐도 돼요.`,
        },
      },
      {
        kind: "try",
        body: `섞인 큐브를 끝까지 맞춰요(${order}). 「다른 상황」으로 몇 번이고 새로 섞을 수 있어요.`,
        setup: { rule: spec.rule },
        goal: "solved",
      },
    ],
  };
}

/** 과정 끝에 마무리 단원을 붙인 새 과정 */
export function withFinale(course: Course, spec: FinaleSpec): Course {
  return {
    ...course,
    lessons: [...course.lessons, finaleLesson(course, spec)],
  };
}
