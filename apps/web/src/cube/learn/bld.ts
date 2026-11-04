// 블라인드 올드 포흐만(Old Pochmann, 옛 포흐만 방법). 조각을 하나씩 「버퍼」 자리에서 제자리로 보낸다.
// 글자 붙이기는 널리 쓰는 Speffz 방식: 면마다 위 칸부터 시계 방향으로 A~X(위 A~D, 왼 E~H, 앞 I~L, 오른 M~P, 뒤 Q~T, 아래 U~X).
// 준비 수(setup)는 시뮬레이터로 가장 짧은 것을 찾아 적었다. 시험이 글자마다 「준비 → 바꾸기 공식 → 준비 되돌리기」가
// 버퍼와 그 글자만 맞바꾸는지 확인한다.
// 수순 확인: 올드 포흐만 순서(버퍼 위-오른쪽 모서리·위-뒤-왼쪽 꼭짓점, 바꾸기 공식 T퍼뮤·변형 Y퍼뮤, 패리티 Ra퍼뮤)와
//   Speffz 글자 방식은 널리 쓰는 방식을 기억으로 옮겼고 바깥 자료와 다시 대조하지는 못했다(2026-11-04) — 방식과 이름만 옮겼다.
//   글자 자리와 공식이 맞는지는 bld.test.ts가 시뮬레이터로 확인한다.
import type { AlgCase } from "./types";

export const BLD_ALGS: AlgCase[] = [
  {
    id: "bld-op-edge",
    set: "bld-op",
    name: "모서리 바꾸기(T퍼뮤)",
    algs: ["R U R' U' R' F R2 U' R' U' R U R' F'"],
    note: "버퍼 위-오른쪽(B) 모서리와 위-왼쪽(D) 자리를 맞바꿔요. 꼭짓점 위-앞-오른쪽·위-뒤-오른쪽도 함께 바뀌어요.",
  },
  {
    id: "bld-op-corner",
    set: "bld-op",
    name: "꼭짓점 바꾸기(변형 Y퍼뮤)",
    algs: ["R U' R' U' R U R' F' R U R' U' R' F R"],
    note: "버퍼 위-뒤-왼쪽(A) 꼭짓점과 오른-아래-앞(P) 자리를 맞바꿔요. 모서리 위-왼쪽·위-뒤도 함께 바뀌어요.",
  },
  {
    id: "bld-op-parity",
    set: "bld-op",
    name: "패리티(Ra퍼뮤 + U')",
    algs: ["R U R' F' R U2 R' U2 R' F R U R U2 R' U'"],
    note: "모서리 글자가 홀수 개면 모서리를 다 한 뒤 한 번 해요. T퍼뮤가 바꿔 둔 꼭짓점 둘을 되돌리고, 모서리 위-왼쪽·위-뒤를 바꿔 둬요(꼭짓점 단계가 끝나면 맞아 있어요)",
  },
];

export interface BldTarget {
  /** Speffz 글자 */
  letter: string;
  /** 스티커 자리(첫 글자가 그 스티커가 있는 면) */
  sticker: string;
  /** 이 글자를 바꾸기 자리로 옮기는 준비 수. 바꾸기 공식 뒤에 거꾸로 되돌린다 */
  setup: string;
}

const t = (letter: string, sticker: string, setup: string): BldTarget => ({
  letter,
  sticker,
  setup,
});

/** 모서리: 버퍼 B(위-오른쪽, 같은 조각의 M도 버퍼). 바꾸기 자리 D(위-왼쪽) */
export const BLD_EDGE_TARGETS: BldTarget[] = [
  t("A", "UB", "l2 D' L2"),
  t("C", "UF", "l2 D L2"),
  t("D", "UL", ""),
  t("E", "LU", "L d' L"),
  t("F", "LF", "d' L"),
  t("G", "LD", "L d L'"),
  t("H", "LB", "d L'"),
  t("I", "FU", "l D' L2"),
  t("J", "FR", "d2 L"),
  t("K", "FD", "l D L2"),
  t("L", "FL", "L'"),
  t("N", "RB", "d L"),
  t("O", "RD", "D l' D' L2"),
  t("P", "RF", "d' L'"),
  t("Q", "BU", "l' D L2"),
  t("R", "BL", "L"),
  t("S", "BD", "l' D' L2"),
  t("T", "BR", "d2 L'"),
  t("U", "DF", "D' L2"),
  t("V", "DR", "D2 L2"),
  t("W", "DB", "D L2"),
  t("X", "DL", "L2"),
];

/** 꼭짓점: 버퍼 A(위-뒤-왼쪽, 같은 조각의 E·R도 버퍼). 바꾸기 자리 P(오른-아래-앞) */
export const BLD_CORNER_TARGETS: BldTarget[] = [
  t("B", "UBR", "R D'"),
  t("C", "UFR", "F"),
  t("D", "UFL", "F R'"),
  t("F", "LUF", "F2"),
  t("G", "LDF", "D2 R"),
  t("H", "LDB", "D2"),
  t("I", "FUL", "F' D"),
  t("J", "FUR", "R2 D'"),
  t("K", "FDR", "R F"),
  t("L", "FDL", "D"),
  t("M", "RUF", "R'"),
  t("N", "RUB", "R2"),
  t("O", "RDB", "R"),
  t("P", "RDF", ""),
  t("Q", "BUR", "R' F"),
  t("S", "BDL", "D' R"),
  t("T", "BDR", "D'"),
  t("U", "DFL", "F'"),
  t("V", "DFR", "R' D'"),
  t("W", "DBR", "R2 F"),
  t("X", "DBL", "D F'"),
];
