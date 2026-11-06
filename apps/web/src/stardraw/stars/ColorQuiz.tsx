"use client";

import {
  Quiz,
  type QuizFeedback,
  type QuizItem,
} from "@/components/learn/Quiz";

/** 별의 색 확인해 보기(2026-11-02 배우기 「덧붙임: 별의 색」에서 옮김) */
const ITEMS: QuizItem[] = [
  {
    q: "해의 빛 곡선은 꼭대기가 청록 근처(약 500 nm)입니다. 그런데 해가 흰빛인 까닭은?",
    options: [
      "대기가 초록을 걸러서",
      "곡선이 넓어 빨강·파랑도 함께 덮어서",
      "눈이 초록을 못 느껴서",
    ],
    answer: 1,
    why: "빨강·초록·파랑이 고루 섞이면 눈에는 흰빛입니다.",
  },
  {
    q: "분홍 별이 없는 까닭은?",
    options: [
      "별빛 곡선은 봉우리가 하나라 가운데 초록만 비울 수 없어서",
      "분홍 별은 너무 어두워 안 보여서",
      "분홍이 되려면 너무 뜨거워야 해서",
    ],
    answer: 0,
    why: "분홍은 빨강과 파랑이 있고 초록이 빠진 빛입니다. 봉우리가 둘이어야 합니다.",
  },
  {
    q: "번호 공을 실제 별빛보다 진하게 칠한 까닭은?",
    options: [
      "실제 별이 그만큼 진해서",
      "실제 색은 서로 비슷해 공으로는 구별이 안 돼서",
      "화면이 옅은 색을 못 내서",
    ],
    answer: 1,
    why: "공은 구별하려는 표시입니다. 별의 진짜 빛은 하늘 그림에 있습니다.",
  },
];

/** 별 이야기 본문이 합니다체라 채점 말도 맞춘다 */
const FEEDBACK: QuizFeedback = {
  right: "맞았습니다.",
  wrong: "다시 생각해 보세요.",
};

export function ColorQuiz() {
  return <Quiz items={ITEMS} onPass={() => {}} feedback={FEEDBACK} />;
}
