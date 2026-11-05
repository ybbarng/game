import {
  type BoardLayout,
  buildBoard,
  type GalaxyBoard,
  SKIES,
} from "@game/galaxy-engine";

/**
 * 판 배치 견주기(docs/48 15-3). 배치는 엔진 `buildBoard`의 `layout`이 정하고(g4 기본은 split),
 * bench는 같은 하늘로 배치만 바꾼 판을 견준다.
 * - grouped: g3까지의 판(별자리 셋이 붙어 있다)
 * - spread(가 완전히 섞기)
 * - split(나 반쯤 섞기): 별 둘은 제 변, 가장 어두운 하나는 맞은편 변 공문 옆
 */
export type LayoutKind = BoardLayout;

export const LAYOUT_NAMES: Record<LayoutKind, string> = {
  grouped: "셋 붙임(g3)",
  spread: "(가) 완전히 섞기",
  split: "(나) 반쯤 섞기(g4)",
};

/** 하늘 id의 판을 배치 kind로 만든다(기본 하늘이 아니면 먼저 `loadSky`) */
export function layoutBoard(skyId: string, kind: LayoutKind): GalaxyBoard {
  const sky = SKIES.get(skyId);
  if (!sky) throw new Error(`불러오지 않은 하늘: ${skyId}`);
  return buildBoard(sky, sky.board, kind);
}
