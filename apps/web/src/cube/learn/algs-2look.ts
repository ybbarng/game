// 2단계 OLL·PLL: 공식 57+21개를 다 외우기 전에 쓰는 짧은 길.
// OLL을 「엣지 먼저(노란 십자) → 코너」, PLL을 「코너 먼저 → 엣지」 두 번에 나눈다.
import type { AlgCase } from "./types";

export const TWO_LOOK_OLL: AlgCase[] = [
  {
    id: "2look-oll-line",
    set: "2look-oll",
    name: "엣지: 가로줄",
    group: "edges",
    algs: ["F R U R' U' F'"],
    note: "노란 엣지 둘이 가로로 한 줄. 줄을 앞에서 봤을 때 가로가 되게 들어요.",
  },
  {
    id: "2look-oll-l",
    set: "2look-oll",
    name: "엣지: ㄱ자(작은 L)",
    group: "edges",
    algs: ["F U R U' R' F'", "f R U R' U' f'"],
    note: "노란 엣지 둘이 ㄱ자. 노란 엣지가 왼쪽·뒤에 오게 들고 F U R U' R' F'를 해요(f R U R' U' f'로 할 때는 앞·오른쪽에 오게 들어요).",
  },
  {
    id: "2look-oll-dot",
    set: "2look-oll",
    name: "엣지: 점",
    group: "edges",
    algs: ["F R U R' U' F' f R U R' U' f'"],
    note: "센터만 노랑. 가로줄 공식 F R U R' U' F'를 한 뒤, 이어서 f R U R' U' f'를 해요.",
  },
  ...(
    [
      [
        21,
        "코너: H(헤드라이트 둘)",
        "R U2 R' U' R U R' U' R U' R'",
        "위를 보는 노란 코너가 없고, 앞과 뒤 옆면에 노란 칸이 둘씩 마주 봐요(옆면 한 줄의 양 끝 두 칸이 같은 색인 모양을 헤드라이트라고 해요).",
      ],
      [
        22,
        "코너: 파이",
        "R U2 R2 U' R2 U' R2 U2 R",
        "위를 보는 노란 코너가 없어요. 왼쪽 옆면에 노란 칸 둘(헤드라이트)을 두면, 오른쪽 두 코너의 노랑은 앞과 뒤를 봐요.",
      ],
      [
        23,
        "코너: 헤드라이트",
        "R2 D' R U2 R' D R U2 R",
        "노란 코너 둘이 앞쪽에서 위를 보고, 뒤 옆면에 노란 칸 둘(헤드라이트)이 나란히 있어요.",
      ],
      [
        24,
        "코너: T",
        "r U R' U' r' F R F'",
        "노란 코너 둘이 오른쪽에서 위를 보고, 왼쪽 두 코너의 노랑은 앞과 뒤를 봐요.",
      ],
      [
        25,
        "코너: 나비넥타이",
        "F' r U R' U' r' F R",
        "노란 코너 둘이 대각선(앞-왼쪽·뒤-오른쪽)에서 위를 보고, 앞-오른쪽 코너의 노랑은 앞을 봐요.",
      ],
      [
        26,
        "코너: 안티수네",
        "R U2 R' U' R U' R'",
        "위를 보는 노란 코너 하나를 뒤-오른쪽에 두면, 앞-왼쪽 코너의 노랑이 앞을 봐요.",
      ],
      [
        27,
        "코너: 수네",
        "R U R' U R U2 R'",
        "위를 보는 노란 코너 하나를 앞-왼쪽에 두면, 앞-오른쪽 코너의 노랑이 앞을 봐요.",
      ],
    ] as const
  ).map(
    ([n, name, alg, look]): AlgCase => ({
      id: `2look-oll-${n}`,
      set: "2look-oll",
      name,
      group: "corners",
      algs: [alg],
      note: `${look} 전체 OLL ${n}번과 같아요.`,
    }),
  ),
];

export const TWO_LOOK_PLL: AlgCase[] = [
  {
    id: "2look-pll-headlights",
    set: "2look-pll",
    name: "코너: 헤드라이트 하나(이웃 바꾸기, T퍼뮤)",
    group: "corners",
    algs: ["R U R' U' R' F R2 U' R' U' R U R' F'"],
    note: "헤드라이트(옆면 한 줄의 양 끝 코너 칸이 같은 색)를 왼쪽에 둬요. T퍼뮤는 코너 중에서는 오른쪽 둘을 맞바꿔요.",
  },
  {
    id: "2look-pll-diagonal",
    set: "2look-pll",
    name: "코너: 헤드라이트 없음(대각 바꾸기, Y퍼뮤)",
    group: "corners",
    algs: ["F R U' R' U' R U R' F' R U R' U' R' F R F'"],
    note: "어느 면에도 헤드라이트가 없으면 대각선 코너 둘을 바꿔요.",
  },
  {
    id: "2look-pll-ua",
    set: "2look-pll",
    name: "엣지: Ua(셋 돌리기)",
    group: "edges",
    algs: ["M2 U M U2 M' U M2"],
    note: "다 맞은 면을 뒤로 두면 앞 엣지가 오른쪽 면 색이에요.",
  },
  {
    id: "2look-pll-ub",
    set: "2look-pll",
    name: "엣지: Ub(셋 반대로 돌리기)",
    group: "edges",
    algs: ["M2 U' M U2 M' U' M2"],
    note: "다 맞은 면을 뒤로 두면 앞 엣지가 왼쪽 면 색이에요.",
  },
  {
    id: "2look-pll-h",
    set: "2look-pll",
    name: "엣지: H(맞은편끼리)",
    group: "edges",
    algs: ["M2 U M2 U2 M2 U M2"],
    note: "앞·뒤 엣지끼리, 왼쪽·오른쪽 엣지끼리 바뀌어 있어요.",
  },
  {
    id: "2look-pll-z",
    set: "2look-pll",
    name: "엣지: Z(이웃끼리 두 쌍)",
    group: "edges",
    algs: ["M' U M2 U M2 U M' U2 M2"],
    note: "옆에 붙은 두 면끼리 엣지가 바뀌어 있어요. 코너를 맞춘 채로 보면 공식 뒤에 U' 하나가 더 필요해요.",
  },
];
