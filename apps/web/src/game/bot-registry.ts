import type { KitBot } from "./kit";

/**
 * 컴퓨터를 다시 만들 열쇠. 함수(봇)는 웹 워커로 넘길 수 없어서, 워커가 이 열쇠로 같은 봇을 다시 만든다.
 * `level`은 그 게임의 `kit.botFor(level)`과 같은 봇, `name`은 화면용 고수처럼 단계 밖의 봇이다
 */
export type BotKey =
  | { game: string; level: number }
  | { game: string; name: "advisor" };

type AnyBot = KitBot<unknown, unknown>;
const as = (bot: unknown) => bot as AnyBot;

/**
 * 게임별로 봇 모듈을 따로 불러온다(동적 import라 번들이 게임마다 나뉜다). 워커와 화면 스레드가 같은 표를 쓰므로
 * 어느 쪽에서 계산해도 같은 봇이다. 새 게임은 여기에 한 줄을 더한다(docs/21)
 */
const loaders: Record<string, (key: BotKey) => Promise<AnyBot>> = {
  mighty: async (key) => {
    const { botFor } = await import("./bots");
    return as(botFor(levelOf(key) as 0 | 1 | 2));
  },
  hearts: async (key) => {
    const { heartsBotFor } = await import("../hearts/bots");
    return as(heartsBotFor(levelOf(key) as 0 | 1 | 2));
  },
  chess: async (key) => {
    if ("name" in key)
      return as((await import("../chess/advisor")).chessAdvisor);
    const { chessBotFor } = await import("@game/chess-ai");
    return as(chessBotFor(key.level));
  },
  janggi: async (key) => {
    const { janggiBotFor } = await import("@game/janggi-ai");
    // 화면용 고수는 대국 고수(2단계)와 같다(힌트·문제 받는 수).
    return as(janggiBotFor("name" in key ? 2 : key.level));
  },
  omok: async (key) => {
    const { omokBotFor } = await import("@game/omok-ai");
    return as(omokBotFor("name" in key ? 2 : key.level));
  },
  baduk: async (key) => {
    if ("name" in key)
      return as((await import("../baduk/advisor")).badukAdvisor);
    const { badukBotFor } = await import("@game/baduk-ai");
    return as(badukBotFor(key.level));
  },
  baseball: async (key) => {
    const { baseballBotFor } = await import("@game/baseball-ai");
    return as(baseballBotFor(levelOf(key)));
  },
  gostop: async (key) => {
    const { gostopBotFor } = await import("@game/gostop-ai");
    return as(gostopBotFor(levelOf(key)));
  },
  minhwatu: async (key) => {
    const { minhwatuBotFor } = await import("@game/minhwatu-ai");
    return as(minhwatuBotFor(levelOf(key)));
  },
  nyrongppong: async (key) => {
    const { nyrongppongBotFor } = await import("@game/nyrongppong-ai");
    return as(nyrongppongBotFor(levelOf(key)));
  },
  yut: async (key) => {
    const { yutBotFor } = await import("@game/yut-ai");
    return as(yutBotFor(levelOf(key)));
  },
};

function levelOf(key: BotKey): number {
  if ("name" in key) throw new Error(`${key.game}에는 ${key.name} 봇이 없다`);
  return key.level;
}

const cache = new Map<string, Promise<AnyBot>>();

/** 열쇠로 봇을 불러온다(한 번 불러온 봇은 다시 쓴다) */
export function loadBot(key: BotKey): Promise<AnyBot> {
  const id = JSON.stringify(key);
  let found = cache.get(id);
  if (!found) {
    const loader = loaders[key.game];
    if (!loader) return Promise.reject(new Error(`모르는 게임: ${key.game}`));
    found = loader(key);
    // 불러오다 실패하면 다음에 다시 시도한다.
    found.catch(() => cache.delete(id));
    cache.set(id, found);
  }
  return found;
}

/** 등록부에 있는 게임 이름(시험: 모든 게임 kit이 등록됐는지 본다) */
export const registeredGames = (): string[] => Object.keys(loaders);

/** 워커에 보내는 일 한 건(`bot-worker.ts`) */
export interface BotJob {
  id: number;
  key: BotKey;
  view: unknown;
  seed: number;
}

/** 워커의 답: 고른 행동과 그 뒤 난수, 또는 실패 */
export type BotReply =
  | { id: number; action: unknown; seed: number }
  | { id: number; error: string };
