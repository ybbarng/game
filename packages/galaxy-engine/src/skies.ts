import { buildBoard, type GalaxyBoard } from "./board";
import autumn from "./sky/autumn.json";
import seasons from "./sky/seasons.json";
import south from "./sky/south.json";
import summer from "./sky/summer.json";
import winter from "./sky/winter.json";
import zodiac from "./sky/zodiac.json";
import type { GalaxyConstellation, GalaxySky } from "./sky-types";

/**
 * 하늘 목록(docs/48 5-9). 하늘 파일은 `scripts/build-sky.mjs`가 만들고,
 * 판 위 별(`board`)을 함께 담아 파일 하나로 판을 만든다.
 * 같은 별자리도 하늘마다 고른 별이 달라 후보 목록(`constellations.json`)이 아니라 `board`를 쓴다.
 */
export interface SkyFile extends GalaxySky {
  board: GalaxyConstellation[];
}

const FILES = [seasons, zodiac, south, summer, autumn, winter] as SkyFile[];

/** 처음 여는 하늘(F7: 나머지는 bench로 하늘마다 확인한 뒤 연다) */
export const OPEN_SKIES: readonly string[] = ["seasons"];

export const SKIES: ReadonlyMap<string, SkyFile> = new Map(
  FILES.map((f) => [f.id, f]),
);

const boards = new Map<string, GalaxyBoard>();

/** 하늘 id로 판을 만든다(같은 하늘이면 같은 판). 없는 하늘이면 오류 */
export function boardOfSky(id: string): GalaxyBoard {
  const cached = boards.get(id);
  if (cached) return cached;
  const sky = SKIES.get(id);
  if (!sky) throw new Error(`없는 하늘: ${id}`);
  const board = buildBoard(sky, sky.board);
  boards.set(id, board);
  return board;
}
