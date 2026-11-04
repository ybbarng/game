// 2단계 OLL·PLL: 공식 57+21개를 다 외우기 전에 쓰는 짧은 길.
// OLL을 「모서리 먼저(노란 십자) → 꼭짓점」, PLL을 「꼭짓점 먼저 → 모서리」 두 번에 나눈다.
import type { AlgCase } from "./types";

export const TWO_LOOK_OLL: AlgCase[] = [
  {
    id: "2look-oll-line",
    set: "2look-oll",
    name: "모서리: 가로줄",
    group: "edges",
    algs: ["F R U R' U' F'"],
    note: "노란 모서리 둘이 가로로 한 줄. 줄을 앞에서 봤을 때 가로가 되게 들어요.",
  },
  {
    id: "2look-oll-l",
    set: "2look-oll",
    name: "모서리: ㄱ자(작은 L)",
    group: "edges",
    algs: ["F U R U' R' F'", "f R U R' U' f'"],
    note: "노란 모서리 둘이 ㄱ자. 대표 공식은 노란 모서리가 왼쪽·뒤에 오게, 둘째 공식은 앞·오른쪽에 오게 들어요.",
  },
  {
    id: "2look-oll-dot",
    set: "2look-oll",
    name: "모서리: 점",
    group: "edges",
    algs: ["F R U R' U' F' f R U R' U' f'"],
    note: "가운데만 노랑. 가로줄 공식과 ㄱ자 공식을 이어서 해요.",
  },
  ...(
    [
      [21, "꼭짓점: H(헤드라이트 둘)", "R U2 R' U' R U R' U' R U' R'"],
      [22, "꼭짓점: 파이", "R U2 R2 U' R2 U' R2 U2 R"],
      [23, "꼭짓점: 헤드라이트", "R2 D' R U2 R' D R U2 R"],
      [24, "꼭짓점: T", "r U R' U' r' F R F'"],
      [25, "꼭짓점: 나비넥타이", "F' r U R' U' r' F R"],
      [26, "꼭짓점: 안티수네", "R U2 R' U' R U' R'"],
      [27, "꼭짓점: 수네", "R U R' U R U2 R'"],
    ] as const
  ).map(
    ([n, name, alg]): AlgCase => ({
      id: `2look-oll-${n}`,
      set: "2look-oll",
      name,
      group: "corners",
      algs: [alg],
      note: `전체 OLL ${n}번과 같아요.`,
    }),
  ),
];

export const TWO_LOOK_PLL: AlgCase[] = [
  {
    id: "2look-pll-headlights",
    set: "2look-pll",
    name: "꼭짓점: 헤드라이트 하나(이웃 바꾸기, T퍼뮤)",
    group: "corners",
    algs: ["R U R' U' R' F R2 U' R' U' R U R' F'"],
    note: "헤드라이트(옆면 같은 색 두 꼭짓점)를 왼쪽에 둬요.",
  },
  {
    id: "2look-pll-diagonal",
    set: "2look-pll",
    name: "꼭짓점: 헤드라이트 없음(대각 바꾸기, Y퍼뮤)",
    group: "corners",
    algs: ["F R U' R' U' R U R' F' R U R' U' R' F R F'"],
    note: "어느 면에도 헤드라이트가 없으면 대각선 꼭짓점 둘을 바꿔요.",
  },
  {
    id: "2look-pll-ua",
    set: "2look-pll",
    name: "모서리: Ua(셋 돌리기)",
    group: "edges",
    algs: ["M2 U M U2 M' U M2"],
    note: "다 맞은 면을 뒤로",
  },
  {
    id: "2look-pll-ub",
    set: "2look-pll",
    name: "모서리: Ub(셋 반대로 돌리기)",
    group: "edges",
    algs: ["M2 U' M U2 M' U' M2"],
    note: "다 맞은 면을 뒤로",
  },
  {
    id: "2look-pll-h",
    set: "2look-pll",
    name: "모서리: H(맞은편끼리)",
    group: "edges",
    algs: ["M2 U M2 U2 M2 U M2"],
  },
  {
    id: "2look-pll-z",
    set: "2look-pll",
    name: "모서리: Z(이웃끼리 두 쌍)",
    group: "edges",
    algs: ["M' U M2 U M2 U M' U2 M2"],
  },
];
