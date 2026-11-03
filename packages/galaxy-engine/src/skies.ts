import { buildBoard, type GalaxyBoard } from "./board";
import seasons from "./sky/seasons.json";
import { SKY_IDS } from "./sky-ids";
import type { GalaxyConstellation, GalaxySky } from "./sky-types";

/**
 * 하늘 목록(docs/48 5-9). 하늘 파일은 `scripts/build-sky.mjs`가 만들고,
 * 판 위 별(`board`)을 함께 담아 파일 하나로 판을 만든다.
 * 같은 별자리도 하늘마다 고른 별이 달라 후보 목록(`constellations.json`)이 아니라 `board`를 쓴다.
 *
 * 기본 하늘(사계절)만 바로 묶고, 나머지 하늘은 `loadSky`로 쓸 때 불러온다(웹 묶음이 하늘 수만큼 커지지 않게).
 * 불러온 하늘은 `boardOfSky`가 바로 쓸 수 있다.
 */
export interface SkyFile extends GalaxySky {
  board: GalaxyConstellation[];
}

export { OPEN_SKIES, SKY_IDS } from "./sky-ids";

/** 기본 하늘(바로 묶는 하나) */
export const DEFAULT_SKY = "seasons";

const loaded = new Map<string, SkyFile>([[DEFAULT_SKY, seasons as SkyFile]]);

/** 지금까지 불러온 하늘(기본 하늘은 처음부터 있다) */
export const SKIES: ReadonlyMap<string, SkyFile> = loaded;

/** 하늘 파일을 불러오는 곳. 번들러가 하늘마다 따로 나누게 import 문을 하나씩 적는다 */
const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  seasons: async () => ({ default: seasons }),
  zodiac: () => import("./sky/zodiac.json"),
  south: () => import("./sky/south.json"),
  summer: () => import("./sky/summer.json"),
  autumn: () => import("./sky/autumn.json"),
  winter: () => import("./sky/winter.json"),
};

/** 하늘을 불러온다(한 번 불러오면 다시 쓴다). 없는 하늘이면 거절 */
export async function loadSky(id: string): Promise<SkyFile> {
  const hit = loaded.get(id);
  if (hit) return hit;
  const loader = SKY_IDS.includes(id) ? LOADERS[id] : undefined;
  if (!loader) throw new Error(`없는 하늘: ${id}`);
  const sky = (await loader()).default as SkyFile;
  loaded.set(id, sky);
  return sky;
}

const boards = new Map<string, GalaxyBoard>();

/**
 * 하늘 id로 판을 만든다(같은 하늘이면 같은 판). 기본 하늘이 아니면 먼저 `loadSky`로 불러 둬야 한다.
 * 없거나 불러오지 않은 하늘이면 오류
 */
export function boardOfSky(id: string): GalaxyBoard {
  const cached = boards.get(id);
  if (cached) return cached;
  const sky = loaded.get(id);
  if (!sky)
    throw new Error(
      SKY_IDS.includes(id)
        ? `아직 불러오지 않은 하늘: ${id}(loadSky로 먼저 불러온다)`
        : `없는 하늘: ${id}`,
    );
  const board = buildBoard(sky, sky.board);
  boards.set(id, board);
  return board;
}
