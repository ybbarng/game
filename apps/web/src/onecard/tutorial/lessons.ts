import type { Card } from "@game/mighty-engine";
import type {
  Action,
  GameEvent,
  OnecardCard,
  OnecardView,
} from "@game/onecard-engine";

import type { Lesson, MissionContext, MissionStatus } from "@/tutorial/types";

import type { OnecardScene } from "./script";

export { ONECARD_TUTORIAL_RULES, type OnecardScene } from "./script";

export type OnecardLesson = Lesson<
  OnecardView,
  GameEvent,
  OnecardScene,
  Action
>;
type Context = MissionContext<OnecardView, GameEvent>;

// ── 미션 판정 ──────────────────────────────────────────────

/** 내 첫 차례 행동(낸 카드·무늬 또는 먹기) */
function myFirstMove({ view, events }: Context) {
  return (
    events.find(
      (e) =>
        (e.type === "played" || e.type === "drew") && e.seat === view.mySeat,
    ) ?? null
  );
}

/** 처음 낸 카드가 `ok`면 성공, 다른 카드를 내거나 먹으면 실패 */
function firstPlay(ok: (card: OnecardCard, suit: string | null) => boolean) {
  return (ctx: Context): MissionStatus => {
    const move = myFirstMove(ctx);
    if (!move) return null;
    return move.type === "played" && ok(move.card, move.suit)
      ? "success"
      : "fail";
  };
}

/** 컴퓨터(1번)를 잡으면 성공. 잡기 전에 내 차례 행동을 하거나 헛외침이면 실패 */
function caughtComputer({ view, events }: Context): MissionStatus {
  const me = view.mySeat;
  let pressed = false;
  for (const e of events) {
    if (e.type === "caught" && e.seat === me) return "success";
    if (e.type === "falseShout" && e.seat === me) return "fail";
    if (e.type === "shouted" && e.seat === me) pressed = true;
    // 쳐 두고 바로 카드를 내도 모은 누름이 먼저 처리돼 잡힌다. 치지 않고 내면 실패
    if ((e.type === "played" || e.type === "drew") && e.seat === me && !pressed)
      return "fail";
    // 잡지 못한 채 컴퓨터가 다 냈다
    if (e.type === "finished" && e.seat !== me) return "fail";
  }
  return null;
}

/**
 * 한 장을 낸 뒤 더미를 쳐 외치면 성공(o2 겨루기: 한 장이 된 화면이 뜬 뒤에 친다). 내기 전에 치면 헛외침이라 실패,
 * 잡히거나 외치지 않은 채 다음 차례 행동을 해도 실패
 */
function calledAfterPlay({ view, events }: Context): MissionStatus {
  const me = view.mySeat;
  let played = false;
  for (const e of events) {
    if (e.type === "caught" && e.target === me) return "fail";
    if (!("seat" in e) || e.seat !== me) continue;
    if (e.type === "falseShout") return "fail";
    if (e.type === "shouted" && played) return "success";
    if (e.type === "played" || e.type === "drew") {
      if (played) return "fail";
      played = e.type === "played";
      if (!played) return "fail";
    }
  }
  return null;
}

/** 받아쳐서 파산을 피하면 성공. 먹거나 파산하면 실패 */
function dodgedBankrupt(ctx: Context): MissionStatus {
  const me = ctx.view.mySeat;
  if (ctx.events.some((e) => e.type === "bankrupt" && e.seat === me))
    return "fail";
  const move = myFirstMove(ctx);
  if (!move) return null;
  return move.type === "played" ? "success" : "fail";
}

/** 한 판을 끝까지 하면 성공 */
function finishedMatch({ events }: Context): MissionStatus {
  return events.some((e) => e.type === "ended") ? "success" : null;
}

/** 설명 그림 카드. 공통 단원 형식은 마이티 `Card`라 컬러 조커("JC")를 넣으려고 넓혀 둔다 */
function pictureCards(cards: OnecardCard[]): Card[] {
  return cards as string[] as Card[];
}

// ── 장면 ──────────────────────────────────────────────

/** 버린 더미 맨 위 ♥5. 같은 숫자 ♠5, 같은 무늬 ♥9를 낼 수 있다 */
export const FOLLOW_SCENE: OnecardScene = {
  hands: [
    ["S5", "H9", "C8", "D3", "C4"],
    ["D6", "S8", "C10", "S3", "D4"],
  ],
  pile: ["H5"],
};

/** 낼 카드가 하나도 없다(퀴즈 그림) */
export const NO_MOVE_SCENE: OnecardScene = {
  hands: [
    ["S3", "D8", "C10", "S9"],
    ["D6", "S8", "C3", "D4"],
  ],
  pile: ["H5"],
};

/** 맨 위 ♠9. ♠는 7뿐이고 ♥가 많다 */
export const SEVEN_SCENE: OnecardScene = {
  hands: [
    ["S7", "H3", "H6", "H8", "C10"],
    ["D5", "D8", "C3", "C6", "D10"],
  ],
  pile: ["S9"],
};

/** 셋이 한다. 다음 사람(1번)이 ◆5 한 장 남았다. ◆4를 내면 1번이 ◆5로 끝낸다 */
export const JACK_SCENE: OnecardScene = {
  hands: [["DJ", "D4", "C9", "S6", "H3"], ["D5"], ["D10", "S4", "H8"]],
  pile: ["D8"],
};

/** ♥2 공격(2장)을 받았다. ♠2·♥A로 받아칠 수 있다 */
export const COUNTER_SCENE: OnecardScene = {
  hands: [
    ["S2", "HA", "C5", "D9", "CK"],
    ["D4", "C3", "S8", "D7", "C6"],
  ],
  pile: ["H8", "H2"],
  attack: 2,
};

/** 두 장 남았다: ♥A와 ♥5(퀴즈 그림). A로는 끝낼 수 없다 */
export const FINISH_SCENE: OnecardScene = {
  hands: [
    ["HA", "H5"],
    ["D4", "C3", "S8", "D7"],
  ],
  pile: ["H9"],
};

/** 컴퓨터(1번)가 두 장에서 ◆4를 내고 외치지 않는다 */
export const CATCH_SCENE: OnecardScene = {
  hands: [
    ["S3", "D6", "H10", "S10", "CQ"],
    ["D4", "C8"],
  ],
  pile: ["D9"],
  turn: 1,
  script: { 1: [{ type: "play", card: "D4" }] },
};

/** 내 차례, 두 장 남았다 */
export const CALL_SCENE: OnecardScene = {
  hands: [
    ["H5", "H9"],
    ["S4", "C6", "D8", "S10", "CJ"],
  ],
  pile: ["H3"],
};

/** 17장을 들고 ♥A 공격(3장)을 받았다. 더미는 한 장뿐이라 먹으면 다시 섞는다 */
export const BANKRUPT_SCENE: OnecardScene = {
  hands: [
    [
      "S3",
      "S4",
      "S5",
      "S6",
      "S8",
      "S9",
      "D3",
      "D4",
      "D5",
      "D6",
      "D8",
      "D9",
      "H3",
      "H4",
      "H6",
      "H8",
      "CA",
    ],
    ["C3", "C4", "C5", "C6", "C8"],
  ],
  pile: ["D10", "DJ", "DQ", "S10", "SJ", "HA"],
  deck: ["C9"],
  attack: 3,
};

// ── 단원 ──────────────────────────────────────────────

export const ONECARD_LESSONS: readonly OnecardLesson[] = [
  {
    id: "basic",
    title: "원카드는 어떤 게임?",
    summary: "같은 무늬나 같은 숫자를 내고, 먼저 다 내면 이긴다",
    steps: [
      {
        kind: "explain",
        title: "가장 먼저 다 내면 이겨요",
        body: [
          "원카드는 2~5명이 카드 52장에 조커 2장(**흑백 조커** 한 장과 **컬러 조커** 한 장)을 더해 하는 카드 게임이에요.",
          "한 사람이 7장씩 받고, 손에 든 카드를 **가장 먼저 다 낸 사람**이 이겨요.",
        ],
        cards: pictureCards(["JK", "JC"]),
      },
      {
        kind: "explain",
        title: "같은 무늬나 같은 숫자",
        body: [
          "낸 카드는 가운데에 쌓여요. 이것을 **버린 더미**라고 해요. 버린 더미 맨 위 카드와 **무늬가 같거나 숫자가 같은** 카드를 한 장 내요.",
          "맨 위가 ♥5면 ♥ 카드나 5를 낼 수 있어요.",
          "**조커**는 맨 위 카드와 상관없이 아무 때나 낼 수 있고, 조커 다음에는 아무 카드나 낼 수 있어요. 다만 조커는 공격 카드라서, 다음 사람은 먼저 그 공격부터 처리해야 해요. 공격은 3단원에서 배워요.",
        ],
        scene: FOLLOW_SCENE,
      },
      {
        kind: "explain",
        title: "낼 게 없으면 먹어요",
        body: [
          "엎어 쌓아 둔 카드는 **가져올 더미**예요. 낼 카드가 없으면 가져올 더미에서 한 장을 가져오고 차례가 끝나요. 이것을 **먹는다**고 해요.",
          "낼 카드가 있어도 먹을 수는 있지만, 손에 든 카드(**손패**)가 늘어나니 손해예요.",
        ],
        scene: NO_MOVE_SCENE,
      },
      {
        kind: "quiz",
        question: "맨 위가 ♥5예요. 낼 수 있는 카드는?",
        scene: FOLLOW_SCENE,
        options: ["♣8", "♠5", "◆3"],
        answer: 1,
        explain: "♠5는 숫자가 5로 같아서 낼 수 있어요. ♥9도 무늬가 같아 돼요.",
      },
      {
        kind: "quiz",
        question: "낼 카드가 하나도 없으면?",
        scene: NO_MOVE_SCENE,
        options: [
          "아무 카드나 낸다",
          "한 장 먹고 차례를 넘긴다",
          "그냥 넘긴다",
        ],
        answer: 1,
        explain: "더미에서 한 장 먹으면 차례가 끝나요.",
      },
      {
        kind: "mission",
        title: "카드 내기",
        objective: "맨 위는 ♥5예요. **낼 수 있는 카드를 내세요.**",
        hint: "같은 무늬(♥)나 같은 숫자(5)를 찾아보세요. ♠5나 ♥9예요.",
        scenario: FOLLOW_SCENE,
        check: firstPlay(() => true),
        success: "잘했어요! 이렇게 한 장씩 줄여 가요.",
        fail: "낼 카드가 있는데 먹으면 손패만 늘어요. ♠5나 ♥9를 내 보세요.",
        solution: [{ type: "play", card: "S5" }],
        mistake: [{ type: "draw" }],
      },
    ],
  },
  {
    id: "special",
    title: "특수 카드",
    summary: "7 무늬 바꾸기, J 건너뛰기, Q 방향 바꾸기, K 한 번 더",
    steps: [
      {
        kind: "explain",
        title: "판을 바꾸는 카드 넷",
        body: [
          "**7**: 내면서 다음 사람이 맞출 **무늬를 골라요**.",
          "**J**: 다음 사람을 **건너뛰어요**.",
          "**Q**: 도는 **방향을 거꾸로** 바꿔요.",
          "**K**: 내가 **한 번 더** 내요.",
        ],
        cards: ["S7", "DJ", "HQ", "CK"],
      },
      {
        kind: "explain",
        title: "둘이 할 때",
        body: ["둘이 하면 J를 내도, Q를 내도 다시 내 차례예요. K와 같아져요."],
      },
      {
        kind: "quiz",
        question: "K를 내면 어떻게 될까요?",
        options: [
          "다음 사람을 건너뛴다",
          "내가 한 번 더 낸다",
          "방향이 바뀐다",
        ],
        answer: 1,
        explain: "K는 한 번 더예요. 건너뛰기는 J, 방향 바꾸기는 Q예요.",
      },
      {
        kind: "mission",
        title: "7로 무늬 바꾸기",
        objective:
          "맨 위는 ♠9예요. **7을 내면서 내가 많이 가진 ♥로 바꾸세요.**",
        hint: "♠7을 누르고 무늬는 ♥를 고르세요. 그러면 다음에 ♥를 낼 수 있어요.",
        scenario: SEVEN_SCENE,
        check: firstPlay((card, suit) => card === "S7" && suit === "H"),
        success: "무늬를 ♥로 바꿨어요. 이제 ♥ 석 장을 차례로 낼 수 있어요.",
        fail: "♥가 석 장이니 ♥로 바꾸는 게 좋아요. 다시 해 보세요.",
        solution: [{ type: "play", card: "S7", suit: "H" }],
        mistake: [{ type: "play", card: "S7", suit: "D" }],
      },
      {
        kind: "mission",
        title: "J로 건너뛰기",
        objective:
          "다음 사람이 **한 장** 남았어요. **J로 그 사람을 건너뛰세요.**",
        hint: "◆J를 내면 다음 사람을 건너뛰고 그 다음 사람 차례가 돼요.",
        scenario: JACK_SCENE,
        check: firstPlay((card) => card === "DJ"),
        success: "한 장 남은 사람이 낼 기회를 놓쳤어요!",
        fail: "그러면 다음 사람이 마지막 카드를 낼 수도 있어요. ◆J를 내 보세요.",
        solution: [{ type: "play", card: "DJ" }],
        mistake: [{ type: "play", card: "D4" }],
      },
    ],
  },
  {
    id: "attack",
    title: "공격과 막기",
    summary: "2·A·조커로 공격하고, 받아쳐서 넘긴다",
    steps: [
      {
        kind: "explain",
        title: "공격 카드",
        body: [
          "공격 카드를 내면 다음 사람이 카드를 먹어야 해요.",
          "**2**는 2장, **A**는 3장, **♠A**는 5장, **흑백 조커**는 5장, **컬러 조커**는 7장이에요.",
        ],
        cards: pictureCards(["H2", "DA", "SA", "JK", "JC"]),
      },
      {
        kind: "explain",
        title: "받아치면 쌓여요",
        body: [
          "공격을 받으면 공격 카드로 **받아쳐서** 다음 사람에게 넘길 수 있어요. 장 수는 **쌓여요**. 받아치는 것을 「막는다」고도 해요.",
          "**2** 위에는 아무 2, 같은 무늬 A, 조커. **A** 위에는 아무 A, 조커. **조커** 위에는 조커만.",
          "받아칠 카드가 없으면 쌓인 장 수를 **모두 먹고** 차례가 끝나요.",
        ],
        scene: COUNTER_SCENE,
      },
      {
        kind: "explain",
        title: "마지막 카드",
        body: [
          "마지막 한 장은 **공격 카드(2·A·조커)로 끝낼 수 없어요.** 공격 카드는 미리 써 두세요.",
        ],
        scene: FINISH_SCENE,
      },
      {
        kind: "quiz",
        question:
          "♥2(2장) 위에 ♠2로 받아쳤어요. 다음 사람이 막지 못하면 몇 장?",
        options: ["2장", "4장", "5장"],
        answer: 1,
        explain: "2장에 2장이 쌓여 4장이에요.",
      },
      {
        kind: "quiz",
        question: "◆A로 공격받았어요. 받아칠 수 있는 카드는?",
        options: ["◆2", "♣A", "◆K"],
        answer: 1,
        explain: "A 위에는 아무 A나 조커만 낼 수 있어요. 2로는 막을 수 없어요.",
      },
      {
        kind: "quiz",
        question: "♥A와 ♥5가 남았어요. 맨 위는 ♥9. 무엇을 먼저 낼까요?",
        scene: FINISH_SCENE,
        options: ["♥A", "♥5"],
        answer: 0,
        explain:
          "♥5를 먼저 내면 ♥A 한 장이 남는데, A로는 끝낼 수 없어요. ♥A를 먼저 내요.",
      },
      {
        kind: "mission",
        title: "받아치기",
        objective: "♥2로 공격받았어요(2장). **받아쳐서 넘기세요.**",
        hint: "2 위에는 아무 2나 같은 무늬 A를 낼 수 있어요. ♠2나 ♥A예요.",
        scenario: COUNTER_SCENE,
        check: firstPlay(() => true),
        success: "받아쳤어요! 이제 다음 사람이 쌓인 장 수를 막아야 해요.",
        fail: "먹으면 2장이 손에 들어와요. ♠2나 ♥A로 받아쳐 보세요.",
        solution: [{ type: "play", card: "S2" }],
        mistake: [{ type: "draw" }],
      },
    ],
  },
  {
    id: "shout",
    title: "원카드! 외치기와 잡기",
    summary: "한 장이 되면 가장 빨리 버린 더미를 친 사람이 겨루기에서 이긴다",
    steps: [
      {
        kind: "explain",
        title: '더미를 치면 "원카드!"',
        body: [
          '카드를 내고 **한 장**이 남으면 **가운데 버린 더미를 쳐서** "원카드!"를 외쳐요. 키보드로는 스페이스 키를 눌러요.',
          "더미는 손을 떼기 전에 잠깐 **누르고 있어야** 쳐져요. 스치기만 해서는 안 쳐져요.",
          "**카드를 낸 뒤에** 치세요. 내기 전에 미리 치면 헛외침이에요.",
        ],
      },
      {
        kind: "explain",
        title: "화면은 알려 주지 않아요",
        body: [
          "누가 한 장이 됐는지, 누가 외쳤는지 화면이 따로 알려 주지 않아요. 남은 카드 수를 보고 **스스로 알아채야** 해요.",
          "남이 외치면 소리와 말풍선이 잠깐 떠요.",
        ],
      },
      {
        kind: "explain",
        title: "누가 더 빨랐나",
        body: [
          "누가 한 장이 되면 **3초** 동안 누구나 더미를 칠 수 있어요. **가장 빨리 친 사람**이 이 겨루기에서 이겨요.",
          "한 장이 된 **본인**이 가장 빠르면 안전, **남**이 더 빠르면 본인이 **1장** 먹어요(잡힘). 아무도 안 치면 그냥 지나가요.",
          "빠르기는 각자 기기에서 **한 장이 된 화면이 뜬 때부터 친 때까지**로 재요. 0.1초보다 빠르면 모두 0.1초로 치고, 비기면 본인이 이겨요.",
          "이 튜토리얼에서는 3초 대신 5초를 줘요.",
        ],
      },
      {
        kind: "explain",
        title: "괜히 치면 내가 먹어요",
        body: [
          "한 장인 사람이 없는데 더미를 치면 **헛외침**이에요. 친 사람이 **1장** 먹어요.",
          "한 장인 사람이 이미 외친 것을 본 뒤에 치면 헛외침이에요. 겨루기 도중에 남이 먼저 쳐서 끝난 뒤 늦게 닿은 것은 그 겨루기에서 한 번만 봐줘요(두 번째부터는 헛외침).",
        ],
      },
      {
        kind: "quiz",
        question: "아무도 한 장이 아닌데 더미를 쳤어요. 어떻게 될까요?",
        options: ["아무 일 없다", "내가 한 장 먹는다", "모두 한 장씩 먹는다"],
        answer: 1,
        explain: "헛외침이라 친 사람이 1장 먹어요.",
      },
      {
        kind: "quiz",
        question:
          "컴퓨터가 한 장이 됐어요. 컴퓨터는 0.4초 만에, 나는 0.3초 만에 더미를 쳤어요. 어떻게 될까요?",
        options: ["컴퓨터가 안전하다", "컴퓨터가 잡혀 1장 먹는다"],
        answer: 1,
        explain:
          "내가 더 빨랐으니 잡기예요. 내 신호가 늦게 도착해도 한 장이 된 화면을 본 때부터 잰 빠르기로 견줘요.",
      },
      {
        kind: "mission",
        title: "깜빡한 컴퓨터 잡기",
        objective:
          "컴퓨터가 카드를 내고 **한 장**이 됐어요. 컴퓨터보다 **먼저 더미를 쳐서 잡으세요.**",
        hint: "컴퓨터 카드 수를 보세요. 한 장이면 바로 가운데 더미를 치세요.",
        scenario: CATCH_SCENE,
        check: caughtComputer,
        success: "잡았어요! 깜빡한 컴퓨터가 1장 먹었어요.",
        fail: "내 카드를 내지 말고, 컴퓨터가 한 장이 되면 바로 더미를 쳐서 잡아 보세요.",
        // 컴퓨터가 낸 뒤 판 번호는 1. 그 판을 보고 0.3초 만에 친다(모으는 시간이 지나면 잡힌다)
        solution: [{ type: "shout", seen: 1, rt: 300 }, { type: "raceEnd" }],
        mistake: [{ type: "play", card: "D6" }],
      },
      {
        kind: "mission",
        title: "원카드 외치기",
        objective:
          "내 카드가 **두 장**이에요. 한 장을 **낸 뒤 바로 더미를 쳐서** 외치세요.",
        hint: "♥5나 ♥9를 내고, 한 장이 되면 가운데 버린 더미를 치세요.",
        scenario: CALL_SCENE,
        check: calledAfterPlay,
        success: "외쳤어요! 남보다 먼저 쳐서 안전해요.",
        fail: "내기 전에 치면 헛외침이에요. 한 장을 낸 뒤에 더미를 쳐 보세요.",
        // 낸 뒤 판 번호는 1(컴퓨터가 이어 내도 그 판을 본 것으로 친다)
        solution: [
          { type: "play", card: "H5" },
          { type: "shout", seen: 1, rt: 250 },
          { type: "raceEnd" },
        ],
        mistake: [{ type: "shout", seen: 0 }],
      },
    ],
  },
  {
    id: "end",
    title: "다시 섞기, 파산, 순위",
    summary: "가져올 더미가 바닥나면 다시 섞고, 손패가 20장이 되면 파산",
    steps: [
      {
        kind: "explain",
        title: "더미가 바닥나면",
        body: [
          "가져올 더미가 바닥나면 버린 더미에서 **맨 위 한 장만 남기고** 나머지를 섞어 새 더미로 써요.",
        ],
      },
      {
        kind: "explain",
        title: "20장이면 파산",
        body: [
          "손패가 **20장**이 되면 **파산**해서 판에서 빠져요. 공격을 많이 먹을 때 조심하세요.",
          "파산한 사람의 카드는 버린 더미 밑으로 들어가요.",
        ],
      },
      {
        kind: "explain",
        title: "순위",
        body: [
          "한 사람이 다 내도 판은 이어지고, **한 사람만 남을 때** 끝나요.",
          "순위는 **먼저 다 낸 순서**예요. 파산한 사람은 맨 뒤이고, 늦게 파산한 사람이 더 위예요.",
          "친구와 할 때 연결이 끊긴 사람을 더 기다리지 않기로 해서 판을 중간에 끝내면, 아직 카드가 남은 사람끼리는 남은 카드가 **적은** 사람이 위예요.",
        ],
      },
      {
        kind: "quiz",
        question: "손패가 18장인데 ♠2 공격(2장)을 먹으면?",
        options: [
          "20장이 되어 파산한다",
          "19장이 된다",
          "공격은 18장부터 받지 않는다",
        ],
        answer: 0,
        explain: "18장에 2장을 먹으면 20장이라 파산이에요.",
      },
      {
        kind: "quiz",
        question:
          "A는 다 냈어요. B는 3장, C는 1장 남았을 때, 연결이 끊긴 사람을 기다리지 않기로 해서 판을 중간에 끝냈어요. 2등은?",
        options: ["B", "C"],
        answer: 1,
        explain: "다 낸 A가 1등, 남은 사람 중 카드가 적은 C가 2등이에요.",
      },
      {
        kind: "mission",
        title: "파산 피하기",
        objective:
          "손패 17장에 ♥A 공격(3장)을 받았어요. 먹으면 20장이에요. **파산을 피하세요.**",
        hint: "A 위에는 아무 A나 조커를 낼 수 있어요. 손에 ♣A가 있어요.",
        scenario: BANKRUPT_SCENE,
        check: dodgedBankrupt,
        success: "♣A로 받아쳐서 살았어요! 이제 컴퓨터가 6장을 막아야 해요.",
        fail: "3장을 먹어 20장이 되어 파산했어요. ♣A로 받아쳐 보세요.",
        solution: [{ type: "play", card: "CA" }],
        mistake: [{ type: "draw" }],
      },
      {
        kind: "mission",
        title: "실전 한 판",
        objective: "컴퓨터와 **한 판을 끝까지** 해 보세요.",
        hint: "한 장이 되면 바로 더미를 치세요. 남이 한 장이 되면 먼저 쳐서 잡으세요.",
        scenario: null,
        check: finishedMatch,
        success: "한 판을 끝냈어요. 이제 원카드를 할 수 있어요!",
        fail: "",
      },
    ],
  },
];
