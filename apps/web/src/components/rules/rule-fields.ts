import type {
  DealMissRules,
  LoseScoring,
  ReverseRunCondition,
  RuleSet,
  WinScoring,
} from "@game/mighty-engine";

type BoolKey = {
  [K in keyof RuleSet]: RuleSet[K] extends boolean ? K : never;
}[keyof RuleSet];

export interface BoolField {
  key: BoolKey;
  label: string;
  hint?: string;
}

export interface DealMissField {
  key: keyof DealMissRules;
  label: string;
  hint?: string;
}

export interface RuleGroup {
  title: string;
  fields: BoolField[];
}

/** 켜고 끄는 옵션. 원작 옵션 창(PRule*.cpp)의 묶음을 따른다 */
export const BOOL_GROUPS: RuleGroup[] = [
  {
    title: "진행",
    fields: [
      {
        key: "friend",
        label: "프렌드 제도",
        hint: "끄면 주공 혼자 나머지 모두와 겨룬다.",
      },
      {
        key: "jokerFriend",
        label: "조커 프렌드 허용",
        hint: "주공이 조커를 가진 사람을 프렌드로 정할 수 있다.",
      },
      {
        key: "revealFriendOnScore",
        label: "프렌드가 득점하면 바로 공개",
        hint: "카드 한 장으로 정한 프렌드가 점수 카드가 든 턴을 이기면, 그 자리에서 누구인지 밝힌다.",
      },
      {
        key: "hideScoredCards",
        label: "딴 점수 카드 숨기기",
        hint: "각자 딴 점수 카드를 장수로만 보여 준다.",
      },
      {
        key: "discardedPointsToOpposition",
        label: "묻은 점수 카드는 야당 몫",
        hint: "끄면 주공이 바닥에 묻은 점수 카드를 여당이 딴 것으로 친다.",
      },
      {
        key: "friendLeadsNextRound",
        label: "다음 판 딜러는 프렌드",
        hint: "카드를 나눠 주고 공약을 가장 먼저 부르는 딜러를 이번 판 프렌드가 맡는다. 끄면 주공이 맡는다.",
      },
      { key: "randomSeat", label: "판마다 자리 섞기" },
    ],
  },
  {
    title: "공약",
    fields: [
      {
        key: "highGoal",
        label: "25까지 부르기",
        hint: "끄면 20이 가장 높은 공약이다.",
      },
      {
        key: "firstBidderMayPass",
        label: "딜러도 포기할 수 있다",
        hint: "공약을 가장 먼저 부르는 딜러가 부르지 않고 포기할 수 있다.",
      },
      { key: "passAgain", label: "포기한 사람도 다시 부를 수 있다" },
      {
        key: "raise2ForKirudaChange",
        label: "당선 뒤 기루다를 바꾸면 공약 +2",
        hint: "당선된 뒤 기루다를 바꾸려면 공약 장수를 2 올려야 한다. 끄면 1만 올린다.",
      },
      {
        key: "noKirudaAdvantage",
        label: "노기루다는 1 적게 부를 수 있다",
        hint: "최소 공약을 부를 때와 당선 뒤 기루다를 바꿀 때만 1 적게 불러도 된다.",
      },
      {
        key: "noKirudaAlways",
        label: "노기루다는 늘 1 적게 친다",
        hint: "선거 내내 노기루다 공약을 같은 숫자의 기루다 공약보다 1 높게 친다. 그래서 ♠15 다음에 노기루다 15를 부를 수 있다.",
      },
    ],
  },
  {
    title: "카드를 낼 수 있는 때와 힘",
    fields: [
      { key: "mightyInFirstTrick", label: "첫 턴에 마이티 내기" },
      {
        key: "mightyEffectInFirstTrick",
        label: "첫 턴 마이티의 힘",
        hint: "끄면 첫 턴에 마이티를 내도 가장 센 카드로 치지 않는다.",
      },
      { key: "mightyInLastTrick", label: "마지막 턴에 마이티 내기" },
      {
        key: "mightyEffectInLastTrick",
        label: "마지막 턴 마이티의 힘",
        hint: "끄면 마지막 턴에 마이티를 내도 가장 센 카드로 치지 않는다.",
      },
      { key: "jokerInFirstTrick", label: "첫 턴에 조커 내기" },
      {
        key: "jokerEffectInFirstTrick",
        label: "첫 턴 조커의 힘",
        hint: "끄면 첫 턴에 조커를 내도 센 카드로 치지 않는다.",
      },
      {
        key: "jokerInLastTrick",
        label: "마지막 턴에 조커 내기",
        hint: "끄면 조커를 든 사람은 마지막 턴 바로 앞 턴까지 조커를 내야 한다.",
      },
      {
        key: "jokerEffectInLastTrick",
        label: "마지막 턴 조커의 힘",
        hint: "끄면 마지막 턴에 조커를 내도 센 카드로 치지 않는다.",
      },
      {
        key: "mightyOverridesJokerCall",
        label: "조커콜을 받으면 마이티로 대신 내기",
        hint: "조커콜에 조커를 내야 할 때 조커 대신 마이티를 내도 된다.",
      },
      {
        key: "jokerCallEffectInFirstTrick",
        label: "첫 턴 조커콜의 힘",
        hint: "끄면 첫 턴에 조커콜 카드를 내도 조커를 불러내지 않는다.",
      },
      {
        key: "calledJokerKeepsEffect",
        label: "조커콜로 끌려 나온 조커도 힘이 있다",
        hint: "끄면 조커콜에 끌려 나온 조커는 센 카드로 치지 않는다.",
      },
      {
        key: "kirudaInFirstTrick",
        label: "첫 턴에 기루다 내기 (선이 아닌 사람)",
      },
      {
        key: "leaderKirudaInFirstTrick",
        label: "첫 턴 선(주공)도 기루다 내기",
      },
    ],
  },
  {
    title: "점수 배수",
    fields: [
      { key: "doubleForRun", label: "런(20장) 2배" },
      { key: "doubleForDeclaredRunOnly", label: "20을 선언한 런만 2배" },
      {
        key: "staticRun",
        label: "런이면 점수는 늘 20",
        hint: "여당이 점수 카드 20장을 다 가져오면, 점수 계산식과 2배를 쓰지 않고 20점으로 정한다.",
      },
      { key: "doubleForReverseRun", label: "백런 2배" },
      { key: "doubleForNoKiruda", label: "노기루다 승리 2배" },
      { key: "doubleForNoFriend", label: "노프렌드 승리 2배" },
    ],
  },
];

export const DEAL_MISS_FIELDS: DealMissField[] = [
  { key: "noPoint", label: "점수 카드 0장" },
  {
    key: "oneOrLess",
    label: "점수 카드 1장 이하",
    hint: "위 조건을 0장에서 1장 이하로 넓힌다.",
  },
  { key: "only10", label: "점수 카드가 10 한 장뿐" },
  { key: "oneEyedJack", label: "점수 카드가 애꾸눈 J(♥J·♠J) 한 장뿐" },
  { key: "allPoint", label: "모두 점수 카드" },
  {
    key: "jokerCountsMinusOne",
    label: "조커는 점수 카드 −1장으로 센다",
    hint: "조커가 있으면 점수 카드 장수에서 1장을 뺀다.",
  },
  { key: "mightyCountsZero", label: "마이티는 점수 카드로 세지 않음" },
  {
    key: "duplicate",
    label: "조커·마이티로 장수를 줄인 뒤에도 10·J 조건을 다시 보기",
  },
];

export const WIN_SCORING: { value: WinScoring; label: string }[] = [
  {
    value: "risk20",
    label: "높게 걸수록 크게(위험보상 2.0) — (공약−최소)×2 + (득점−공약)",
  },
  {
    value: "risk40",
    label: "높게 걸수록 크게(위험보상 4.0) — (공약−최소)×1.5 + (득점−공약)",
  },
  { value: "call", label: "부르는 게 값 — (공약−최소+1)×2" },
  { value: "eyeForEye", label: "눈에는 눈 — 득점−공약" },
  { value: "modifiedEyeForEye", label: "수정 눈에는 눈 — 득점−공약+1" },
  { value: "base10", label: "득점−10" },
  { value: "base13", label: "득점−13" },
  { value: "baseMin", label: "득점−최소 공약" },
];

export const LOSE_SCORING: { value: LoseScoring; label: string }[] = [
  { value: "eyeForEye", label: "공약−득점" },
  {
    value: "toothForTooth",
    label: "최소 공약에 못 미치면 2배로 — (공약−최소)+(최소−득점)×2",
  },
];

export const REVERSE_RUN: { value: ReverseRunCondition; label: string }[] = [
  { value: "goal", label: "야당이 공약 장수 이상" },
  { value: "eleven", label: "야당이 11장 이상" },
  { value: "minGoal", label: "야당이 최소 공약 장수 이상" },
];
