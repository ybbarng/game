import {
  type Bot,
  beginnerBot,
  intermediateBot,
  searchBot,
} from "@game/mighty-ai";

/** 0 입문, 1 중수, 2 고수. 저장해 둔 값(1 중수, 2 고수)이 그대로 이어지도록 입문을 0에 둔다 */
export type BotLevel = 0 | 1 | 2;

export const BOT_LEVELS: readonly {
  value: BotLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 0,
    label: "입문",
    description:
      "흔히 쓰는 요령을 모르고, 처음 하는 사람이 자주 하는 실수를 해요.",
  },
  {
    value: 1,
    label: "중수",
    description:
      "흔히 쓰는 요령대로 하고, 가끔 실수해요. 이를테면 주공 편이 아닐 때 마이티 무늬의 낮은 카드를 내 마이티를 끌어내고, 주공일 때 손에 적게 든 무늬를 바닥 카드로 통째로 묻어 그 무늬가 나오면 기루다로 이겨요. 조커가 같은 편에 있을 법하면 조커콜을 하지 않아요.",
  },
  {
    value: 2,
    label: "고수",
    description:
      "많이 해 본 사람처럼 공약으로 남의 카드를 짐작하고, 나온 기루다·큰 카드를 세며 수를 읽어요. 컴퓨터마다 성향이 달라요.",
  },
];

/**
 * 입문은 실수가 잦은 규칙 봇, 중수는 정석 규칙 봇(가끔 실수), 고수는 남의 패를 추측해 끝까지 둬 보는 봇.
 * 고수는 자리마다 성향(보통·공격형·신중형)이 달라 공약 기준·기억력·버릇이 다르다
 */
export function botFor(level: BotLevel): Bot {
  return level === 2 ? searchBot : level === 0 ? beginnerBot : intermediateBot;
}

/** 봇 수 사이에 브라우저가 그림을 그리고 입력을 받게 한다 */
export function browserPace(next: () => void): void {
  setTimeout(next, 0);
}
