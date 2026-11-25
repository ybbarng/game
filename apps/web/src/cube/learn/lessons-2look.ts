// 초보자 해법 다음: 마지막 층을 공식으로(docs/47 16-24). 3×3 처음 맞추기와 프리드리히(CFOP) 사이의 다리 과정이다.
// 아래 두 층은 초보자 해법 그대로 맞추고, 마지막 층을 초보자의 네 단계 대신 2단계 OLL(노란 십자 → 노란 면)과
// 2단계 PLL(코너 자리 → 엣지 자리)로 끝낸다. CFOP는 이 과정의 두 단원을 그대로 쓰고 아래 두 층만 새로 배운다.
// 단원 id(cfop-2look-oll·cfop-2look-pll)는 CFOP 안에 있던 때의 것 그대로다: 진행 기록(cube.learn.v1)·힌트의 단원 잇기
// (mini/hint-pick.ts, 코어 hint.rs)가 이 id를 쓴다.
// 단계 글이 말하는 모양은 flow-advanced.test.ts가 엔진으로 확인한다.
import { TWO_LOOK_OLL, TWO_LOOK_PLL } from "./algs-2look";
import { LL_COMPARE } from "./ll-compare";
import { setupFor } from "./notation";
import type {
  AlgCase,
  Course,
  GoalName,
  Lesson,
  LessonStep,
  MaskName,
} from "./types";

/** 흰 면을 아래로 쥔(z2) 맞춘 큐브에서, 이 풀이로 풀리는 상황 */
export const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

const algOf = (list: AlgCase[], id: string): string => {
  const a = list.find((c) => c.id === id)?.algs[0];
  if (a === undefined) throw new Error(`공식 없음: ${id}`);
  return a;
};

export const T_PERM = algOf(TWO_LOOK_PLL, "2look-pll-headlights");
export const Y_PERM = algOf(TWO_LOOK_PLL, "2look-pll-diagonal");
/** Z퍼뮤는 코너를 옆 센터에 맞춘 채로 보면 공식 뒤에 U'가 하나 더 붙는다 */
export const Z_PERM_AUF = `${algOf(TWO_LOOK_PLL, "2look-pll-z")} U'`;

/**
 * 첫 단원 그림의 마지막 층: 이 풀이(가로줄 → 수네 → T퍼뮤 → Ua퍼뮤)로 풀리는 모양. 아래 두 층은 맞았고
 * 위 층은 방향·자리가 모두 흐트러져 있다(flow-advanced.test.ts가 단계마다 본다)
 */
export const INTRO_LL = [
  algOf(TWO_LOOK_OLL, "2look-oll-line"),
  algOf(TWO_LOOK_OLL, "2look-oll-27"),
  T_PERM,
  algOf(TWO_LOOK_PLL, "2look-pll-ua"),
];

const intro: Lesson = {
  id: "333-2look-intro",
  size: 3,
  title: "초보자 해법에서 무엇이 바뀌나",
  summary:
    "아래 두 층은 초보자 해법 그대로, 마지막 층은 모양을 보고 공식으로 끝내요. 모양 16가지를 한눈에 보고, 초보자 해법과 견줘요.",
  steps: [
    {
      kind: "quiz",
      body: "3×3 처음 맞추기 과정에서 층별로 큐브를 끝까지 맞춰 봤어요. 그 방법을 여기서는 「초보자 해법」이라고 불러요. 그 과정의 마지막 층은 노란 십자 → 옆면 맞추기 → 코너 자리 → 코너 방향의 네 단계였고, 코너 방향에서는 코너 돌리기 공식을 코너 블럭마다 되풀이했어요. 이번 과정에서는 아래 두 층까지는 초보자 해법 그대로 맞추고, 마지막 층만 다르게 끝내요. 걸음마다 위 층의 모양을 보고 그 모양에 정해 둔 공식을 쳐서, 네 걸음에 끝내요. 화면의 큐브는 초보자 해법으로 아래 두 층을 맞추고 흰 면을 아래로 둔 상태예요. 위 층은 아직 흐트러져 있어요.",
      setup: flip(INTRO_LL.join(" ")),
      mask: "pll",
      quiz: {
        question: "이 과정에서 초보자 해법 그대로 하는 것은?",
        choices: ["아래 두 층까지", "마지막 층까지 모두"],
        answer: 0,
        why: "아래 두 층은 초보자 해법으로 맞추고, 마지막 층만 공식으로 바꿔요.",
      },
    },
    {
      kind: "quiz",
      body: "마지막 층은 두 가지를 맞춰야 끝나요. 위 층 조각의 방향(노란 스티커가 모두 위를 보게)과 위 층 조각의 자리(블럭마다 제자리에)예요. 대회 선수들은 이 두 단계를 영어 이름의 첫 글자로 불러요. OLL(Orientation of the Last Layer)은 마지막 층 조각의 방향을 맞춰 노란 스티커가 모두 위를 보게 하는 단계, PLL(Permutation of the Last Layer)은 마지막 층 조각의 자리를 맞추는 단계예요. OLL을 공식 한 번으로 끝내려면 공식 57개를 외워야 해서, 처음에는 두 번에 나눠요. 위 층 엣지의 방향을 먼저(노란 십자), 다음 위 층 코너의 방향(노란 면)이에요. PLL도 두 번에 나눠 위 층 코너의 자리를 먼저, 다음 위 층 엣지의 자리를 맞춰요. 이렇게 나눈 것을 **2단계 OLL**(공식 10개)·**2단계 PLL**(공식 6개)이라고 불러요. 이름의 「2단계」는 두 번에 나눈다는 뜻이에요. 나눈 넷은 이 과정에서 「걸음」이라고 불러요.",
      setup: flip(INTRO_LL.join(" ")),
      mask: "pll",
      quiz: {
        question: "노란 스티커가 모두 위를 보게 하는 단계는?",
        choices: ["OLL", "PLL"],
        answer: 0,
        why: "OLL은 방향(Orientation), PLL은 자리(Permutation)를 맞춰요. 초보자 해법과 달리 방향을 먼저 다 맞추고 자리는 나중에 맞춰요.",
      },
    },
    {
      kind: "quiz",
      body: "2단계 OLL·PLL은 네 걸음이에요. 노란 십자 → 노란 면 → 코너 자리 → 엣지 자리. 네 걸음에서 만날 수 있는 모양을 모두 늘어놓으면 아래 그림처럼 16가지예요. 그림은 위에서 본 윗면과 그 둘레 옆면의 윗줄이에요. 첫 걸음 그림에는 위 층 엣지 블럭의 노란 스티커만, 둘째 걸음 그림에는 노란 스티커만 색을 넣었어요. 걸음마다 보는 곳이 정해져 있어서, 그 걸음의 모양 가운데 어느 것인지만 알아보면 칠 공식 하나가 정해져요. 모양마다의 이름과 공식은 다음 단원부터 하나씩 배워요.",
      setup: flip(INTRO_LL.join(" ")),
      mask: "pll",
      sheet: "2look-cases",
      quiz: {
        question: "첫 걸음(노란 십자)에서 보고 고르는 것은?",
        choices: [
          "위를 보는 노란 엣지 블럭이 만드는 모양",
          "옆면 윗줄 양 끝 코너 스티커의 색",
        ],
        answer: 0,
        why: "노란 십자 걸음은 위를 보는 노란 엣지 블럭의 모양(가로줄, 곧 초보자 과정의 일자·ㄱ자·점)을 봐요. 옆면 윗줄 양 끝의 색은 셋째 걸음(코너 자리)에서 봐요.",
      },
    },
    {
      kind: "quiz",
      body: `초보자 해법의 마지막 층과 나란히 놓아 볼게요. 표는 두 방법의 걸음을 차례대로 늘어놓은 것이라, 같은 줄에 있어도 하는 일은 달라요. 아래 표의 숫자는 아래 두 층이 맞은 같은 큐브 ${LL_COMPARE.seeds}개를 두 방법으로 맞춰 센 평균이에요. 공식을 친 횟수는 ${LL_COMPARE.beginnerFormulas}번에서 ${LL_COMPARE.twoLookFormulas}번으로, 돌린 수는 ${LL_COMPARE.beginnerTurns}수에서 ${LL_COMPARE.twoLookTurns}수로 줄어요. 2단계가 나은 점은 넷이에요. 첫째, 걸음마다 모양에 맞는 공식을 한 번 쳐요(점 모양만 공식 둘을 이어 쳐요). 초보자 해법의 코너 방향처럼 코너 블럭마다 같은 공식을 되풀이하지 않아요. 둘째, 공식 하나가 끝날 때마다 아래 두 층이 맞아 있어요. 초보자 해법의 코너 방향은 코너 돌리기 공식 사이사이에 아래 두 층이 흐트러져서, 끝내기 전에는 멈출 수 없었어요. 셋째, 노란 면 걸음의 공식 7개와 2단계 PLL 공식 6개는 나중에 배울 전체 OLL·PLL에 그대로 들어 있어요. 외운 것을 버리지 않고 이어서 써요. 넷째, 노란 면 걸음의 공식 7개 가운데 4개는 R과 U만 써서 손가락으로 빨리 치기 좋아요. 대신 공식 16개를 외워야 하고, 걸음마다 지금 모양이 16가지 가운데 무엇인지 알아봐야 해요.`,
      setup: flip(INTRO_LL.join(" ")),
      mask: "pll",
      sheet: "ll-compare",
      quiz: {
        question: "2단계 OLL·PLL에서 공식 하나를 친 뒤 아래 두 층은 어떤가요?",
        choices: ["늘 맞아 있어요", "흐트러졌다가 다음 공식에서 돌아와요"],
        answer: 0,
        why: "2단계 공식은 모두 아래 두 층을 그대로 두고 위 층만 바꿔요. 그래서 걸음 사이에 멈춰 다음 모양을 천천히 봐도 돼요.",
      },
    },
  ],
};

const caseOf = (list: AlgCase[], id: string): AlgCase => {
  const c = list.find((x) => x.id === id);
  if (!c) throw new Error(`상황 없음: ${id}`);
  return c;
};
const OLL_CORNER_IDS = [27, 26, 21, 22, 23, 24, 25].map(
  (n) => `2look-oll-${n}`,
);
const shortName = (c: AlgCase) => c.name.replace(/^코너: /, "");

/** 2단계 공식 하나 해 보기(상황은 그 공식으로 풀리는 모양) */
const caseTry = (
  c: AlgCase,
  alg: string,
  goal: GoalName,
  mask: MaskName,
): LessonStep => ({
  kind: "try",
  body: `${c.name}. ${c.note ?? ""}`.trim(),
  setup: flip(alg),
  alg,
  goal,
  mask,
});

const twoLookOll: Lesson = {
  id: "cfop-2look-oll",
  size: 3,
  title: "2단계 OLL",
  summary: "노란 십자(공식 3개) → 노란 면(공식 7개). 모양마다 하나씩 해 봐요.",
  drill: "2look-oll",
  steps: [
    {
      kind: "quiz",
      body: "앞 단원에서 이 과정의 흐름을 봤어요. 이번 단원부터 마지막 층을 맞춰요. 초보자 해법으로 아래 두 층을 맞추고 흰 면을 아래로 둔 큐브에서 시작해요. 이번 단원은 2단계 OLL이에요. 먼저 위 층 엣지의 노랑을 위로 올려 노란 십자를 만들고(공식 3개), 다음 위 층 코너의 노랑을 위로 올려 윗면을 모두 노랗게 해요(공식 7개). 초보자 해법의 노란 십자·코너 방향과 같은 일인데, 코너 블럭을 하나씩 돌리지 않고 모양마다 공식 한 번으로 해요. 노란 십자의 가로줄·ㄱ자 공식은 초보자 노란 십자 단원에서 쓴 것과 같고, 점 모양만 새 공식이에요. 공식에 나오는 소문자(f·r·l·u·d·b)는 그 면과 붙은 가운데 층까지 두 층을 함께 돌려요. f는 F 두 층, r은 R 두 층이에요(r은 Rw라고도 적어요).",
      setup: flip("F R U R' U' F'"),
      mask: "oll",
      quiz: {
        question: "이 큐브는 2단계 OLL에서 어느 단계부터 할까요?",
        choices: ["엣지 단계(노란 십자)", "코너 단계(노란 면)"],
        answer: 0,
        why: "노란 십자가 아직 없어요. 노란 엣지 블럭 둘이 가로로 한 줄인 모양(가로줄, 초보자 과정의 일자)이니 F R U R' U' F'부터 해요.",
      },
    },
    ...TWO_LOOK_OLL.filter((c) => c.group === "edges").map((c) =>
      caseTry(c, c.algs[0] as string, "yellow-cross", "oll"),
    ),
    {
      kind: "quiz",
      body: "노란 십자가 생겼으면 위 층 코너 차례예요. 코너 단계의 일곱 모양은 위를 보는 노란 코너 수(0·1·2개)와 옆면에 보이는 노란 스티커 자리로 알아봐요. 위를 보는 노란 코너 블럭이 하나인 모양은 둘이고, 거기 쓰는 공식에는 이름이 있어요. R U R' U R U2 R'을 외국 이름 그대로 「수네」(Sune)라고 부르고, 그 거꾸로를 「안티수네」라고 불러요. 공식 이름과 모양 이름은 나눠 불러요. 수네로 푸는 모양은 「수네 모양」, 안티수네로 푸는 모양은 「안티수네 모양」이에요. 둘은 이렇게 갈라요. 위를 보는 노란 코너 블럭 하나를 U로 앞-왼쪽에 두었을 때, 앞-오른쪽 코너 블럭의 노랑이 앞을 보면 수네 모양이라 그대로 수네를 쳐요. 오른쪽을 보면 안티수네 모양이라 U2로 돌려 위를 보는 그 코너 블럭을 뒤-오른쪽에 두고 안티수네를 쳐요. 나머지 다섯도 생김새를 딴 이름에 「모양」을 붙여 「H 모양」·「파이 모양」·「U 모양」·「T 모양」·「나비넥타이 모양」이라고 불러요. U 모양은 노란 스티커 둘이 한 옆면에 나란히 서 U자처럼 보여요. 다음 단원에도 같은 글자가 들어간 이름이 나오는데, 그건 조각의 자리를 바꾸는 공식 이름이라 그때 따로 알려 줄게요. 윗면 모양을 말할 때는 늘 「모양」을 붙여요.",
      setup: flip(algOf(TWO_LOOK_OLL, "2look-oll-27")),
      mask: "oll",
      quiz: {
        question:
          "노란 코너 블럭 하나가 앞-왼쪽에서 위를 보고, 앞-오른쪽 코너 블럭의 노랑이 앞을 봐요. 무슨 모양일까요?",
        choices: ["수네 모양", "안티수네 모양", "H 모양", "파이 모양"],
        answer: 0,
        why: "앞-오른쪽 노랑이 앞을 보면 수네 모양이라 수네 공식을 해요. 뒤-오른쪽에 위를 보는 노란 코너 블럭이 있고 앞-왼쪽 노랑이 앞을 보면 안티수네 모양이에요.",
      },
    },
    ...OLL_CORNER_IDS.map((id) => {
      const c = caseOf(TWO_LOOK_OLL, id);
      return caseTry(
        { ...c, name: `코너 단계: ${shortName(c)}` },
        c.algs[0] as string,
        "oll",
        "oll",
      );
    }),
    {
      kind: "try",
      body: "아래 두 층이 맞은 큐브에서 윗면을 노랗게(2단계로) 만들어요. 모양마다 앞에서 해 본 그 모양의 쥐는 법대로 U로 돌려 쥐고 공식을 쳐요.",
      setup: { rule: "f2l-solved" },
      goal: "oll",
      mask: "oll",
    },
  ],
};

const twoLookPll: Lesson = {
  id: "cfop-2look-pll",
  size: 3,
  title: "2단계 PLL",
  summary:
    "위 층 코너 자리(공식 둘) → 위 층 엣지 자리(공식 넷). 하나씩 해 봐요.",
  drill: "2look-pll",
  steps: [
    {
      kind: "quiz",
      body: "앞 단원에서 윗면을 노랗게 만들었어요. 이제 마지막, 위 층 조각을 제자리로 옮기는 PLL이에요. PLL도 두 번에 나눠요. 먼저 위 층 코너, 다음 위 층 엣지예요. 초보자 코너 자리와 달리 코너 블럭끼리의 차례를 먼저 맞추고, 제자리에는 마지막에 U로 돌려 넣어요. 「퍼뮤」는 조각의 자리를 바꾸는 공식을 부르는 말이에요(영어 permutation). 공식마다 앞에 글자를 붙여 「T퍼뮤」처럼 불러요. 앞 단원의 「T 모양」·「H 모양」·「U 모양」은 윗면 모양 이름이라 이 공식들과 다른 것이에요. 코너 자리는 옆면을 보고 알아봐요. 옆면 윗줄 양 끝의 코너 블럭 둘이 서로 바르게 이웃해(맞춘 큐브에서 이웃한 차례 그대로) 있으면, 그 표시로 그 옆면 윗줄의 두 코너 스티커가 같은 색이에요. 이런 옆면을 「헤드라이트」라고 해요(자동차 앞 등 둘처럼 보여서). 헤드라이트가 한 면에만 있으면 T퍼뮤, 하나도 없으면 Y퍼뮤를 써요.",
      setup: flip(T_PERM),
      mask: "pll",
      quiz: {
        question: "헤드라이트가 하나 있어요. 어디에 두고 T퍼뮤를 할까요?",
        choices: ["왼쪽", "오른쪽", "앞"],
        answer: 0,
        why: "T퍼뮤는 코너 블럭 가운데 오른쪽 둘을 맞바꿔요. 이미 서로 맞은 헤드라이트는 U로 돌려 건드리지 않는 왼쪽에 둬요(U는 코너 블럭끼리의 이웃 관계를 바꾸지 않아요).",
      },
    },
    {
      kind: "find",
      body: "T퍼뮤는 위 층 코너 가운데 앞-오른쪽과 뒤-오른쪽 둘만 맞바꿔요. 위 층 엣지 블럭은 위-왼쪽과 위-오른쪽 둘을 맞바꾸는데, 엣지 자리는 다음 걸음에서 맞추니 지금은 코너 자리만 봐요. 공식마다 바꾸는 자리가 달라 헤드라이트를 두는 곳도 달라요. T퍼뮤가 맞바꿀 코너 블럭 둘(노랑-주황이 붙은 것)을 눌러 보세요.",
      setup: flip(T_PERM),
      mask: "pll",
      find: { piece: "corner", has: ["D", "L"] },
      count: 2,
    },
    caseTry(caseOf(TWO_LOOK_PLL, "2look-pll-headlights"), T_PERM, "ll", "pll"),
    {
      kind: "quiz",
      body: "어느 옆면에도 헤드라이트가 없으면 대각선으로 놓인 코너 블럭 둘을 바꿔요.",
      setup: flip(Y_PERM),
      mask: "pll",
      quiz: {
        question: "헤드라이트가 하나도 없어요. 무엇을 할까요?",
        choices: ["Y퍼뮤 한 번", "T퍼뮤 한 번", "코너 단계를 건너뛰어요"],
        answer: 0,
        why: "헤드라이트가 없으면 대각선으로 놓인 코너 블럭 둘이 바뀐 거예요. Y퍼뮤가 대각선 둘을 바꿔요.",
      },
    },
    caseTry(caseOf(TWO_LOOK_PLL, "2look-pll-diagonal"), Y_PERM, "ll", "pll"),
    {
      kind: "quiz",
      body: "네 옆면 모두 헤드라이트면 위 층 코너는 이미 서로 맞아요. 코너 단계를 건너뛰고 엣지 단계로 가요. 코너 공식을 친 뒤에도 네 면 모두 헤드라이트가 돼요. 그때 위 층 코너 블럭이 제자리가 아닌 곳에 와 있으면 U를 한 번씩 쳐서 위 층 코너 블럭이 모두 제자리에 드는 곳에서 멈춘 뒤 엣지 단계로 가요(많아야 세 번).",
      setup: flip(algOf(TWO_LOOK_PLL, "2look-pll-ua")),
      mask: "pll",
      quiz: {
        question: "네 면 모두 헤드라이트예요. 다음은?",
        choices: ["T퍼뮤", "코너 단계는 건너뛰고 엣지 공식"],
        answer: 1,
        why: "위 층 코너 넷이 서로 맞았으니 위 층 엣지만 남았어요.",
      },
    },
    {
      kind: "quiz",
      body: "엣지 공식은 넷이에요. 위 층 엣지 블럭 하나가 제자리에 있고 나머지 셋이 돌아가며 자리가 바뀌었으면 Ua퍼뮤나 Ub퍼뮤, 맞은편 엣지 블럭끼리 바뀌면 H퍼뮤, 이웃한 엣지 블럭끼리 두 쌍 바뀌면 Z퍼뮤. 엣지 공식에 나오는 M은 L과 R 사이 가운데 층을 L과 같은 쪽으로 돌려요(M'는 거꾸로, M2는 반 바퀴).",
      setup: flip(algOf(TWO_LOOK_PLL, "2look-pll-h")),
      mask: "pll",
      quiz: {
        question:
          "앞·뒤 엣지 블럭끼리, 왼쪽·오른쪽 엣지 블럭끼리 바뀌었어요. 어느 공식을 할까요?",
        choices: [
          "Ua퍼뮤·Ub퍼뮤(셋 돌리기)",
          "H퍼뮤(맞은편끼리)",
          "Z퍼뮤(이웃끼리)",
        ],
        answer: 1,
        why: "맞은편끼리 두 쌍이 바뀌면 H퍼뮤예요.",
      },
    },
    ...["2look-pll-ua", "2look-pll-ub", "2look-pll-h"].map((id) => {
      const c = caseOf(TWO_LOOK_PLL, id);
      return caseTry(c, c.algs[0] as string, "ll", "pll");
    }),
    caseTry(caseOf(TWO_LOOK_PLL, "2look-pll-z"), Z_PERM_AUF, "ll", "pll"),
    {
      kind: "try",
      body: "윗면이 노란 큐브에서 위 층 자리를 맞춰요(2단계로).",
      setup: { rule: "oll-solved" },
      goal: "ll",
      mask: "pll",
    },
  ],
};

export const TWO_LOOK_LL: Course = {
  id: "333-2look",
  size: 3,
  title: "마지막 층을 공식으로",
  summary:
    "초보자 해법으로 아래 두 층을 맞춘 뒤, 마지막 층을 2단계 OLL·PLL 공식 16개로 끝내요. 프리드리히(CFOP)로 가는 다리예요.",
  lessons: [intro, twoLookOll, twoLookPll],
};
