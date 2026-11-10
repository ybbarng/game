import type { TimePreset } from "@game/mighty-engine";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 0 입문, 1 중수, 2 고수, 3 초고수(2026-11-03 더함. 예전에 저장한 0~2는 그대로 읽힌다) */
export type ChessLevel = 0 | 1 | 2 | 3;

/** 나홀로 체스에서 내 색: 백(먼저)·흑·무작위 */
export type ColorPick = "white" | "black" | "random";

/**
 * 기물 모양: 입체 그림(기본)·유니코드 기호. 입체는 SVG 도형이라 기호 글꼴이 없는 기기에서도 보인다
 */
export type PieceSet = "3d" | "glyph";

/** 체스만의 설정. 첫 그리기 뒤에 저장값을 읽는다(ChessApp이 rehydrate) */
interface ChessSettings {
  winsToFinish: number;
  level: ChessLevel;
  pick: ColorPick;
  /** 개인 시간(기본 시간 + 초읽기) */
  time: TimePreset;
  /** 판 위에 a~h·1~8 칸 이름을 보인다 */
  coordinates: boolean;
  /** 기물을 입체 그림으로 그릴지 기호 글자로 그릴지 */
  pieces: PieceSet;
  /** 잡힐 수 있는 내 기물을 판에 주황 점선으로 보인다. 화면 도움일 뿐 규칙과 상관없다(바둑 「단수 표시」와 짝) */
  dangerHint: boolean;
  set(patch: Partial<Omit<ChessSettings, "set">>): void;
}

export const useChessSettings = create<ChessSettings>()(
  persist(
    (set) => ({
      winsToFinish: 1,
      level: 0,
      pick: "white",
      time: "none",
      coordinates: true,
      pieces: "3d",
      dangerHint: true,
      set: (patch) => set(patch),
    }),
    {
      name: "chess-settings",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);

export const CHESS_LEVELS: readonly {
  value: ChessLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 0,
    label: "입문",
    description: "한 수만 본다. 공짜 기물은 잡지만 자기 기물을 자주 내준다.",
  },
  {
    value: 1,
    label: "중수",
    description:
      "두 수 앞을 보고, 기물을 주고받을 때 손해인지 따진다. 기물을 공짜로 주지 않는다.",
  },
  {
    value: 2,
    label: "고수",
    description: "네 수 앞까지 읽는다. 메이트할 수 있으면 놓치지 않는다.",
  },
  {
    value: 3,
    label: "초고수",
    description:
      "고수보다 깊이 읽고, 킹이 안전한지, 기물이 갈 수 있는 칸이 많은지, 막을 상대 폰이 없는 폰이 있는지까지 따진다. 처음 몇 수는 널리 알려진 수로 두고, 킹과 폰만 남은 판의 마무리를 정확히 둔다.",
  },
];
