// 공식 덩어리 ×n(docs/51 2-1). 같은 덩어리(R U R′ U′ 같은 짧은 공식)를 끊김 없이 되풀이해 치면 수 흐름 띠 끝에
// 「×n」을 작게 붙인다. 화면을 모르는 순수 함수다.
// - 친 차례 그대로 본다(띠처럼 같은 층을 합치지 않는다): 수네를 두 번 치면 R′ R가 이어져 띠에서는 지워지지만,
//   덩어리로는 두 번 친 것이다.
// - 덩어리는 3~8수, 더 짧은 덩어리의 되풀이가 아니다(R U R U는 「R U」 되풀이라 덩어리가 아니다). 두 층 이상을
//   쓴다(R R R는 덩어리가 아니다).
// - 끊김: 수 사이가 흐름 콤보와 같은 1초를 넘거나, 큐브를 통째로 돌리면 처음부터 다시 센다(쥔 방향이 바뀌면 같은
//   글이라도 다른 수다).
// - n은 끝까지 친 덩어리 수. 다음 덩어리를 치는 도중에도 그 첫머리가 맞는 동안은 앞의 n을 보인다.
import { COMBO_GAP_MS } from "./combo";

/** 이어 친 면 돌리기(끊기면 비운다) */
export interface ChunkRun {
  readonly beats: readonly string[];
  /** 마지막 면 돌리기 시각(ms) */
  readonly at: number | null;
}

export const EMPTY_CHUNK: ChunkRun = { beats: [], at: null };

export const CHUNK_MIN = 3;
export const CHUNK_MAX = 8;
/** 덩어리 셈에 남기는 수(덩어리 8수 × 여섯 번) */
const KEEP = CHUNK_MAX * 6;

/** 수 하나를 더한다. `text`는 그 수의 표기 글(WCA), 큐브 돌리기면 `rotation` */
export function pushChunk(
  run: ChunkRun,
  text: string,
  at: number,
  rotation: boolean,
): ChunkRun {
  if (rotation) return EMPTY_CHUNK;
  const broken = run.at === null || at - run.at > COMBO_GAP_MS;
  const beats = broken ? [text] : [...run.beats, text].slice(-KEEP);
  return { beats, at };
}

function periodic(block: readonly string[], p: number): boolean {
  if (block.length % p !== 0) return false;
  for (let i = p; i < block.length; i++)
    if (block[i] !== block[i - p]) return false;
  return true;
}

export interface ChunkRepeat {
  /** 덩어리 수 */
  readonly block: readonly string[];
  /** 끝까지 친 덩어리 수(2부터) */
  readonly count: number;
}

/** 지금 끝에서 이어지는 덩어리 되풀이. 두 번 넘게 친 것이 없으면 null */
export function chunkRepeat(beats: readonly string[]): ChunkRepeat | null {
  let best: ChunkRepeat | null = null;
  for (let len = CHUNK_MIN; len <= CHUNK_MAX; len++) {
    if (beats.length < len * 2) break;
    // 끝에서부터 len 앞과 같은 수가 몇 개 이어지나
    let same = 0;
    for (let i = beats.length - 1; i >= len; i--) {
      if (beats[i] !== beats[i - len]) break;
      same++;
    }
    const total = same + len;
    const count = Math.floor(total / len);
    if (count < 2) continue;
    const from = beats.length - total;
    const block = beats.slice(from, from + len);
    let smaller = false;
    for (let p = 1; p < len && !smaller; p++) smaller = periodic(block, p);
    if (smaller) continue;
    const layers = new Set(block.map((t) => t.replace(/['2′]/g, "")));
    if (layers.size < 2) continue;
    if (!best || count > best.count) best = { block, count };
  }
  return best;
}

/** 지금(`now`) 보일 덩어리 수. 1초 넘게 멈췄으면 0 */
export function chunkNow(run: ChunkRun, now: number): number {
  if (run.at === null || now - run.at > COMBO_GAP_MS) return 0;
  return chunkRepeat(run.beats)?.count ?? 0;
}
