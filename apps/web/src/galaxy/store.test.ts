import { asState } from "@game/galaxy-ai";
import { debtPlan, SHORT_RULES } from "@game/galaxy-engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGalaxy } from "./store";

/** 내 결정 하나를 한다(굴리기·사기·입찰은 내지 않기·차례 마치기·빚 정리·사들이지 않기). 할 것이 없으면 false */
function actOnce(): boolean {
  const { view, playing, queue } = useGalaxy.getState();
  if (!view?.decision || playing || queue.length > 0) return false;
  const d = view.decision;
  const s = useGalaxy.getState();
  switch (d.kind) {
    case "roll":
      return s.submit({ type: "roll" }).ok;
    case "end":
      return s.submit({ type: "end" }).ok;
    case "buy":
      return s.submit({ type: d.canAfford ? "buy" : "pass" }).ok;
    case "bid":
      return s.placeBid(d.max >= 10 ? 10 : 0).ok;
    case "takeover":
      return s.submit({ type: "declineTakeover" }).ok;
    case "trade":
      return s.submit({ type: "rejectTrade" }).ok;
    case "debt": {
      const plan = debtPlan(asState(view));
      return plan[0] ? s.submit(plan[0]).ok : false;
    }
    default:
      return false;
  }
}

describe("은하 한 바퀴 혼자 하기 진행", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    useGalaxy.getState().leave();
    vi.useRealTimers();
  });

  it("컴퓨터 차례가 저절로 돌고, 내 약속·공개·입찰 공개는 기기가 낸다", () => {
    useGalaxy.getState().newGame({
      rules: { ...SHORT_RULES, players: 3 },
      level: 1,
      seed: 11,
    });
    let mine = 0;
    for (let i = 0; i < 400; i++) {
      vi.runOnlyPendingTimers();
      if (actOnce()) mine += 1;
      const view = useGalaxy.getState().view;
      if (!view || view.phase === "gameOver" || view.round >= 4) break;
    }
    const view = useGalaxy.getState().view;
    expect(view).not.toBeNull();
    // 돌림이 넘어갔다: 컴퓨터 둘이 차례를 마쳤다
    expect(view?.round).toBeGreaterThanOrEqual(3);
    expect(mine).toBeGreaterThan(2);
    // 기록에 컴퓨터의 굴림과 내 공개가 함께 있다
    const log = useGalaxy.getState().local?.save().log ?? [];
    expect(log.some((l) => l.seat !== 0 && l.action.type === "roll")).toBe(
      true,
    );
    expect(log.some((l) => l.seat === 0 && l.action.type === "reveal")).toBe(
      true,
    );
  });

  it("기권하면 판이 끝나고 내가 꼴찌다", () => {
    useGalaxy.getState().newGame({
      rules: { ...SHORT_RULES, players: 2 },
      level: 0,
      seed: 3,
    });
    for (let i = 0; i < 50 && !useGalaxy.getState().view?.decision; i++)
      vi.runOnlyPendingTimers();
    expect(useGalaxy.getState().submit({ type: "resign" }).ok).toBe(true);
    vi.runOnlyPendingTimers();
    const view = useGalaxy.getState().view;
    expect(view?.phase).toBe("gameOver");
    expect(view?.result?.kind).toBe("resign");
    expect(view?.result?.standings.at(-1)?.seat).toBe(0);
  });
});
