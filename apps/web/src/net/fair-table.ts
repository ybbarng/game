import type {
  Clock,
  FairControl,
  FairDevice,
  FairWire,
  GroupName,
  Incident,
  PartySnapshot,
} from "@game/fair-play";

import type { GameKit, KitLoggedAction, StepOutcome } from "@/game/kit";
import type { BusyCoordinator } from "./fair-bar";
import type { FairReplayGame } from "./fair-verify";

/**
 * 판마다 함께 섞어 나눈 패로 끝까지 치는 카드 게임(마이티·하트)의 멘탈 포커 판. 게임마다 fair-play의 판
 * (마이티 `FairHostTable`·`FairGuestSeat`, 하트 `HeartsHostTable`·`HeartsGuestSeat`)을 만들어 온라인 방에 넘긴다.
 * 방(HostRoom·GuestRoom)은 이것만 알고 어떤 게임인지는 모른다. 바닥·더미가 있는 화투 셋·원카드는 `GameKit.cardTable`.
 *
 * 판 코드는 멘탈 포커 전체를 끌어와 무겁다. 혼자 하기 묶음에 싣지 않도록 킷에는 불러오는 함수(`loadFairTable`)만
 * 두고, 온라인 방을 열 때 `withFairTable`로 불러 `fairTable`을 채운 킷을 방에 넘긴다
 */
export interface KitFairTable<Rules, State, View, Action, Event, Extra> {
  /** 방장: 판을 만든다. 대국(LocalMatch)은 방이 이 판으로 만든다 */
  host(
    context: FairHostContext<Rules, State, Action>,
  ): KitFairHost<State, View, Action, Event, Extra>;
  /** 참가자: 내 자리 진행을 만든다 */
  guest(context: FairGuestContext<Rules, View, Event>): KitFairSeat;
  /** 판 끝 다시 계산하기(진짜 카드로 돌리기, 화면 만들기, 기록 속 행동 바꾸기) */
  readonly replay: FairReplayGame;
  /**
   * 방장이 보낸 원본 화면이 판 끝(정산)까지 간 판이면 그 판 번호, 아니면 null(`finishedRoundOf`).
   * 게임 끝 검증이 끝낸 판이 다 열렸는지 볼 때 쓴다
   */
  finishedRound(view: unknown): number | null;
}

/** 방장이 판을 만들 때 방이 주는 것 */
export interface FairHostContext<Rules, State, Action> {
  rules: Rules;
  seed: number;
  guestSeats: readonly number[];
  group: GroupName;
  clock: Clock;
  /** 새로고침 전에 남긴 열쇠 */
  restore?: Record<number, PartySnapshot>;
  hooks: {
    /** 대국 상태를 고친다(자리 표에 연 카드 넣기 등) */
    patch(fn: (state: State) => State): void;
    state(): State;
    log(): readonly KitLoggedAction<Action>[];
    refresh(): void;
    broadcast(message: FairWire | FairControl): void;
    /** 한 기기에게만(하트: 넘긴 카드 열쇠는 받는 기기에게만, 다시 보내기 기록에도 남기지 않는다) */
    sendTo(message: FairWire, device: number): void;
    onIncident(incident: Incident): void;
  };
}

/** 킷이 만든 방장 판과, 그 판으로 대국을 만들 때 게임마다 다른 것 */
export interface KitFairHost<State, View, Action, Event, Extra> {
  readonly table: KitHostTable<State, View, Action, Event>;
  /** 첫 판 패(자리 표). 대국을 만들 때 넣는다 */
  presetDeal(): Extra;
  /** 카드를 아직 못 열었을 때 보낼 화면(손패와 결정을 숨긴다, 자리 표로 결정하지 않게) */
  maskView(view: View): View;
  /** 행동할 자리(없으면 엔진대로). 하트 첫 선처럼 엔진이 모르는 자리를 알려 준다 */
  pendingSeats?(state: State): number[];
}

/** 다 연 판 하나의 실제 패. 방은 자리 표 → 카드(`cards`)만 본다(복기·판 끝 검증) */
export interface KitRoundDeal {
  readonly cards: ReadonlyMap<number, string>;
}

/** 방이 쓰는 방장 판(fair-play 판 그대로. 시험이 판 클래스로 들여다볼 수 있게 감싸지 않는다) */
export interface KitHostTable<State, View, Action, Event> {
  readonly device: FairDevice;
  readonly coordinator: BusyCoordinator;
  /** 다 연 판의 실제 패(복기용) */
  readonly deals: ReadonlyMap<number, KitRoundDeal>;
  /** 걸음별 사건(다시 연결한 참가자에게 다시 보낸다) */
  readonly history: readonly unknown[];
  step(state: State, seat: number, action: Action): StepOutcome<State, Event>;
  prepare(
    state: State,
    seat: number,
    action: Action,
  ): Promise<{ ok: true; action: Action } | { ok: false; error: string }>;
  viewFor(seat: number, view: View): View | null;
  after(state: State, events: readonly Event[]): void;
  /** 대국을 만든 뒤 첫 사건으로 첫 판을 시작한다 */
  begin(events: readonly Event[]): void;
  snapshot(): unknown;
  resume(saved: unknown): void;
  receive(message: FairWire, from: number): void;
  /** 방장 물음에 참가자가 답했다(마이티 죽이기·프렌드). 묻지 않는 게임은 없다 */
  answer?(from: number, id: string, have: boolean, slot?: number): void;
}

/** 참가자가 자리 진행을 만들 때 방이 주는 것 */
export interface FairGuestContext<Rules, View, Event> {
  rules: Rules;
  seat: number;
  guestSeats: readonly number[];
  group: GroupName;
  clock: Clock;
  /** 새로고침 전에 남긴 열쇠 */
  restore?: Record<number, PartySnapshot>;
  broadcast(message: FairWire | FairControl): void;
  /** 한 기기에게만(하트: 넘긴 카드 열쇠는 받는 기기에게만 직접, 방장을 거치지 않는다) */
  sendTo(message: FairWire, device: number): void;
  onIncident(incident: Incident): void;
  /** 화면을 내 카드로 바꿔 넘긴다 */
  onSnapshot(view: View, events: Event[]): void;
  /** 판의 모든 카드가 열리고 기록이 왔다: 다시 계산해 검증할 때 */
  onVerify(deal: number, log: readonly unknown[]): void;
}

/** 방이 쓰는 참가자 자리 진행(fair-play 자리 그대로) */
export interface KitFairSeat {
  readonly device: FairDevice;
  readonly coordinator: BusyCoordinator & {
    incident(incident: Incident): void;
  };
  readonly deals: ReadonlyMap<number, KitRoundDeal>;
  receive(message: FairWire | FairControl, from: number): void;
  history(items: readonly unknown[]): void;
  snapshot(view: unknown, events: unknown[], resync?: boolean): void;
  /** 내가 보낼 행동을 자리 표로 바꾼다(못 바꾸면 null) */
  outgoing(action: unknown): unknown;
  /** 열쇠를 공개한 판이 모두 열릴 때까지 기다린다 */
  whenRevealedOpened(): Promise<unknown>;
}

/** 암호화방을 열려는데 킷의 멘탈 포커 판을 불러오지 않았다(`withFairTable`을 거치지 않은 킷) */
export const FAIR_TABLE_MISSING = "멘탈 포커 판을 불러오지 않았어요.";

/**
 * 온라인 방에 넘길 킷: 멘탈 포커 판을 따로 불러오는 게임(`loadFairTable`)이면 불러와 `fairTable`을 채운다.
 * 방을 만들기 전에 부른다(방은 판을 바로 꺼내 쓴다)
 */
export async function withFairTable<Rules, State, View, Action, Event, Extra>(
  kit: GameKit<Rules, State, View, Action, Event, Extra>,
): Promise<GameKit<Rules, State, View, Action, Event, Extra>> {
  if (kit.fairTable || !kit.loadFairTable) return kit;
  return { ...kit, fairTable: await kit.loadFairTable() };
}
