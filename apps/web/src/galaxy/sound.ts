import { BANK, type GalaxyView, type GameEvent } from "@game/galaxy-engine";

import { useSettings } from "@/game/settings";
import { type Cue, play } from "@/game/sound";
import type { TimedStep, Timeline } from "./fx";
import { outcomeOf } from "./kit";

/** 연출 하나에 맞춰 낼 소리(소리, 그 연출 안에서 몇 ms 뒤) */
function cuesOfStep(step: TimedStep): [Cue, number][] {
  switch (step.kind) {
    case "dice":
      return [["galaxyDice", 0]];
    case "move": {
      if (step.jump) return [["galaxyTick", step.dur * 0.8]];
      const hop = step.dur / step.path.length;
      return step.path.map((_, i) => ["galaxyTick", hop * (i + 1) - 20]);
    }
    case "pay":
      if (step.reason === "salary" || step.reason === "observatory")
        return [["galaxySalary", 0]];
      if (step.reason === "rent") return [["galaxyRent", 0]];
      return step.flows.some((f) => f.from === BANK)
        ? [["galaxySalary", 0]]
        : [["galaxyRent", 0]];
    case "buy":
      return [["galaxyBuy", 0]];
    case "card":
    case "season":
    case "meteor":
      return [["galaxyNotice", 0]];
    case "request":
      return [[step.done ? "galaxyComplete" : "galaxyNotice", 0]];
    case "link":
      return [[step.owned >= step.size ? "galaxyComplete" : "galaxyLink", 0]];
    case "jail":
      return [["galaxyAsteroid", 0]];
    case "auction":
      return [["galaxyBid", 0]];
    case "build":
      return [["pickCard", 0]];
    case "trade":
      return [[step.accepted ? "galaxyLink" : "pass", 0]];
    case "bankrupt":
      return [["galaxyAsteroid", 0]];
  }
}

/** 연출이 없을 때(움직임 줄이기) 이 사건 묶음에서 낼 가장 큰 소리 하나 */
function strongestCue(events: readonly GameEvent[]): Cue | null {
  const order: [GameEvent["type"], Cue, ((e: GameEvent) => boolean)?][] = [
    [
      "linked",
      "galaxyComplete",
      (e) => e.type === "linked" && e.owned >= e.size,
    ],
    ["linked", "galaxyLink"],
    ["auctionEnded", "galaxyBid"],
    ["jailed", "galaxyAsteroid"],
    ["card", "galaxyNotice"],
    ["meteorShower", "galaxyNotice"],
    ["bought", "galaxyBuy"],
    ["pay", "galaxyRent", (e) => e.type === "pay" && e.reason === "rent"],
    ["dice", "galaxyDice"],
  ];
  for (const [type, cue, test] of order)
    if (events.some((e) => e.type === type && (!test || test(e)))) return cue;
  return null;
}

/**
 * 사건에 맞춰 소리를 낸다(docs/48 9절). 연출이 있으면 그 연출이 보이는 순간에 맞춰, 없으면 한 번에 하나만.
 * 이김·짐·판 끝은 공통 소리
 */
export function galaxyCuesFor(
  events: readonly GameEvent[],
  view: GalaxyView,
  timeline: Timeline,
): void {
  if (!useSettings.getState().sound) return;
  if (timeline.steps.length > 0)
    for (const step of timeline.steps)
      for (const [cue, offset] of cuesOfStep(step))
        play(cue, { delay: Math.max(0, step.at + offset) / 1000 });
  else {
    const cue = strongestCue(events);
    if (cue) play(cue);
  }
  const ended = events.find((e) => e.type === "gameEnded");
  if (ended?.type === "gameEnded") {
    const outcome = outcomeOf(ended.result, view.mySeat);
    play(outcome === "win" ? "win" : outcome === "loss" ? "lose" : "roundEnd", {
      delay: timeline.total / 1000,
    });
  }
}
