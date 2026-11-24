import type { TimePreset } from "@game/mighty-engine";

import type {
  RoomGame,
  RoomMatch,
  RoomStore,
  StoreHook,
} from "@/components/RoomScreen";
import { timePresetLabel } from "@/components/TimePresetPicker";
import type { GameKit, KitBot } from "@/game/kit";
import type { GuestRoom } from "@/net/guest-room";
import type { HostRoom } from "@/net/host-room";
import type { ArchiveTarget } from "@/review/recorder";
import type { StatsTarget } from "@/stats/recorder";

/** 끊긴 사람 대신 컴퓨터가 두기까지 기다리는 시간. 판 게임은 한 수가 승패를 가르고 오래 생각하기도 하니 넉넉히 */
const STAND_IN_MS = 60_000;

/** 판 게임 저장소가 온라인 대국에 쓰는 부분(오목·장기·체스·바둑·숫자야구·윷놀이·은하 저장소가 모두 갖췄다) */
export interface BoardOnlineStore<View, ActionT, Event> extends RoomStore {
  attachOnline(
    host: RoomMatch<View, ActionT, Event>,
    seatNames: string[],
    stats: StatsTarget,
    archive?: ArchiveTarget,
  ): void;
}

/** 판 게임마다 다른 것. `boardRoom`이 방 화면 설정(`RoomGame`)으로 바꾼다 */
export interface BoardOnlineGame<
  Rules extends { time?: TimePreset },
  State,
  View extends { decision: unknown; roundNumber: number },
  ActionT,
  Event,
> {
  kit: GameKit<Rules, State, View, ActionT, Event, undefined>;
  /** 화면에 보이는 게임 이름. 예: "오목" */
  name: string;
  /** 초대 링크를 보낼 때 제목. 예: "오목 한 판 하자" */
  shareTitle: string;
  /** 지금 들어가 있는 방 */
  session: {
    host: HostRoom<Rules, State, View, ActionT, Event, undefined> | null;
    guest: GuestRoom<Rules, State, View, ActionT, Event, undefined> | null;
  };
  useStore: StoreHook<BoardOnlineStore<View, ActionT, Event>>;
  /** 단계별 컴퓨터 */
  botFor(level: number): KitBot<View, ActionT>;
  /** 방장이 방을 만들 때 보이는 규칙 요약(시간 규칙은 앞에 붙는다) */
  rulesSummary(rules: Rules): string;
  /** 규칙 요약 아래 설명 문장(있으면) */
  rulesNote?(rules: Rules): string;
}

/**
 * 판 게임의 방 화면 설정: 친구가 들어와야 시작하고, 끊긴 사람은 1분 기다린 뒤 중수가 대신 둔다.
 * 숨길 패가 없어 암호화방은 쓰지 않는다
 */
export function boardRoom<
  Rules extends { time?: TimePreset },
  State,
  View extends { decision: unknown; roundNumber: number },
  ActionT,
  Event,
>(
  game: BoardOnlineGame<Rules, State, View, ActionT, Event>,
): RoomGame<Rules, State, View, ActionT, Event, undefined> {
  const { useStore } = game;
  return {
    kit: game.kit,
    name: game.name,
    shareTitle: game.shareTitle,
    session: game.session,
    useStore,
    attach: (match, { seatNames, stats, archive }) =>
      useStore.getState().attachOnline(match, seatNames, stats, archive),
    botFor: game.botFor,
    standInMs: STAND_IN_MS,
    rulesSummary(rules) {
      const time = timePresetLabel(rules.time);
      return `${time ? `${time} · ` : ""}${game.rulesSummary(rules)}`;
    },
    ...(game.rulesNote ? { rulesNote: game.rulesNote } : {}),
    needsFriend: true,
    botSeatLabel: "친구를 기다리는 중",
    footnote:
      "서버 없이 두 기기를 바로 이어요. 연결 문제를 고치려고 연결에 걸린 시간을 서버에 보내요. 둔 수·이름·채팅은 보내지 않아요.",
    theme: {
      background: "bg-[radial-gradient(ellipse_at_top,#1e293b_0%,#020617_70%)]",
      dataGame: "center",
    },
  };
}
