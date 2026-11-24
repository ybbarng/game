import type { Snapshot } from "@/game/host";
import type { KitStats } from "@/game/kit";

import { holdGame, holdRound } from "./pending";
import {
  addGame,
  addRound,
  type GameRecord,
  type RoundRecord,
  type StatsMode,
} from "./records";

/** 어느 대국을 기록하나. `key`는 대국마다 다르다(혼자: 시드, 온라인: 방 코드와 시작 시각) */
export interface StatsTarget {
  game: string;
  mode: StatsMode;
  key: string;
  /** 친구와 할 때 같이 앉은 사람 이름(나와 컴퓨터 빼고). 판·게임이 끝날 때 불러 그때 이름을 남긴다 */
  people?: () => readonly string[];
  /**
   * 온라인 참가자: 이 기기의 게임 끝 검증 결과가 나올 때까지 내 기록에 넣지 않고 기다린다(stats/pending.ts).
   * 통과하면 넣고, 실패하면(무효 게임) 버린다. 방장·혼자 하기는 이 기기가 엔진이라 바로 넣는다
   */
  hold?: boolean;
}

/**
 * 내 자리 화면을 따라가며 판과 게임이 끝날 때 기록을 남긴다. 마이티·하트가 함께 쓰고,
 * 무엇을 남길지는 게임 키트의 `stats`가 정한다.
 */
export class StatsRecorder<View, Event> {
  private events: Event[] = [];
  private start: View | null = null;
  private done = false;

  constructor(
    private readonly spec: KitStats<View, Event>,
    private readonly target: StatsTarget,
  ) {}

  /** 같이 한 사람이 있으면 `with` 칸 */
  private withPeople(): { with: string[] } | Record<string, never> {
    const names = this.target.people?.() ?? [];
    return names.length > 0 ? { with: [...names] } : {};
  }

  private putRound(record: RoundRecord): void {
    if (this.target.hold) holdRound(this.target.key, record);
    else addRound(record);
  }

  private putGame(record: GameRecord): void {
    if (this.target.hold) holdGame(this.target.key, record);
    else addGame(record);
  }

  observe(snapshot: Snapshot<View, Event>): void {
    if (this.done) return;
    const { view, events } = snapshot;
    if (this.spec.roundStarted(events)) {
      this.events = [];
      this.start = view;
    }
    this.events.push(...events);
    if (this.spec.roundEnded(events)) {
      const data = this.spec.round(this.start, view, this.events);
      if (data !== null)
        this.putRound({
          id: `${this.target.key}:${this.spec.roundNumber(view)}`,
          game: this.target.game,
          at: Date.now(),
          mode: this.target.mode,
          ...(this.start === null ? { partial: true as const } : {}),
          ...this.withPeople(),
          data,
        });
      this.start = null;
      this.events = [];
    }
    if (this.spec.gameEnded(events)) {
      this.done = true;
      this.putGame({
        id: this.target.key,
        game: this.target.game,
        at: Date.now(),
        mode: this.target.mode,
        ...this.withPeople(),
        data: this.spec.game(view, events),
      });
    }
  }
}
