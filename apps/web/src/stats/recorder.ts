import type { Snapshot } from "@/game/host";
import type { KitStats } from "@/game/kit";

import { addGame, addRound, type StatsMode } from "./records";

/** 어느 대국을 기록하나. `key`는 대국마다 다르다(혼자: 시드, 온라인: 방 코드와 시작 시각) */
export interface StatsTarget {
  game: string;
  mode: StatsMode;
  key: string;
  /** 친구와 할 때 같이 앉은 사람 이름(나와 컴퓨터 빼고). 판·게임이 끝날 때 불러 그때 이름을 남긴다 */
  people?: () => readonly string[];
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
        addRound({
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
      addGame({
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
