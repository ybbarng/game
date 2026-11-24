/*
 * 체스 메이트 문제(docs/23, docs/26). 늘 백이 둘 차례다. 판 모양은 FEN, 정답은 기보(SAN)로 쓴다.
 * 장면은 엔진으로 "메이트 수가 하나뿐인 장면"을 찾아 골랐고(`mateInOneMoves`·`mateInTwoMoves`),
 * study.test.ts가 모든 문제를 다시 확인한다(정답 뒤 메이트인지, 정답 말고 같은 수 안의 메이트가 없는지).
 * 해설은 엔진이 장면에서 만든다.
 */

import { TACTIC_NAMES, type Tactic } from "./tactics";

/**
 * 메이트 문제의 주제(묶음 「뒷줄 메이트」·「빗나가게 하기」).
 * - back-rank: 흑 킹이 자기 폰에 막혀 8번째 가로줄을 벗어나지 못할 때 그 가로줄로 체크해 메이트
 * - deflection: 메이트할 칸을 지키는 흑 기물을 첫 수로 다른 칸에 끌어내고, 다음 수에 그 칸에서 메이트
 */
export type MateTheme = "back-rank" | "deflection";

/**
 * 문제 하나. 늘 백이 둘 차례다.
 * - mate: `mateIn`수 만에 메이트. 마지막 수는 메이트면 어느 수든 정답이다. 주제(`theme`)가 있으면 해설에 한 줄 더한다
 * - tactic: 포크·핀·스큐어·발견 공격으로 기물을 얻는 수. 정답 수 하나뿐
 * - endgame: 킹과 폰 끝내기에서 이기는 수. 정답 수 하나뿐(킹+폰 대 킹 승패표 `@game/chess-ai`의 `kpk.ts`로 확인)
 * - outside: 바깥 패스 폰 끝내기에서 이기는 수. 정답 수 하나뿐(킹과 폰 판 끝까지 읽기 `@game/chess-ai`의 `pawn-ending.ts`로 확인)
 */
export type ChessPuzzle = {
  id: string;
  fen: string;
  /** 첫 정답 수(SAN) */
  solution: string;
} & (
  | { kind: "mate"; mateIn: 1 | 2 | 3; theme?: MateTheme }
  | { kind: "tactic"; tactic: Tactic }
  | { kind: "endgame" }
  | { kind: "outside" }
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
 * 세 수 메이트(2026-11-17): 기물을 무작위로 놓은 판에서 엔진으로 "한 수·두 수 메이트는 없고, 세 수 메이트의
 * 첫 수가 하나뿐인" 판을 찾아 골랐다(`mateInThreeMoves`). 남의 문제집에서 옮긴 것은 없다.
 * mate3.test.ts가 흑의 모든 응수에 대해 정말 세 수 안에 메이트가 되는지 다시 확인한다.
 * 둘째 수부터는 남은 수 안에 메이트가 되면 어느 수든 정답이다.
 */
const MATE_IN_THREE: readonly Raw[] = [
  // 조용한 첫 수: 체크 없이 킹이 갈 곳을 먼저 줄인다
  { fen: "3k4/2p5/2p5/8/6R1/6Q1/8/4K3 w - - 0 30", solution: "Rg7" },
  { fen: "5k2/2P3R1/8/8/1n6/8/5K2/4N3 w - - 0 30", solution: "Rd7" },
  { fen: "3k4/B1p5/2P5/5B2/1R6/K7/8/8 w - - 0 30", solution: "Bc5" },
  { fen: "k6B/8/1P6/8/2R5/2R5/8/2K5 w - - 0 30", solution: "Rc7" },
  { fen: "k7/8/8/8/8/3P4/2b2K2/4R2R w - - 0 30", solution: "Re7" },
  { fen: "3Bk3/5p2/3p4/2B5/1P6/5Q2/8/6K1 w - - 0 30", solution: "Qf6" },
  { fen: "2k5/2pp4/3p4/2N5/8/3Q4/K7/8 w - - 0 30", solution: "Qd5" },
  { fen: "8/5Nk1/6pp/6p1/8/1N6/3P4/2K2Q2 w - - 0 30", solution: "Ne5" },
  { fen: "5k2/8/1R2pp2/8/1P6/1R5K/1P6/8 w - - 0 30", solution: "Rb7" },
  // 체크로 시작한다
  { fen: "2k5/2p5/2p5/8/8/3RB1P1/3R4/7K w - - 0 30", solution: "Rd8+" },
  { fen: "4R2N/7k/8/8/8/1R4P1/2K5/8 w - - 0 30", solution: "Rb7+" },
  { fen: "8/k7/1p1B4/2N3R1/8/8/2K5/8 w - - 0 30", solution: "Rg7+" },
  { fen: "2B4k/7p/6pp/8/8/8/8/4K1Q1 w - - 0 30", solution: "Qd4+" },
  // 흑 퀸을 잡으며 시작한다
  { fen: "k7/1p6/3q4/8/1Q2R3/8/2K5/8 w - - 0 30", solution: "Qxd6" },
];

/*
 * 킹과 폰 끝내기(2026-11-03): 킹+폰 대 킹 승패표(`@game/chess-ai`의 `kpk.ts`)로 "이기는 수가 킹 수 하나뿐이고,
 * 폰부터 밀면 비기는" 판을 찾아 골랐다. kpk.test.ts가 모든 문제를 다시 확인한다.
 */
/**
 * 바깥 패스 폰: 폰 수는 두 편이 같다. 백은 판 가장자리 쪽(a·b줄)에 패스 폰 하나와 반대쪽 폰 하나, 흑은 반대쪽에 폰 둘.
 * 직접 만든 판을 킹과 폰 끝까지 읽기(`pawn-ending.ts`)로 찾아 골랐다(「이기는 수는 정답 하나뿐, 다른 수는 모두 이기지 못함」).
 * outside.test.ts가 같은 방식으로 다시 확인한다
 */
const OUTSIDE_PAWN: readonly Raw[] = [
  // 흑 킹이 a폰을 잡으러 가는 사이 백 킹은 반대쪽 흑 폰으로 간다
  { fen: "8/7p/8/2k2p2/P7/5KP1/8/8 w - - 0 40", solution: "Kf4" },
  { fen: "8/8/7p/5p2/Pk6/6P1/3K4/8 w - - 0 40", solution: "Ke3" },
  { fen: "8/5p2/8/6p1/Pk4P1/8/2K5/8 w - - 0 40", solution: "Kd3" },
  { fen: "8/8/5pp1/2k5/P7/6P1/6K1/8 w - - 0 40", solution: "Kf3" },
  // b줄 패스 폰도 반대쪽 폰들과 멀리 떨어져 있으면 바깥 패스 폰이다
  { fen: "8/8/6p1/1k3p2/1P1K4/6P1/8/8 w - - 0 40", solution: "Ke5" },
  // 흑 킹이 a폰 옆에 왔다: 폰을 한 칸 더 밀어 흑 킹을 더 멀리 끌고 간다
  { fen: "8/5pp1/8/8/P3KP2/1k6/8/8 w - - 0 40", solution: "a5" },
  { fen: "8/6pp/8/8/P7/1k3KP1/8/8 w - - 0 40", solution: "a5" },
];

const KING_AND_PAWN: readonly Raw[] = [
  // 마주 보기(옵포지션): 킹끼리 한 칸 띄우고 마주 서서 흑 킹을 비키게 한다
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
  // 2026-11-17 더함(승패표로 찾아 고름, 직접 만든 판)
  // 옆으로 마주 보기: 같은 가로줄에서 한 칸 띄우고 마주 선다
  { fen: "8/8/4k3/2K5/3P4/8/8/8 w - - 0 50", solution: "Kc6" },
  // 마주 보기: 폰이 멀리 앞서 있어도 킹끼리 먼저 마주 선다
  { fen: "3k4/8/2P1K3/8/8/8/8/8 w - - 0 50", solution: "Kd6" },
  // 먼 마주 보기: 킹끼리 세 칸 띄우고 마주 선다. 흑 킹이 다가오면 백도 다가가 한 칸 띄운 마주 보기가 된다
  { fen: "5k2/8/8/8/8/3P2K1/8/8 w - - 0 50", solution: "Kf4" },
  { fen: "8/4k3/8/8/8/8/2P2K2/8 w - - 0 50", solution: "Ke3" },
  { fen: "8/4k3/8/8/8/8/3K2P1/8 w - - 0 50", solution: "Ke3" },
  // 킹이 폰보다 먼저: 폰 옆에 있던 킹이 폰 앞 칸으로 올라선다
  { fen: "8/4k3/8/8/1K1P4/8/8/8 w - - 0 50", solution: "Kc5" },
  { fen: "8/3k4/8/8/K1P5/8/8/8 w - - 0 50", solution: "Kb5" },
  { fen: "8/8/6k1/8/4KP2/8/8/8 w - - 0 50", solution: "Ke5" },
];

/*
 * 메이트 주제 묶음(2026-11-24): 흑 킹을 구석에 자기 폰과 함께 두고 나머지 기물을 무작위로 놓은 판에서
 * 엔진으로 "메이트 수가 하나뿐인 판"을 찾아 골랐다(`mateInOneMoves`·`mateInTwoMoves`, 남의 문제집에서 옮긴 것은 없다).
 * study.test.ts가 정답 유일성을, puzzle-themes.test.ts가 주제 모양을 다시 확인한다.
 */
type ThemedRaw = Raw & { mateIn: 1 | 2 };

/** 뒷줄 메이트: 한 수 둘로 모양을 익히고, 뒷줄을 지키는 흑 기물을 먼저 떼어 내는 두 수로 */
const BACK_RANK: readonly ThemedRaw[] = [
  // 한 수: 흑 킹 앞 가로줄이 자기 폰으로 막혔다
  {
    fen: "1k6/ppp5/3p3R/4p3/4P3/1P6/K7/4N2N w - - 0 30",
    solution: "Rh8#",
    mateIn: 1,
  },
  {
    fen: "7k/6pp/2n2R2/3n3p/8/4P3/2P3K1/1BQ5 w - - 0 30",
    solution: "Rf8#",
    mateIn: 1,
  },
  // 두 수: 체크로 끝줄을 막게 한 뒤 막은 기물을 잡으며 메이트
  {
    fen: "r1n3k1/5ppp/6p1/1p6/4r1P1/2NR4/8/6K1 w - - 0 30",
    solution: "Rd8+",
    mateIn: 2,
  },
  {
    fen: "7k/3n2pp/8/2Q5/2P4R/8/5K2/8 w - - 0 30",
    solution: "Qc8+",
    mateIn: 2,
  },
  {
    fen: "6k1/2B2ppp/q2p4/8/1R2P3/8/6PK/8 w - - 0 30",
    solution: "Rb8+",
    mateIn: 2,
  },
  // 두 수: 뒷줄을 지키는 흑 룩을 잡아 없앤다
  {
    fen: "r5k1/1R3ppp/8/Qp1r4/1n1p4/8/NK4P1/8 w - - 0 30",
    solution: "Qxa8+",
    mateIn: 2,
  },
  {
    fen: "k4r2/pp2B3/1q6/8/8/8/K7/5R2 w - - 0 30",
    solution: "Rxf8+",
    mateIn: 2,
  },
  {
    fen: "4r2k/6pp/5r2/4Q3/8/7B/1R4P1/2K5 w - - 0 30",
    solution: "Qxe8+",
    mateIn: 2,
  },
];

/**
 * 빗나가게 하기(모두 두 수): 첫 수로 기물을 내주면 지키던 흑 기물이 잡으러 와 자리를 비운다.
 * 같은 칸에서 되잡는 판(Qf8+ Rxf8 Qxf8#)은 「지키는 기물 없애기」라 뺐다
 */
const DEFLECTION: readonly Raw[] = [
  // 8번째 가로줄을 지키는 룩을 7번째 가로줄로 끌어낸다
  { fen: "6rk/6pp/8/Q7/3B4/8/8/Q4K2 w - - 0 30", solution: "Bxg7+" },
  { fen: "kr6/pp6/2B5/5p2/2P5/Q4B2/K7/8 w - - 0 30", solution: "Bxb7+" },
  { fen: "kr6/pp6/1Q2R3/8/2p5/8/4P1B1/3K4 w - - 0 30", solution: "Qxb7+" },
  { fen: "kr4b1/pp4Q1/2Q5/8/8/8/3P2P1/2K2R2 w - - 0 30", solution: "Qgxb7+" },
  { fen: "6rk/b5pp/6Q1/6p1/6P1/P7/1QR5/2K5 w - - 0 30", solution: "Qgxg7+" },
  // 킹 앞 폰을 지키는 퀸을 8번째 가로줄로 끌어낸다
  { fen: "3r3k/6pp/3QN3/6q1/6Q1/6P1/8/K7 w - - 0 30", solution: "Qxd8+" },
  { fen: "k2r4/pp6/1q3Q2/2Q3n1/8/R6P/8/7K w - - 0 30", solution: "Qxd8+" },
  // 8번째 가로줄의 룩을 지키는 퀸을 g7로 끌어낸다
  {
    fen: "4r1k1/3Q1ppp/6RQ/p3q3/1P1b2P1/8/3K4/8 w - - 0 30",
    solution: "Qxg7+",
  },
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
    summary:
      "한 기물로 두 곳을 함께 노려요. 흑은 하나만 지킬 수 있어요. 이런 수를 포크라고 해요.",
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
      "기물은 퀸, 룩, 비숍과 나이트, 폰 차례로 값이 높아요. 내 룩·비숍·퀸이 한 줄로 흑 기물을 노리는데 그 너머 같은 줄에 값이 더 높은 흑 기물이 있으면, 앞 기물이 비킬 때 뒤 기물이 잡혀요. 뒤가 킹이면 앞 기물은 아예 비킬 수 없어요. 이렇게 앞 기물을 그 자리에 묶는 수를 핀이라고 해요.",
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
    summary:
      "내 룩·비숍·퀸으로 흑 킹이나 퀸을 한 줄로 노려 비키게 하고, 그 너머 같은 줄에 있던 흑 기물을 잡아요. 핀과 반대로 앞에 값이 더 높은 기물이 있어요. 이런 수를 스큐어라고 해요.",
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
      "내 룩·비숍·퀸의 길을 막고 있던 내 기물이 비키면, 그 길이 열려 흑 기물을 노리게 돼요. 비킨 기물도 다른 곳을 노려서, 흑은 두 노림을 한 번에 막지 못해요. 이런 수를 발견 공격이라고 해요.",
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
    summary: "한 수로 체크를 걸어 킹이 피할 곳을 없애요.",
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
    summary: "상대가 어떻게 받아도 다음 수에 메이트가 되는 첫 수를 찾아요.",
    puzzles: MATE_IN_TWO.map((p, i) => ({
      id: `mate2-${i + 1}`,
      kind: "mate",
      mateIn: 2,
      ...p,
    })),
  },
  {
    id: "mate3",
    title: "세 수 메이트",
    summary:
      "상대가 어떻게 받아도 세 수 안에 메이트가 되는 첫 수를 찾아요. 둘째 수부터는 메이트로 가는 수면 무엇이든 돼요.",
    puzzles: MATE_IN_THREE.map((p, i) => ({
      id: `mate3-${i + 1}`,
      kind: "mate",
      mateIn: 3,
      ...p,
    })),
  },
  {
    id: "king-pawn",
    title: "킹과 폰",
    summary:
      "킹과 폰 하나가 킹 하나를 이기는 판이에요. 폰부터 밀면 비겨요. 폰보다 킹을 먼저 움직여 이기는 한 수를 찾아요.",
    puzzles: KING_AND_PAWN.map((p, i) => ({
      id: `king-pawn-${i + 1}`,
      kind: "endgame" as const,
      ...p,
    })),
  },
  {
    id: "outside-pawn",
    title: "바깥 패스 폰",
    summary:
      "폰 앞쪽으로 같은 세로줄과 바로 옆 세로줄에 상대 폰이 하나도 없으면, 끝줄까지 가는 길을 막을 폰이 없어요. 이런 폰을 패스 폰이라고 해요. 판 가장자리 쪽에서 다른 폰들과 멀리 떨어진 패스 폰은 바깥 패스 폰이라고 해요. 폰은 서 있는 세로줄 이름을 붙여 a폰·b폰처럼 불러요. 흑 킹이 바깥 패스 폰을 막으러 멀리 가는 사이, 백 킹은 반대쪽 흑 폰을 잡으러 가요. 이기는 단 하나의 수를 찾아요.",
    puzzles: OUTSIDE_PAWN.map((p, i) => ({
      id: `outside-pawn-${i + 1}`,
      kind: "outside" as const,
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
  {
    id: "back-rank",
    title: "뒷줄 메이트",
    summary:
      "흑 킹이 흑 쪽 끝 가로줄(8번째 가로줄)에 있고, 킹 바로 아래 7번째 가로줄 칸들을 흑 폰이 막고 있으면 킹은 8번째 가로줄을 벗어나지 못해요. 그때 룩이나 퀸으로 8번째 가로줄을 따라 체크하면 킹이 피할 곳이 없어요. 흑 쪽에서 보면 맨 뒷줄이라 이런 메이트를 뒷줄 메이트라고 해요. 처음 두 문제는 한 수로 메이트해요. 나머지는 두 수 메이트예요. 8번째 가로줄을 지키는 흑 기물을 첫 수로 잡거나, 체크로 막으러 오게 한 뒤 다음 수에 그 기물을 잡으며 메이트해요.",
    puzzles: BACK_RANK.map(({ mateIn, ...p }, i) => ({
      id: `back-rank-${i + 1}`,
      kind: "mate" as const,
      mateIn,
      theme: "back-rank" as const,
      ...p,
    })),
  },
  {
    id: "deflection",
    title: "빗나가게 하기",
    summary:
      "흑 기물 하나가 메이트할 칸을 지키고 있으면 그 칸에서 메이트할 수 없어요. 그 기물이 잡거나 막으러 갈 수밖에 없는 수를 먼저 두면, 그 기물은 다른 칸으로 끌려가고 지키던 칸이 비어요. 이렇게 지키는 기물을 제자리에서 끌어내는 수를 빗나가게 하기라고 해요. 모두 두 수 메이트예요. 첫 수로 지키는 기물을 끌어내고, 다음 수에 그 기물이 지키던 칸에서 메이트해요.",
    puzzles: DEFLECTION.map((p, i) => ({
      id: `deflection-${i + 1}`,
      kind: "mate" as const,
      mateIn: 2 as const,
      theme: "deflection" as const,
      ...p,
    })),
  },
];
