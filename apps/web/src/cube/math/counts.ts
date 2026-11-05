/**
 * 큐브의 경우의 수(「큐브의 수학」 첫 카드). 조각별로 곱하고 규칙만큼 나누는 단계를 표로 두고,
 * 화면은 단계마다 묻고 맞히며 곱을 쌓아 간다. 값은 모두 BigInt로 계산한다(`counts.test.ts`가 알려진 값과 맞춘다).
 */

export function factorial(k: number): bigint {
  let out = 1n;
  for (let i = 2; i <= k; i++) out *= BigInt(i);
  return out;
}

export interface CountStep {
  id: string;
  /** 곱하기 또는 나누기 */
  op: "mul" | "div";
  /** 큰 글씨로 보일 식(예: 8!, 3⁸, ÷ 3) */
  expr: string;
  value: bigint;
  /** 묻는 말 */
  question: string;
  /** 고를 것(식 글). `answer`가 맞는 것 */
  choices: string[];
  answer: number;
  /** 맞힌 뒤 보이는 짧은 까닭 */
  why: string;
  /** 「뽑아서 다시 끼우면」에는 없는 규칙(돌리기로만 생기는 제약) */
  rule?: boolean;
}

export interface CountPlan {
  n: number;
  /** 다 쌓은 값 */
  total: bigint;
  /** 한 줄로 줄인 식 */
  formula: string;
  steps: CountStep[];
  /** 끝에 붙일 짧은 말 */
  note?: string;
  /** 크기를 고르면 맨 위에 보일 조각 소개 */
  intro: string;
}

const CORNER_PLACES: CountStep = {
  id: "corner-places",
  op: "mul",
  expr: "8!",
  value: factorial(8),
  question: "코너 블럭 8개를 코너 자리 8곳에 넣는 방법은 몇 가지일까요?",
  choices: ["8 × 8 = 64", "8! = 8×7×…×1 = 40,320", "2⁸ = 256"],
  answer: 1,
  why: "첫 자리에 8개 중 하나, 다음 자리에 남은 7개 중 하나… 이렇게 1까지 곱해요. 이 곱을 8!(8 팩토리얼)이라고 써요.",
};

const CORNER_TWISTS: CountStep = {
  id: "corner-twists",
  op: "mul",
  expr: "3⁸",
  value: 3n ** 8n,
  question: "코너 블럭 하나는 한 자리에서 몇 가지 방향으로 끼울 수 있을까요?",
  choices: ["2가지 → 2⁸", "3가지 → 3⁸", "6가지 → 6⁸"],
  answer: 1,
  why: "코너에는 색 칸이 3개라 돌려 끼우는 방향이 3가지예요. 8개 모두 3가지씩이라 3을 8번 곱해요.",
};

const CORNER_RULE: CountStep = {
  id: "corner-rule",
  op: "div",
  expr: "÷ 3",
  value: 3n,
  question:
    "코너 블럭을 제자리에서 돌려 색 방향만 바꾸는 것을 「비튼다」고 해요. 그런데 큐브를 돌리기만 해서는 코너 하나만 비틀 수 없어요. 그래서 마지막 코너의 방향은 어떻게 될까요?",
  choices: [
    "나머지 7개가 정하면 저절로 정해진다(÷3)",
    "여전히 3가지 다 된다",
    "2가지만 된다(÷2)",
  ],
  answer: 0,
  why: "코너마다 바른 방향에서 몇 번 비틀렸는지(0·1·2)를 「비틀림」이라고 해요. 돌리기만 하면 8개의 비틀림을 더한 값이 늘 3의 배수예요. 그래서 7개를 정하면 마지막 하나는 저절로 정해져요.",
  rule: true,
};

const EDGE_PLACES: CountStep = {
  id: "edge-places",
  op: "mul",
  expr: "12!",
  value: factorial(12),
  question: "엣지 블럭 12개를 엣지 자리 12곳에 넣는 방법은?",
  choices: ["12² = 144", "12! = 479,001,600", "2¹² = 4,096"],
  answer: 1,
  why: "코너와 같은 셈이에요. 12부터 1까지 곱해요.",
};

const EDGE_FLIPS: CountStep = {
  id: "edge-flips",
  op: "mul",
  expr: "2¹²",
  value: 2n ** 12n,
  question: "엣지 블럭 하나는 몇 가지 방향으로 끼울 수 있을까요?",
  choices: ["2가지 → 2¹²", "3가지 → 3¹²", "4가지 → 4¹²"],
  answer: 0,
  why: "엣지는 색 칸이 2개라 바로 끼우거나 뒤집어 끼우거나, 2가지예요.",
};

const EDGE_RULE: CountStep = {
  id: "edge-rule",
  op: "div",
  expr: "÷ 2",
  value: 2n,
  question:
    "돌리기만 해서는 엣지 하나만 뒤집을 수 없어요. 그러면 몇으로 나눠야 할까요?",
  choices: ["÷2", "÷12", "그대로"],
  answer: 0,
  why: "돌리기만 하면 뒤집혀 있는 엣지의 수가 늘 짝수예요. 11개를 정하면 마지막 하나의 방향은 저절로 정해져요.",
  rule: true,
};

const PARITY_RULE: CountStep = {
  id: "parity-rule",
  op: "div",
  expr: "÷ 2",
  value: 2n,
  question:
    "돌리기만 해서는 조각 둘만 맞바꿀 수 없어요(셋을 차례로 돌리는 건 돼요). 자리 배치는 얼마나 줄까요?",
  choices: ["÷2", "÷3", "÷8"],
  answer: 0,
  why: "어떤 자리 배치든 둘씩 맞바꾸기를 되풀이해 만들 수 있어요. 그 횟수가 짝수인지 홀수인지를 자리의 「홀짝」이라고 해요. 면을 한 번 돌리면 코너 4개와 엣지 4개가 각각 한 바퀴 돌아(맞바꾸기 3번씩) 둘의 홀짝이 함께 바뀌어요. 그래서 코너 홀짝과 엣지 홀짝은 늘 같고, 자리 배치의 딱 절반만 나와요.",
  rule: true,
};

const WHOLE_TURN: CountStep = {
  id: "whole-turn",
  op: "div",
  expr: "÷ 24",
  value: 24n,
  question:
    "자리가 고정된 센터 블럭이 없으면 무엇이 위인지 정해 줄 조각이 없어서, 큐브를 통째로 들어 돌린 모양은 같은 모양으로 쳐요. 큐브를 통째로 놓는 방법은 몇 가지일까요?",
  choices: ["6가지(윗면 고르기)", "24가지(윗면 6 × 앞면 4)", "48가지"],
  answer: 1,
  why: "어느 면을 위로 둘지 6가지, 그다음 앞면을 4가지로 고를 수 있어 24가지예요. 같은 모양을 24번 센 셈이라 24로 나눠요.",
};

const WINGS: CountStep = {
  id: "wings",
  op: "mul",
  expr: "24!",
  value: factorial(24),
  question:
    "4×4의 엣지 블럭은 엣지 한 줄에 2개씩 날개처럼 붙어 있어 「날개」라고도 불러요. 날개 24개는 한 자리에 한 방향으로만 들어가요. 넣는 방법은?",
  choices: ["24! 가지", "24! × 2²⁴ 가지", "12! 가지"],
  answer: 0,
  why: "날개는 거울처럼 왼쪽·오른쪽이 달라서, 자리가 정해지면 방향도 하나로 정해져요.",
};

const CENTERS: CountStep = {
  id: "centers",
  op: "mul",
  expr: "24!",
  value: factorial(24),
  question:
    "센터 블럭도 24개예요(면마다 4개). 4×4의 센터 블럭은 자리를 옮겨 다녀요. 24자리에 넣는 방법은?",
  choices: ["24!", "6!", "4⁶"],
  answer: 0,
  why: "우선은 모두 다른 조각이라 치고 24!로 세어요.",
};

const SAME_CENTERS: CountStep = {
  id: "same-centers",
  op: "div",
  expr: "÷ (4!)⁶",
  value: factorial(4) ** 6n,
  question:
    "그런데 같은 색 센터 블럭 4개는 서로 바꿔도 똑같아 보여요. 몇으로 나눠야 할까요?",
  choices: ["÷4", "÷(4!)⁶ = ÷24⁶", "÷6"],
  answer: 1,
  why: "한 색의 4개를 늘어놓는 4! = 24가지가 모두 같은 모양이에요. 6가지 색마다 그래서 24를 6번 나눠요.",
};

const PLUS_CENTERS: CountStep = {
  ...SAME_CENTERS,
  id: "plus-centers",
  expr: "× 24! ÷ (4!)⁶",
  op: "mul",
  value: factorial(24) / factorial(4) ** 6n,
  question:
    "이번엔 + 모양 자리의 센터 블럭 24개예요. 이것도 같은 색 4개끼리는 구별이 안 돼요. 얼마를 곱할까요?",
  choices: ["24!", "24! ÷ (4!)⁶", "4!"],
  answer: 1,
  why: "+ 모양도 면마다 같은 색 4개라, 24!에서 (4!)⁶을 나눈 만큼이에요.",
};

const X_CENTERS: CountStep = {
  ...PLUS_CENTERS,
  id: "x-centers",
  question:
    "5×5 면의 센터 블럭은 정가운데 하나 말고 두 가지가 더 있어요. 대각선 자리의 × 모양 4개와 십자 자리의 + 모양 4개예요. 먼저 × 모양 24개. 같은 색 4개끼리는 구별이 안 돼요. 얼마를 곱할까요?",
  why: "24개를 늘어놓는 24!가지 가운데, 같은 색 4개를 바꾼 4! = 24가지씩이 같은 모양이에요. 6가지 색마다 그래서 (4!)⁶으로 나눠요(4×4의 센터와 같은 셈).",
};

/** 5×5의 엣지 한 줄 한가운데 블럭: 3×3의 엣지 블럭처럼 움직인다 */
const MIDGE_PLACES: CountStep = {
  ...EDGE_PLACES,
  question:
    "5×5의 엣지 한 줄에는 블럭이 3개 있어요. 한가운데 것(가운데 엣지 블럭)은 3×3의 엣지 블럭처럼 움직여요. 가운데 엣지 블럭 12개를 12자리에 넣는 방법은?",
};

/** 5×5의 날개: 가운데 엣지 블럭 양옆 */
const WINGS_5: CountStep = {
  ...WINGS,
  question:
    "가운데 엣지 블럭 양옆의 엣지 블럭은 「날개」라고 불러요. 날개 24개는 한 자리에 한 방향으로만 들어가요. 넣는 방법은?",
};

export const COUNT_PLANS: Record<2 | 3 | 4 | 5, CountPlan> = {
  2: plan(2, [CORNER_PLACES, CORNER_TWISTS, CORNER_RULE, WHOLE_TURN], {
    formula: "8! × 3⁷ ÷ 24 = 7! × 3⁶",
    note: "코너 하나(예: 뒤-아래-왼쪽)를 제자리에 두고 세는 것과 같아요. 그러면 남은 7개가 7!, 방향이 3⁶이에요.",
    intro:
      "2×2는 코너 블럭 8개만 있는 큐브예요(코너 블럭은 꼭짓점에 있고 색이 3개).",
  }),
  3: plan(
    3,
    [
      CORNER_PLACES,
      CORNER_TWISTS,
      CORNER_RULE,
      EDGE_PLACES,
      EDGE_FLIPS,
      EDGE_RULE,
      PARITY_RULE,
    ],
    {
      formula: "8! × 3⁷ × 12! × 2¹¹ ÷ 2",
      note: "센터 블럭 6개는 서로 자리를 바꾸지 않아 큐브 방향을 정해 줘요. 그래서 3×3은 24로 나누지 않아요.",
      intro:
        "3×3 조각은 세 가지예요. 면 한가운데에 색이 1개인 센터 블럭 6개, 모서리에 색이 2개인 엣지 블럭 12개, 꼭짓점에 색이 3개인 코너 블럭 8개. 센터 블럭은 돌려도 자리가 그대로라, 코너와 엣지를 어디에 어떤 방향으로 끼울지만 세면 돼요.",
    },
  ),
  4: plan(
    4,
    [
      CORNER_PLACES,
      CORNER_TWISTS,
      CORNER_RULE,
      WINGS,
      CENTERS,
      SAME_CENTERS,
      WHOLE_TURN,
    ],
    {
      formula: "8! × 3⁷ × 24! × 24! ÷ (4!)⁶ ÷ 24 = 7! × 3⁶ × 24! × 24! ÷ (4!)⁶",
      note: "센터 블럭이 움직여서 큐브 방향을 정해 주는 조각이 없어요. 그래서 2×2처럼 24로 나눠요. 3×3의 홀짝 규칙(÷2)도 없어요. 날개는 안쪽 한 층을 돌려 홀짝만 따로 바꿀 수 있고, 코너의 홀짝은 센터 블럭 자리의 홀짝과 묶여 있지만 같은 색 센터 블럭 둘을 맞바꿔도 똑같아 보여서 줄어드는 모양이 없어요.",
      intro:
        "4×4는 코너 블럭 8개, 엣지 블럭 24개, 센터 블럭 24개예요. 3×3과 달리 센터 블럭도 자리를 옮겨 다녀요.",
    },
  ),
  5: plan(
    5,
    [
      CORNER_PLACES,
      CORNER_TWISTS,
      CORNER_RULE,
      MIDGE_PLACES,
      EDGE_FLIPS,
      EDGE_RULE,
      PARITY_RULE,
      WINGS_5,
      X_CENTERS,
      PLUS_CENTERS,
    ],
    {
      formula: "8! × 3⁷ × 12! × 2¹⁰ × 24! × (24! ÷ (4!)⁶)²",
      note: "면 정가운데 센터 블럭 6개는 서로 자리를 바꾸지 않아 큐브 방향을 정해 줘요. 그래서 24로 나누지 않아요.",
      intro:
        "5×5는 코너 블럭 8개, 엣지 블럭 36개(엣지 한 줄에 3개), 센터 블럭 54개(면마다 9개)예요.",
    },
  ),
};

function plan(
  n: number,
  steps: CountStep[],
  rest: { formula: string; note?: string; intro: string },
): CountPlan {
  return { n, steps, total: runningTotals(steps).at(-1) ?? 1n, ...rest };
}

/** 단계마다 지금까지 쌓은 값(첫 값은 첫 단계를 곱한 뒤) */
export function runningTotals(steps: readonly CountStep[]): bigint[] {
  const out: bigint[] = [];
  let v = 1n;
  for (const s of steps) {
    v = s.op === "mul" ? v * s.value : v / s.value;
    out.push(v);
  }
  return out;
}

/** 규칙(돌리기로만 생기는 제약)을 빼고 곱한 값: 큐브를 뽑아서 아무렇게나 다시 끼우는 경우의 수 */
export function reassemblyCount(steps: readonly CountStep[]): bigint {
  return runningTotals(steps.filter((s) => !s.rule)).at(-1) ?? 1n;
}

/** 세 자리마다 쉼표 */
export function groupDigits(v: bigint): string {
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 대략 a.b × 10^k */
export function scientific(v: bigint, digits = 2): string {
  const s = v.toString();
  if (s.length <= 4) return s;
  const head = `${s[0]}.${s.slice(1, digits)}`;
  return `${head} × 10^${s.length - 1}`;
}

const KOREAN_UNITS = [
  "",
  "만",
  "억",
  "조",
  "경",
  "해",
  "자",
  "양",
  "구",
  "간",
  "정",
  "재",
  "극",
];

/** 우리말 큰 수 단위로 대략(맨 앞 단위까지): 43252003274489856000 → 「약 4,325경」 */
export function koreanApprox(v: bigint): string {
  const s = v.toString();
  const unit = Math.floor((s.length - 1) / 4);
  if (unit === 0) return groupDigits(v);
  if (unit >= KOREAN_UNITS.length) return `약 ${scientific(v)}`;
  const head = v / 10n ** BigInt(unit * 4);
  const top = `약 ${groupDigits(head)}${KOREAN_UNITS[unit]}`;
  // 맨 앞이 한 자리면 다음 단위까지(약 1조 3,705억)
  if (head >= 10n || unit < 2) return top;
  const next = (v / 10n ** BigInt((unit - 1) * 4)) % 10_000n;
  return next === 0n
    ? top
    : `${top} ${groupDigits(next)}${KOREAN_UNITS[unit - 1]}`;
}

/** 한 해(365.25일)의 초 */
export const SECONDS_PER_YEAR = 31_557_600n;
/** 우주 나이(약 138억 년) */
export const UNIVERSE_YEARS = 13_800_000_000n;

/** 1초에 `perSecond`개씩 모두 보는 데 걸리는 해(내림) */
export function yearsToSee(total: bigint, perSecond: bigint): bigint {
  return total / perSecond / SECONDS_PER_YEAR;
}
