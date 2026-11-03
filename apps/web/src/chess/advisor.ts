import { createChessExpertBot } from "@game/chess-ai";

/**
 * 화면 스레드에서 「고수라면 이렇게」를 바로 보여 줄 때 쓰는 고수(다시 보기 해설·힌트·문제의 받는 수).
 * 대국 상대인 고수(판 수 상한 8만, 한 수 가장 길게 약 0.7초)를 그대로 쓰면 다시 보기 한 걸음에 고수를 두 번 불러
 * 화면이 멈춘다. 같은 탐색에 상한만 2만으로 낮춰 4배쯤 빠르게 한다(같은 시드면 같은 수인 성질은 그대로)
 */
export const chessAdvisor = createChessExpertBot(20_000);
