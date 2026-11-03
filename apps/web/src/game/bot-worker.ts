/// <reference lib="webworker" />
import { type BotJob, type BotReply, loadBot } from "./bot-registry";

/**
 * 컴퓨터 수를 화면 밖 스레드에서 센다(`bot-runner.ts`가 부른다). 열쇠로 봇을 불러와 받은 화면과 난수로
 * 한 수를 고르고, 고른 행동과 그 뒤의 난수를 돌려준다(부르는 쪽이 그 난수를 이어 쓴다)
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (event: MessageEvent<BotJob>) => {
  const { id, key, view, seed } = event.data;
  try {
    const bot = await loadBot(key);
    const rng = { seed };
    const action = bot.decide(view, rng);
    scope.postMessage({ id, action, seed: rng.seed } satisfies BotReply);
  } catch (err) {
    scope.postMessage({ id, error: String(err) } satisfies BotReply);
  }
};
