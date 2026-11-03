// F2L(First Two Layers, 아래 두 층 한꺼번에) 41 상황. 모두 앞-오른쪽 칸(FR)에 짝을 넣는 공식이다.
// 다른 칸은 큐브를 y로 돌려 같은 공식을 쓴다. 공식 앞의 U는 짝을 알맞은 자리로 옮기는 준비 돌리기다.
import type { AlgCase } from "./types";

/** 묶음: 꼭짓점과 모서리가 위층에 있나, 칸(넣을 자리)에 있나 */
export const F2L_GROUPS = {
  "corner-top/edge-top": "꼭짓점·모서리 모두 위층",
  "corner-top/edge-slot": "꼭짓점은 위층, 모서리는 칸에",
  "corner-slot/edge-top": "꼭짓점은 칸에, 모서리는 위층",
  "corner-slot/edge-slot": "둘 다 칸에 있지만 틀림",
} as const;

const f2l = (
  n: number,
  group: keyof typeof F2L_GROUPS,
  name: string,
  algs: string[],
): AlgCase => ({
  id: `f2l-${n}`,
  set: "f2l",
  name: `F2L ${n} ${name}`,
  group,
  algs,
});

export const F2L_CASES: AlgCase[] = [
  f2l(1, "corner-top/edge-top", "바로 넣기 1", ["U R U' R'"]),
  f2l(2, "corner-top/edge-top", "바로 넣기 2", ["U' F' U F"]),
  f2l(3, "corner-top/edge-top", "바로 넣기 3", ["F' U' F"]),
  f2l(4, "corner-top/edge-top", "바로 넣기 4", ["R U R'"]),
  f2l(5, "corner-top/edge-top", "흰색 옆·떨어진 짝 1", [
    "U' R U R' U2 R U' R'",
  ]),
  f2l(6, "corner-top/edge-top", "흰색 옆·떨어진 짝 2", ["U F' U' F U2 F' U F"]),
  f2l(7, "corner-top/edge-top", "흰색 옆·떨어진 짝 3", [
    "U' R U2 R' U2 R U' R'",
  ]),
  f2l(8, "corner-top/edge-top", "흰색 옆·떨어진 짝 4", ["U F' U2 F U2 F' U F"]),
  f2l(9, "corner-top/edge-top", "흰색 옆·떨어진 짝 5", [
    "U' R U' R' U F' U' F",
  ]),
  f2l(10, "corner-top/edge-top", "흰색 옆·떨어진 짝 6", ["U' R U R' U R U R'"]),
  f2l(11, "corner-top/edge-top", "흰색 옆·떨어진 짝 7", [
    "U' R U2 R' U F' U' F",
  ]),
  f2l(12, "corner-top/edge-top", "흰색 옆·떨어진 짝 8", [
    "R U' R' U R U' R' U2 R U' R'",
  ]),
  f2l(13, "corner-top/edge-top", "흰색 옆·떨어진 짝 9", [
    "U F' U F U' F' U' F",
  ]),
  f2l(14, "corner-top/edge-top", "흰색 옆·떨어진 짝 10", [
    "U' R U' R' U R U R'",
  ]),
  f2l(15, "corner-top/edge-top", "흰색 옆·떨어진 짝 11", [
    "R' D' R U' R' D R U R U' R'",
  ]),
  f2l(16, "corner-top/edge-top", "흰색 옆·떨어진 짝 12", [
    "R U' R' U2 F' U' F",
  ]),
  f2l(17, "corner-top/edge-top", "흰색 위·붙은 짝", ["R U2 R' U' R U R'"]),
  f2l(18, "corner-top/edge-top", "흰색 위·붙은 짝 2", ["F' U2 F U F' U' F"]),
  f2l(19, "corner-top/edge-top", "흰색 위·떨어진 짝", ["U R U2 R' U R U' R'"]),
  f2l(20, "corner-top/edge-top", "흰색 위·떨어진 짝 2", [
    "U' F' U2 F U' F' U F",
  ]),
  f2l(21, "corner-top/edge-top", "흰색 위·맞은편 짝", ["U2 R U R' U R U' R'"]),
  f2l(22, "corner-top/edge-top", "흰색 위·맞은편 짝 2", [
    "U2 F' U' F U' F' U F",
  ]),
  f2l(23, "corner-top/edge-top", "흰색 위·뒤집힌 짝", [
    "U R U' R' U' R U' R' U R U' R'",
  ]),
  f2l(24, "corner-top/edge-top", "흰색 위·뒤집힌 짝 2", [
    "F U R U' R' F' R U' R'",
  ]),
  f2l(25, "corner-slot/edge-top", "꼭짓점 칸에·모서리 위 1", [
    "U' R' F R F' R U R'",
  ]),
  f2l(26, "corner-slot/edge-top", "꼭짓점 칸에·모서리 위 2", [
    "U R U' R' F R' F' R",
  ]),
  f2l(27, "corner-slot/edge-top", "꼭짓점 칸에·모서리 위 3", [
    "R U' R' U R U' R'",
  ]),
  f2l(28, "corner-slot/edge-top", "꼭짓점 칸에·모서리 위 4", [
    "F' U F U' F' U F",
  ]),
  f2l(29, "corner-slot/edge-top", "꼭짓점 칸에·모서리 위 5", [
    "R U' R' F' U' F",
  ]),
  f2l(30, "corner-slot/edge-top", "꼭짓점 칸에·모서리 위 6", [
    "R U R' U' R U R'",
  ]),
  f2l(31, "corner-top/edge-slot", "모서리 칸에·꼭짓점 위 1", [
    "U' R' F R F' R U' R'",
  ]),
  f2l(32, "corner-top/edge-slot", "모서리 칸에·꼭짓점 위 2", [
    "U R U' R' U R U' R' U R U' R'",
  ]),
  f2l(33, "corner-top/edge-slot", "모서리 칸에·꼭짓점 위 3", [
    "U' R U' R' U2 R U' R'",
  ]),
  f2l(34, "corner-top/edge-slot", "모서리 칸에·꼭짓점 위 4", [
    "U R U R' U2 R U R'",
  ]),
  f2l(35, "corner-top/edge-slot", "모서리 칸에·꼭짓점 위 5", [
    "U2 R U' R' U' F' U' F",
  ]),
  f2l(36, "corner-top/edge-slot", "모서리 칸에·꼭짓점 위 6", [
    "U F' U' F U' R U R'",
  ]),
  f2l(37, "corner-slot/edge-slot", "모서리만 뒤집힘", [
    "R2 U2 F R2 F' U2 R' U R'",
  ]),
  f2l(38, "corner-slot/edge-slot", "꼭짓점 돌아감·모서리 맞음 1", [
    "R U' R' U' R U R' U2 R U' R'",
  ]),
  f2l(39, "corner-slot/edge-slot", "꼭짓점 돌아감·모서리 맞음 2", [
    "R U' R' U R U2 R' U R U' R'",
  ]),
  f2l(40, "corner-slot/edge-slot", "꼭짓점 돌아감·모서리 뒤집힘 1", [
    "r U' r' U2 r U r' R U R'",
  ]),
  f2l(41, "corner-slot/edge-slot", "꼭짓점 돌아감·모서리 뒤집힘 2", [
    "R U' R' r U' r' U2 r U r'",
  ]),
];
