import {
  type Action,
  CENTER,
  type GameEvent,
  HOME,
  MO,
  type ScenarioPiece,
  STANDARD_RULES,
  type Sticks,
  sideOf,
  type ThrowValue,
  type YutView,
} from "@game/yut-engine";

import type { Lesson, MissionContext, MissionStatus } from "@/tutorial/types";

/** 튜토리얼 장면: 말 자리와 모아 둔 결과. 설명 그림에는 윷가락 모양도 보일 수 있다 */
export interface YutScene {
  pieces: ScenarioPiece[];
  pending?: ThrowValue[];
  throwsLeft?: number;
  /** 설명 그림에 보일 윷가락(배가 위면 true) */
  sticks?: Sticks;
  /** 윷가락 아래 결과 이름을 숨긴다(결과를 묻는 퀴즈) */
  hideResult?: boolean;
}

export type YutLesson = Lesson<YutView, GameEvent, YutScene, Action>;
type Context = MissionContext<YutView, GameEvent>;

/** 튜토리얼은 1:1 기본 규칙으로 한다 */
export const YUT_TUTORIAL_RULES = STANDARD_RULES;

const move = (value: ThrowValue, from: number): Action => ({
  type: "move",
  value,
  from,
});

/** 미션에서 내가 움직인 것들 */
function myMoves({ view, events }: Context) {
  return events.filter(
    (e): e is Extract<GameEvent, { type: "moved" }> =>
      e.type === "moved" && e.seat === view.mySeat,
  );
}

/** 내 차례가 끝났다(상대 차례가 시작됐다) */
function turnPassed({ view, events }: Context): boolean {
  return events.some((e) => e.type === "turnStarted" && e.seat !== view.mySeat);
}

/** 첫 움직임이 조건에 맞으면 성공, 아니면 실패 */
function firstMove(ok: (m: Extract<GameEvent, { type: "moved" }>) => boolean) {
  return (ctx: Context): MissionStatus => {
    const first = myMoves(ctx)[0];
    if (!first) return null;
    return ok(first) ? "success" : "fail";
  };
}

/** 내 말이 그 점에 서면 성공, 서지 못한 채 차례가 넘어가면 실패 */
function reach(point: number) {
  return (ctx: Context): MissionStatus => {
    const side = sideOf(ctx.view.rules, ctx.view.mySeat);
    if (ctx.view.pieces.some((p) => p.side === side && p.point === point))
      return "success";
    return turnPassed(ctx) ? "fail" : null;
  };
}

/** 모 자리 두 칸 앞의 말과 개·걸. 개로 모에 멈추면 걸이 지름길을 타 방에 선다 */
const SHORTCUT: YutScene = {
  pieces: [{ side: 0, point: 3 }],
  pending: [2, 3],
};

/** 걸로 상대 말 둘을 잡을 수 있다. 다른 말(8번 칸)로 걸을 쓰면 놓친다 */
const CAPTURE: YutScene = {
  pieces: [
    { side: 0, point: 2 },
    { side: 0, point: 8 },
    { side: 1, point: 5 },
    { side: 1, point: 5 },
  ],
  pending: [3],
};

/** 걸로 1번 칸 말을 4번 칸 말에 업을 수 있다 */
const STACK: YutScene = {
  pieces: [
    { side: 0, point: 1 },
    { side: 0, point: 4 },
    { side: 1, point: 12 },
  ],
  pending: [3],
};

/** 18번 칸 말은 걸이면 참먹이를 지나 난다. 뒷모(10) 말로 걸을 쓰면 못 낸다 */
const FINISH: YutScene = {
  pieces: [
    { side: 0, point: 18 },
    { side: 0, point: 10 },
    { side: 1, point: 7 },
  ],
  pending: [3],
};

/** 새 말을 걸로 내보내는 첫 미션. 1번 칸에도 내 말이 있다 */
const FIRST: YutScene = {
  pieces: [{ side: 0, point: 1 }],
  pending: [3],
};

/** 윷을 직접 던지는 미션. 판에 내 말 하나와 상대 말 하나, 던질 차례다 */
const TOSS: YutScene = {
  pieces: [
    { side: 0, point: 2 },
    { side: 1, point: 12 },
  ],
  throwsLeft: 1,
};

/** 내 첫 던지기가 결과로 나오면 성공, 낙(쓸어 던짐·우연·열지 않음)이면 실패 */
function firstThrow({ view, events }: Context): MissionStatus {
  const first = events.find(
    (e) => (e.type === "result" || e.type === "nak") && e.seat === view.mySeat,
  );
  if (!first) return null;
  return first.type === "result" ? "success" : "fail";
}

export const YUT_LESSONS: readonly YutLesson[] = [
  {
    id: "goal",
    title: "윷놀이는 어떤 게임?",
    summary: "윷가락을 던져 나온 만큼 말을 몰아 말 넷을 먼저 다 나게 한다",
    steps: [
      {
        kind: "explain",
        title: "말을 먼저 다 내보내요",
        body: [
          "각자 말 **네 개**를 가지고, 차례대로 **윷가락 넷**을 던져 나온 만큼 말을 움직여요.",
          "말은 오른쪽 아래 **참먹이**에서 나가 판을 **반시계로** 한 바퀴 돌아요. 참먹이를 **지나면** 그 말은 판에서 빠져나가 끝나요. 이것을 **난다**고 해요.",
          "내 말 네 개가 **모두 먼저** 난 사람이 이겨요.",
          "판의 칸은 참먹이 다음 칸부터 반시계로 1번, 2번…이라고 불러요.",
        ],
        scene: {
          pieces: [
            { side: 0, point: 3 },
            { side: 1, point: 9 },
          ],
        },
      },
      {
        kind: "explain",
        title: "도·개·걸·윷·모",
        body: [
          "윷가락은 한쪽이 **평평(배)**하고 다른 쪽이 **둥글어(등)** 요. 배가 위로 온 개수로 정해요.",
          "배 하나 **도(1칸)**, 둘 **개(2칸)**, 셋 **걸(3칸)**, 넷 **윷(4칸)**, 하나도 없으면 **모(5칸)**.",
          "그림은 배가 셋, **걸**이에요.",
        ],
        scene: { pieces: [], sticks: [true, true, false, true] },
      },
      {
        kind: "quiz",
        question: "배가 **둘**, 등이 둘이면?",
        scene: {
          pieces: [],
          sticks: [false, true, true, false],
          hideResult: true,
        },
        options: ["도(1칸)", "걸(3칸)", "개(2칸)", "모(5칸)"],
        answer: 2,
        explain: "배가 둘이면 **개**, 두 칸 가요.",
      },
      {
        kind: "mission",
        title: "새 말 내보내기",
        objective:
          "**걸**이 나왔어요. 아직 판에 없는 말을 판에 올리는 것을 **새 말 내기**라고 해요. 아래 **새 말 내기**를 눌러 새 말을 세 칸 보내세요.",
        hint: "판 위 말이 아니라 **새 말 내기** 단추를 눌러요.",
        scenario: FIRST,
        check: firstMove((m) => m.from === HOME && m.value === 3),
        success:
          "잘했어요! 나온 결과는 판 위 말에 쓸 수도, 새 말을 내는 데 쓸 수도 있어요. 판 위 말을 움직일 때는 쓸 결과를 고른 뒤 움직일 말을 눌러요.",
        fail: "이번엔 새 말을 내보내는 미션이에요. **새 말 내기**를 눌러 보세요.",
        solution: [move(3, HOME)],
        mistake: [move(3, 1)],
      },
    ],
  },
  {
    id: "shortcut",
    title: "지름길",
    summary: "모서리와 방에 멈추면 대각선으로 질러간다",
    steps: [
      {
        kind: "explain",
        title: "멈춰야 꺾어요",
        body: [
          "오른쪽 위 모서리 칸 **모**(던진 결과 모와 이름이 같아요), 왼쪽 위 모서리 칸 **뒷모**에 **멈춘** 말은 다음에 대각선 **지름길**로 가요.",
          "가운데 **방**에 멈춘 말은 **참먹이 쪽**으로 곧장 가요. 가장 빠른 길이에요.",
          "모서리를 멈추지 않고 **지나가기만** 하면 원래 바깥 길로 가요. 방을 지나가기만 하는 말은 타고 온 대각선을 그대로 따라가요.",
        ],
        scene: {
          pieces: [
            { side: 0, point: MO },
            { side: 0, point: CENTER },
          ],
        },
      },
      {
        kind: "quiz",
        question: "**모**를 지나쳐 두 칸 더 간 말은 다음에 어디로 갈까요?",
        options: ["대각선 지름길", "바깥 길로 계속", "방으로 바로", "처음으로"],
        answer: 1,
        explain:
          "지름길은 모서리에 **멈췄을 때만** 타요. 지나치면 바깥 길이에요.",
      },
      {
        kind: "mission",
        title: "방에 서기",
        objective:
          "이번 차례에는 쓸 결과가 **개**와 **걸** 둘이에요. 이렇게 쓰지 않고 남아 있는 결과를 **모은 결과**라고 해요. 모은 결과는 하나씩 골라 원하는 순서로 써요. **개를 먼저** 써서 말을 가운데 **방**에 세우세요.",
        hint: "먼저 **개**로 모에 멈추면, **걸**로 지름길을 따라 방까지 가요.",
        scenario: SHORTCUT,
        check: reach(CENTER),
        success: "방에 섰어요! 다음에는 참먹이 쪽으로 곧장 나갈 수 있어요.",
        fail: "걸을 먼저 쓰면 모를 지나쳐요. **개 → 걸** 순서로 다시 해 봐요.",
        solution: [move(2, 3), move(3, MO)],
        mistake: [move(3, 3), move(2, 6)],
      },
    ],
  },
  {
    id: "capture",
    title: "잡기와 업기",
    summary: "상대 말에 서면 잡고, 내 말에 서면 업는다",
    steps: [
      {
        kind: "explain",
        title: "잡으면 한 번 더",
        body: [
          "상대 말이 있는 자리에 **정확히 서면** 그 말을 **잡아요**. 잡힌 말은 판 밖으로 나가 다시 새 말이 돼요.",
          "잡으면 **한 번 더** 던져요.",
        ],
        scene: CAPTURE,
      },
      {
        kind: "mission",
        title: "말 둘 잡기",
        objective:
          "**걸**로 상대 말을 잡으세요. 한 칸에 함께 선 상대 말 둘이 한꺼번에 돌아가요.",
        hint: "2번 칸 말에서 세 칸 가면 상대 말이 있는 **모**예요.",
        scenario: CAPTURE,
        check: firstMove((m) => m.captured > 0),
        success: "잡았어요! 한 번 더 던질 수 있어요.",
        fail: "아쉬워요. 상대 말에 닿는 말로 걸을 써 보세요.",
        solution: [move(3, 2)],
        mistake: [move(3, 8)],
      },
      {
        kind: "explain",
        title: "업으면 함께 가요",
        body: [
          "내 말이 있는 자리에 서면 두 말이 한데 묶여 다음부터 **함께** 움직여요. 이렇게 묶어 함께 가는 것을 **업는다**고 해요. 한 번에 여러 말이 함께 날 수 있어요.",
          "대신 잡히면 **업힌 말까지 모두** 판 밖으로 돌아가요.",
        ],
        scene: STACK,
      },
      {
        kind: "mission",
        title: "업기",
        objective: "**걸**로 내 말 둘을 업으세요.",
        hint: "1번 칸 말에서 세 칸 가면 4번 칸 내 말 위예요.",
        scenario: STACK,
        check: firstMove((m) => m.stacked > 0),
        success: "업었어요! 이제 둘이 함께 움직여요.",
        fail: "이번엔 업는 미션이에요. 다른 내 말에 정확히 닿는 말을 골라요.",
        solution: [move(3, 1)],
        mistake: [move(3, 4)],
      },
    ],
  },
  {
    id: "bonus",
    title: "한 번 더",
    summary: "윷·모와 잡기는 한 번 더. 모은 결과는 나눠 쓴다",
    steps: [
      {
        kind: "explain",
        title: "윷·모는 한 번 더",
        body: [
          "**윷**이나 **모**가 나오면 한 번 더 던져요. 나온 결과는 **모아 두었다가** 원하는 순서와 말에 나눠 써요.",
          "그림은 **윷, 걸**이 모인 모습이에요. 한 말에 몰아 써도, 두 말에 나눠 써도 돼요.",
        ],
        scene: {
          pieces: [{ side: 0, point: 2 }],
          pending: [4, 3],
        },
      },
      {
        kind: "quiz",
        question: "**모**가 나왔어요. 다음은?",
        options: [
          "바로 말을 움직이고 차례가 끝난다",
          "상대가 던진다",
          "한 번 더 던진다",
          "다시 던지면 모가 사라진다",
        ],
        answer: 2,
        explain: "윷·모는 **한 번 더**예요. 모(5칸)는 그대로 모아 둬요.",
      },
      {
        kind: "quiz",
        question: "상대 말을 잡으면?",
        options: [
          "차례가 끝난다",
          "말을 하나 더 받는다",
          "점수를 얻는다",
          "한 번 더 던진다",
        ],
        answer: 3,
        explain: "잡아도 **한 번 더** 던져요.",
      },
    ],
  },
  {
    id: "home",
    title: "빽도와 나기",
    summary: "빽도는 한 칸 뒤로, 참먹이를 지나야 난다",
    steps: [
      {
        kind: "explain",
        title: "빽도",
        body: [
          "윷가락 하나에 **표시**가 있어요. 그 가락 **하나만** 배가 위면 도 대신 **빽도**, 한 칸 **뒤로** 가요. 표시 없는 가락 하나만 배가 위면 그대로 도예요.",
          "판에 내 말이 없으면 빽도는 **버려요**. 참먹이 바로 다음 1번 칸(**도 자리**)에서 빽도면 **참먹이**에 서요.",
        ],
        scene: {
          pieces: [{ side: 0, point: 1 }],
          sticks: [true, false, false, false],
        },
      },
      {
        kind: "explain",
        title: "참먹이를 지나야 나요",
        body: [
          "말은 참먹이를 **지나야** 나요. 참먹이에 **정확히 서면** 아직 판에 있고, 다음에 빽도가 아닌 결과가 나오면 무엇이든 나요. 빽도가 나오면 한 칸 뒤로 물러나요. 옵션에서 참먹이에 서기만 해도 나게 바꿀 수 있어요.",
        ],
        scene: FINISH,
      },
      {
        kind: "quiz",
        question: "도 자리 말이 **빽도**를 쓰면?",
        options: [
          "처음으로 돌아간다",
          "참먹이에 선다",
          "판 밖으로 난다",
          "움직이지 않는다",
        ],
        answer: 1,
        explain:
          "한 칸 뒤가 **참먹이**예요. 다음에 빽도가 아닌 결과가 나오면 나요.",
      },
      {
        kind: "mission",
        title: "말 나기",
        objective: "**걸**로 말 하나를 **나게 하세요**.",
        hint: "18번 칸에서 세 칸이면 참먹이를 지나요.",
        scenario: FINISH,
        check: firstMove((m) => m.finished),
        success: "났어요! 남은 말도 모두 내면 이겨요.",
        fail: "참먹이에서 먼 말이에요. 참먹이를 **지날 수 있는** 말을 골라요.",
        solution: [move(3, 18)],
        mistake: [move(3, 10)],
      },
    ],
  },
  {
    id: "fair",
    title: "공정한 던지기",
    summary: "윷을 직접 던져 보고, 아무도 결과를 고를 수 없는 까닭을 안다",
    steps: [
      {
        kind: "explain",
        title: "윷 던지는 법",
        body: [
          "지금까지는 이미 나온 결과로 말을 움직였어요. 이번에는 윷을 **직접 던져** 보고, 친구와 할 때 아무도 결과를 고를 수 없는 까닭을 배워요.",
          "윷은 짚으로 엮은 둥근 깔개 **멍석** 위에 던져요. 화면 아래 윷가락을 쥔 손 그림을 잡고 **아래로 당겼다가 위로 튕겨** 놓으면 던져져요. PC는 마우스로 끌었다 놓아요.",
          "많이 당길수록 높이 날고, 튕긴 쪽으로 날고, 빨리 튕길수록 세게 날아가요. 아주 조금만 당기고 놓으면 던지지 않고 「너무 낮게 던졌어요」라고 알려 줘요. 그때는 다시 던지면 돼요.",
        ],
      },
      {
        kind: "explain",
        title: "멍석 밖으로 떨어지면 낙",
        body: [
          "윷가락이 멍석 밖으로 떨어지는 것을 **낙**이라고 해요. 낙이 나면 그 던지기는 없던 일이 되고, 윷·모로 한 번 더 던질 수 있었더라도 더 던지지 못해요. 그 차례에 먼저 나온 결과(앞서 던진 윷 등)는 그대로 써요.",
          "옆으로 치우칠수록, 빨리 튕길수록, 끝까지 다 당겨 아주 높이 던질수록 낙이 잘 나요. 옆으로 쓸어 던지면 반드시 낙이에요.",
          "**절반쯤 당겨 곧장 위로 천천히** 튕기면 낙이 나지 않아요. 키보드로 Enter나 Space를 누르면 이렇게 던진 것과 같아요. 낙은 옵션에서 끌 수도 있어요.",
        ],
      },
      {
        kind: "mission",
        title: "멍석 안에 던지기",
        objective:
          "윷가락을 **절반쯤** 당겼다가 **곧장 위로 천천히** 튕겨 놓아, 낙 없이 던지세요.",
        hint: "옆으로 치우치거나 빨리 튕기면 낙이 날 수 있어요. 키보드라면 Enter를 눌러도 돼요.",
        scenario: TOSS,
        check: firstThrow,
        success:
          "멍석 안에 잘 던졌어요! 이렇게 던지면 낙이 나지 않아요. 나온 결과는 앞에서처럼 말에 써요.",
        fail: "낙이에요. 윷가락이 멍석 밖으로 떨어졌어요. 이번엔 **곧장 위로 천천히** 튕겨 보세요.",
      },
      {
        kind: "explain",
        title: "모두가 함께 정해요",
        body: [
          "화면에서는 윷가락이 굴러 멈추지만, 결과는 기기들이 계산으로 먼저 정하고 윷가락은 그 결과대로 굴러요. 친구와 할 때 이 계산은 온라인 대전을 연 사람(**방장**)의 기기가 해요. 그러면 방장이 결과를 마음대로 정할 수 있을 것 같지만, 방장을 포함해 **누구도 결과를 고를 수 없어요**. 이번에는 그 까닭이에요.",
          "판을 시작할 때 모두의 기기가 각자 던지기마다 하나씩 쓸 **비밀 값**을 여럿 정해 차례로 줄 세우고, 그 줄을 **봉인**해 다른 모두의 기기에 보내 둬요. 봉인은 봉투에 넣고 봉한 것과 같아요. 넣은 사람 말고는 아무도 안을 볼 수 없지만, 나중에 열었을 때 처음 넣은 것과 같은지는 누구나 확인할 수 있어요. 그래서 줄을 나중에 바꿀 수 없어요.",
          "윷을 던지면 내 기기가 내 **몸짓**(당긴 길이, 튕긴 쪽, 튕긴 빠르기)을 먼저 봉인해 보내요. 그다음 모두의 기기가 자기 줄에서 다음 비밀 값을 하나씩 열고, 마지막으로 내 기기가 내 몸짓을 열어요. 결과는 **몸짓과 모두의 값**을 모두가 똑같이 아는 계산법으로 섞어 정해요. 여는 일은 기기가 저절로 해요.",
        ],
      },
      {
        kind: "explain",
        title: "아무도 고를 수 없어요",
        body: [
          "던지는 나는 몸짓을 정할 때 **남의 다음 값을 몰라요**. 그래서 어떤 몸짓이 윷이 될지 알 수 없어요.",
          "다른 사람은 방장까지 모두 **내 몸짓이 봉인돼 있어** 몰라요. 그래서 자기 값을 열기 전에 결과를 미리 계산할 수 없고, 결과가 불리한지 모르니 자기 값을 감출 까닭도 없어요.",
          "몸짓이 조금만 달라도 결과가 바뀌지만, 어느 몸짓이 무엇이 될지는 아무도 몰라요. 그래서 몸짓으로 노릴 수 있는 것은 **낙이 날지 말지**뿐이에요.",
          "모두의 값이 열린 뒤에는 던진 내 기기가 몸짓을 열기 직전에 결과를 먼저 계산할 수 있어요. 그때는 몸짓이 이미 봉인돼 있어 바꿀 수 없어요. 기기를 일부러 고쳐 몸짓을 열지 않고 버티면, 모두의 값이 열린 뒤 20초가 지나 그 던지기는 **낙처럼 없던 일**이 돼요. 더 좋은 결과로 바꿀 길은 없어요.",
          "판이 끝나면 모두의 기기가 봉인과 연 값을 모두 같은 계산법으로 **다시 계산**해, 결과가 맞는지 확인해요.",
        ],
      },
      {
        kind: "quiz",
        question:
          "친구와 하는 윷놀이에서 윷을 던지기 **전에** 다음 결과를 미리 아는 사람은?",
        options: [
          "방장",
          "다음에 던질 사람",
          "아무도 없다",
          "먼저 들어온 사람",
        ],
        answer: 2,
        explain:
          "던지는 사람은 남의 다음 값을 모르고, 다른 사람은 아직 몸짓을 몰라요. 결과는 **몸짓과 모두의 값**이 다 모여야 정해져요.",
      },
      {
        kind: "quiz",
        question: "몸짓으로 노릴 수 있는 것은?",
        options: ["윷이나 모", "상대의 다음 결과", "낙이 날지 말지", "빽도"],
        answer: 2,
        explain:
          "몸짓이 달라지면 결과도 바뀌지만 무엇이 될지는 아무도 몰라요. 노릴 수 있는 것은 **낙**뿐이에요.",
      },
      {
        kind: "quiz",
        question:
          "결과가 마음에 안 들어 기기를 고쳐 봉인한 몸짓을 열지 않으면?",
        options: [
          "다시 던진다",
          "원하는 결과를 고른다",
          "그 던지기는 없던 일이 되고 더 던지지 못한다",
          "상대가 대신 던진다",
        ],
        answer: 2,
        explain:
          "20초가 지나면 그 던지기는 **낙처럼 없던 일**이 돼요. 결과를 더 좋게 바꿀 수는 없어요.",
      },
    ],
  },
  {
    id: "real",
    title: "실전",
    summary: "컴퓨터와 처음부터 한 판",
    steps: [
      {
        kind: "explain",
        title: "이기는 요령",
        body: [
          "**모·뒷모·방**에 멈추면 지름길로 빨리 나요.",
          "상대 말이 갈 방향으로 **1~5칸 앞**(빽도면 1칸 뒤)에 서면 잡힐 수 있어요. 잡을 수 있으면 먼저 잡고, 한 번 더 던져요.",
          "업으면 빨라지지만 잡히면 함께 돌아가요. 상대 말 앞 1~5칸 안에서는 업지 않는 게 안전해요.",
        ],
      },
      {
        kind: "mission",
        title: "한 판 이기기",
        objective:
          "가장 쉬운 단계인 입문 컴퓨터와 처음부터 한 판 해서 **이기세요**.",
        hint: "결과를 고른 뒤 움직일 말을 눌러요. 모서리에 멈추면 지름길이에요.",
        scenario: null,
        check: ({ view, events }) => {
          const ended = events.find((e) => e.type === "gameEnded");
          if (ended?.type !== "gameEnded") return null;
          return ended.result?.side === sideOf(view.rules, view.mySeat)
            ? "success"
            : "fail";
        },
        success: "이겼어요! 이제 컴퓨터 단계를 올리거나 친구와 겨뤄 보세요.",
        fail: "아쉬워요. 지름길과 잡기를 노려 다시 해 봐요.",
      },
    ],
  },
];
