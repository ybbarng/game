/*
 * 체스 메이트 문제(docs/23, docs/26). 늘 백이 둘 차례다. 판 모양은 FEN, 정답은 기보(SAN)로 쓴다.
 * 장면은 엔진으로 "메이트 수가 하나뿐인 장면"을 찾아 골랐고(`mateInOneMoves`·`mateInTwoMoves`),
 * study.test.ts가 모든 문제를 다시 확인한다(정답 뒤 메이트인지, 정답 말고 같은 수 안의 메이트가 없는지).
 * 해설은 엔진이 장면에서 만든다.
 */

import { TACTIC_NAMES, type Tactic } from "./tactics";

/**
 * 문제 하나. 늘 백이 둘 차례다.
 * - mate: `mateIn`수 만에 메이트. 마지막 수는 메이트면 어느 수든 정답이다
 * - tactic: 포크·핀·스큐어·발견 공격으로 기물을 얻는 수. 정답 수 하나뿐
 * - endgame: 킹과 폰 끝내기에서 이기는 수. 정답 수 하나뿐(킹+폰 대 킹 승패표 `@game/chess-ai`의 `kpk.ts`로 확인)
 */
export type ChessPuzzle = {
  id: string;
  fen: string;
  /** 첫 정답 수(SAN) */
  solution: string;
} & (
  | { kind: "mate"; mateIn: 1 | 2 }
  | { kind: "tactic"; tactic: Tactic }
  | { kind: "endgame" }
);

export interface ChessPuzzleSet {
  id: string;
  title: string;
  summary: string;
  puzzles: readonly ChessPuzzle[];
}

type Raw = { fen: string; solution: string };

const MATE_IN_ONE: readonly Raw[] = [
  // 끝줄(백랭크): 자기 폰에 갇힌 킹
  { fen: "6k1/5ppp/6r1/1R6/8/6P1/K3P3/8 w - - 0 30", solution: "Rb8#" },
  { fen: "7k/6pp/8/8/8/R7/P1P1K1B1/8 w - - 0 30", solution: "Ra8#" },
  { fen: "k7/pp6/8/N7/8/5P2/1N6/2R2K2 w - - 0 30", solution: "Rc8#" },
  { fen: "7k/2r3pp/8/8/8/5Q2/2P1KP2/8 w - - 0 30", solution: "Qf8#" },
  { fen: "6k1/5ppp/5R2/8/8/4Q3/1K5P/8 w - - 0 30", solution: "Qe8#" },
  // 지키는 기물을 잡으며 메이트
  { fen: "1r4k1/1B3ppp/8/8/4N3/7P/1K3P1Q/8 w - - 0 30", solution: "Qxb8#" },
  { fen: "1k6/Rp3prR/2Q5/8/8/5P2/4P3/1K6 w - - 0 30", solution: "Qxb7#" },
  // 다른 기물이 도망칠 칸을 막아 준다
  { fen: "7k/1n4pp/2n2N2/8/4R3/3P4/K7/8 w - - 0 30", solution: "Re8#" },
  { fen: "4k3/2Q5/4bp2/8/3R4/5P1P/5K2/8 w - - 0 30", solution: "Rd8#" },
  { fen: "k7/p7/1Q6/8/8/N7/2R1P1P1/1K6 w - - 0 30", solution: "Rc8#" },
  { fen: "2k5/1pp2N2/3p4/4Q3/8/5P2/7R/6K1 w - - 0 30", solution: "Qe8#" },
  { fen: "4k3/3ppp1r/7B/8/8/2R4R/PPP1K3/8 w - - 0 30", solution: "Rc8#" },
];

const MATE_IN_TWO: readonly Raw[] = [
  // 체크로 몰아 막는 기물을 떼어 낸다
  { fen: "1k6/ppp5/8/3q4/4R3/8/1K6/8 w - - 0 30", solution: "Re8+" },
  { fen: "6k1/5p2/8/6N1/8/7Q/6P1/3N2K1 w - - 0 30", solution: "Qh7+" },
  { fen: "2k5/1p1p4/R7/3Q4/8/2P5/2P2P2/2K5 w - - 0 30", solution: "Ra8+" },
  // 핀: g7 폰은 비숍에 묶여 퀸을 잡지 못한다
  { fen: "q6k/6p1/3p4/4B3/8/8/3Q2PP/1K6 w - - 0 30", solution: "Qh6+" },
  // 조용한 첫 수: 체크 없이 킹이 갈 곳을 먼저 막는다
  { fen: "k7/1p6/p7/1Q6/3R4/3P4/P7/K7 w - - 0 30", solution: "Qb6" },
  { fen: "3k4/8/8/5Q2/1R6/8/3BK2P/8 w - - 0 30", solution: "Rb7" },
  { fen: "7k/7p/5Np1/R5p1/8/3P4/P1KQ4/8 w - - 0 30", solution: "Ra7" },
  // 2026-11-03 더함(엔진으로 찾음). 끝줄로 끌어내기·막는 기물 떼어 내기
  { fen: "7k/6pp/3b4/N7/8/P7/1R3PQ1/3K4 w - - 0 30", solution: "Qa8+" },
  { fen: "7k/R2b2pp/8/8/N7/7P/3P4/K7 w - - 0 30", solution: "Ra8+" },
  { fen: "8/1k6/1p6/pQ5R/8/8/1P3P2/2K5 w - - 0 30", solution: "Rh7+" },
  { fen: "4kN2/3ppp2/4B3/8/2PQ4/8/8/3K4 w - - 0 30", solution: "Bxd7+" },
  { fen: "6k1/4pppp/8/6R1/4PNR1/8/5K2/8 w - - 0 30", solution: "Rxg7+" },
  // 조용한 첫 수: 그물을 먼저 치고 다음 수에 끝낸다
  { fen: "6k1/5p1p/6p1/2R3B1/2Q3P1/5P2/8/K7 w - - 0 30", solution: "Bh6" },
  { fen: "6Nk/7p/8/8/1P6/6R1/3K2P1/8 w - - 0 30", solution: "Nf6" },
  { fen: "4N1k1/6pp/8/8/4Q3/4N2P/K3P3/8 w - - 0 30", solution: "Qe7" },
  { fen: "k7/pp5n/8/8/1Q4B1/4P3/7P/1K6 w - - 0 30", solution: "Bf3" },
  { fen: "1k6/p3p3/1pR5/1Q6/1P3P2/8/2K5/8 w - - 0 30", solution: "Qa6" },
];

/*
 * 킹과 폰 끝내기(2026-11-03): 킹+폰 대 킹 승패표(`@game/chess-ai`의 `kpk.ts`)로 "이기는 수가 킹 수 하나뿐이고,
 * 폰부터 밀면 비기는" 판을 찾아 골랐다. kpk.test.ts가 모든 문제를 다시 확인한다.
 */
const KING_AND_PAWN: readonly Raw[] = [
  // 맞서기(옵포지션): 킹끼리 한 칸 띄우고 마주 서서 흑 킹을 비키게 한다
  { fen: "3k4/8/8/2K1P3/8/8/8/8 w - - 0 50", solution: "Kd6" },
  { fen: "8/8/3k4/8/8/3PK3/8/8 w - - 0 50", solution: "Kd4" },
  { fen: "8/8/5k2/8/8/4PK2/8/8 w - - 0 50", solution: "Kf4" },
  // 킹이 폰보다 먼저: 폰 앞 칸을 킹이 차지한다
  { fen: "8/8/2k5/4K3/3P4/8/8/8 w - - 0 50", solution: "Ke6" },
  { fen: "8/8/2k5/4P3/4K3/8/8/8 w - - 0 50", solution: "Kf5" },
  { fen: "5k2/8/7K/5P2/8/8/8/8 w - - 0 50", solution: "Kg6" },
  // 돌아 나가기: 흑 킹을 옆으로 밀어내며 앞으로
  { fen: "8/3k4/8/5P2/5K2/8/8/8 w - - 0 50", solution: "Kg5" },
  { fen: "8/8/8/4k3/8/6P1/7K/8 w - - 0 50", solution: "Kh3" },
];

/*
 * 전술 문제: 엔진으로 찾은 장면이다. tactics.test.ts가 모든 문제를 다시 확인한다.
 * - 정답 수가 그 전술 모양이다(`tacticsOf`)
 * - 세 수(흑·백·흑) 앞과 잡기 끝까지 읽으면 정답이 기물을 폰 둘 이상 얻고, 다른 수는 정답보다 폰 둘 이상 못하다
 * 그냥 공짜 기물을 잡는 수는 정답에서 뺐다.
 */
const TACTIC_SETS: readonly {
  tactic: Tactic;
  summary: string;
  puzzles: readonly Raw[];
}[] = [
  {
    tactic: "fork",
    summary: "한 기물로 두 곳을 함께 노린다. 흑은 하나만 지킬 수 있다.",
    puzzles: [
      { fen: "7k/8/8/Pp1Q4/8/1K1n4/3p4/5b2 w - - 0 30", solution: "Qh1+" },
      { fen: "8/7k/7r/1N6/5b2/2K2B2/Q7/8 w - - 0 30", solution: "Qf7+" },
      { fen: "5R2/8/B2nk1q1/8/8/5K2/6NR/8 w - - 0 30", solution: "Nf4+" },
      { fen: "8/1k6/8/6p1/6rb/8/1P1Q4/5K2 w - - 0 30", solution: "Qd7+" },
      { fen: "4n3/5b2/2k5/8/6p1/1P1R1NK1/7P/8 w - - 0 30", solution: "Ne5+" },
      { fen: "8/6B1/k7/8/7r/8/2R1n1K1/8 w - - 0 30", solution: "Ra2+" },
      { fen: "8/8/n5k1/8/1R1N4/8/Kp6/8 w - - 0 30", solution: "Rb6+" },
      { fen: "1q5k/8/1N5n/3B4/8/8/5K1N/2R5 w - - 0 30", solution: "Rc8+" },
    ],
  },
  {
    tactic: "pin",
    summary:
      "앞 기물 뒤에 값이 더 높은 기물이 있으면 앞 기물이 비킬 때 뒤 기물이 잡힌다. 뒤가 킹이면 앞 기물은 아예 비킬 수 없다.",
    puzzles: [
      { fen: "8/2b4k/8/3b4/8/R4p2/5R2/2K5 w - - 0 30", solution: "Ra7" },
      { fen: "3bk3/5b2/8/8/8/6K1/8/2RR4 w - - 0 30", solution: "Rc8" },
      { fen: "8/8/2k2n2/4p3/6R1/6P1/7K/8 w - - 0 30", solution: "Rg6" },
      { fen: "4kq2/8/8/p7/4P2R/7R/1K6/5n1B w - - 0 30", solution: "Rh8" },
      { fen: "1b6/8/7k/8/8/4r3/1B6/4R1K1 w - - 0 30", solution: "Bc1" },
      { fen: "6k1/4p3/8/6nP/8/R7/2K5/8 w - - 0 30", solution: "Rg3" },
      { fen: "5Bk1/8/1p2r3/1p6/3pB3/8/1K6/2N5 w - - 0 30", solution: "Bd5" },
      { fen: "8/6k1/8/8/8/2q5/8/1KBB4 w - - 0 30", solution: "Bb2" },
    ],
  },
  {
    tactic: "skewer",
    summary: "앞의 킹이나 퀸을 노려 비키게 하고, 뒤에 있던 기물을 잡는다.",
    puzzles: [
      { fen: "3kq3/8/3p2PQ/3P4/8/8/1R6/3K4 w - - 0 30", solution: "Rb8+" },
      { fen: "3r4/1p6/3k4/7Q/8/4P3/2R5/6K1 w - - 0 30", solution: "Rd2+" },
      { fen: "8/8/1B3k2/8/5p1r/2N5/4K1b1/1N6 w - - 0 30", solution: "Bd8+" },
      { fen: "5bq1/8/1B1k4/5Q2/8/P5p1/1n2K3/7R w - - 0 30", solution: "Bc5+" },
      { fen: "5R2/r4P2/7k/2P3p1/p7/1R2p3/7b/3K4 w - - 0 30", solution: "Rh8+" },
      { fen: "b1k5/8/1p6/1P5B/8/1K6/1Q6/8 w - - 0 30", solution: "Qh8+" },
      { fen: "7r/6k1/6Pp/2P5/5B2/8/8/3K4 w - - 0 30", solution: "Be5+" },
    ],
  },
  {
    tactic: "discovered",
    summary:
      "앞을 막던 기물이 비키며 뒤 기물의 길을 연다. 흑은 두 노림을 한 번에 막지 못한다.",
    puzzles: [
      { fen: "8/k7/8/8/7p/r1B1RR2/8/3K4 w - - 0 30", solution: "Bd4+" },
      { fen: "8/1k6/1P2R3/2q2B1R/2p4n/8/8/7K w - - 0 30", solution: "Be4+" },
      { fen: "8/5k2/2R5/4p3/2N3nP/3R4/2q5/7K w - - 0 30", solution: "Nd6+" },
      { fen: "2k3r1/n2b4/8/2PQ4/8/8/B2KP3/8 w - - 0 30", solution: "Qa8+" },
      { fen: "8/1R3Bk1/2p5/8/5P2/3q2p1/8/2K5 w - - 0 30", solution: "Bc4+" },
      { fen: "b7/7k/8/7P/2q2p2/1P1R4/2Q3bK/r7 w - - 0 30", solution: "Rd7+" },
      { fen: "B2k4/8/1R2P3/B4r2/8/6r1/8/1K4n1 w - - 0 30", solution: "Rb5+" },
    ],
  },
];

export const CHESS_PUZZLE_SETS: readonly ChessPuzzleSet[] = [
  {
    id: "mate1",
    title: "한 수 메이트",
    summary: "한 수로 체크를 걸어 킹이 피할 곳을 없앤다.",
    puzzles: MATE_IN_ONE.map((p, i) => ({
      id: `mate1-${i + 1}`,
      kind: "mate",
      mateIn: 1,
      ...p,
    })),
  },
  {
    id: "mate2",
    title: "두 수 메이트",
    summary: "상대가 어떻게 받아도 다음 수에 메이트가 되는 첫 수를 찾는다.",
    puzzles: MATE_IN_TWO.map((p, i) => ({
      id: `mate2-${i + 1}`,
      kind: "mate",
      mateIn: 2,
      ...p,
    })),
  },
  {
    id: "king-pawn",
    title: "킹과 폰",
    summary:
      "킹과 폰 하나가 킹 하나를 이기는 판. 폰부터 밀면 비긴다. 킹을 먼저 앞세우는 한 수를 찾는다.",
    puzzles: KING_AND_PAWN.map((p, i) => ({
      id: `king-pawn-${i + 1}`,
      kind: "endgame" as const,
      ...p,
    })),
  },
  ...TACTIC_SETS.map((s) => ({
    id: s.tactic,
    title: TACTIC_NAMES[s.tactic],
    summary: s.summary,
    puzzles: s.puzzles.map((p, i) => ({
      id: `${s.tactic}-${i + 1}`,
      kind: "tactic" as const,
      tactic: s.tactic,
      ...p,
    })),
  })),
];
