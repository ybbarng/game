import { derivedSeed } from "@game/yut-engine";
import { describe, expect, it } from "vitest";

import { STAR_SQUARES } from "./board";
import { createMatch } from "./match";
import {
  activeRequests,
  REQUEST_CARDS,
  requestCommitment,
  requestCommitOf,
  requestDone,
  requestOf,
  requestProgress,
  requestSecretOf,
} from "./requests";
import { STANDARD_RULES } from "./rules";
import type { GalaxyState } from "./state";
import {
  BOARD,
  chainAction,
  must,
  paysOf,
  refused,
  roll,
  scene,
} from "./test-utils";

const TWO = { ...STANDARD_RULES, players: 2 as const };
const secretOf = (state: GalaxyState, seat: number) =>
  requestSecretOf(derivedSeed(state.keys[seat] as string, 0));

describe("관측 의뢰: 약속(판 처음)", () => {
  it("의뢰를 켠 판은 첫 사슬 약속에 의뢰 약속을 함께 내야 하고, 끈 판은 없어도 된다", () => {
    const { state } = createMatch(STANDARD_RULES, 3, BOARD);
    const plain = chainAction(state, 0);
    if (plain.type !== "commit") throw new Error("약속이 아니다");
    expect(refused(state, 0, { type: "commit", hash: plain.hash })).toContain(
      "관측 의뢰",
    );
    const next = must(state, 0, plain).state;
    expect(next.requests?.commits[0]).toBe(
      requestCommitOf(0, derivedSeed(state.keys[0] as string, 0)),
    );
    const off = createMatch({ ...STANDARD_RULES, requests: false }, 3, BOARD);
    expect(off.state.requests).toBeNull();
    expect(
      must(off.state, 0, { type: "commit", hash: plain.hash }).state.phase,
    ).toBe("commit");
  });

  it("첫 공개의 해시가 닻이 되고, 다시 바뀌지 않는다", () => {
    let { state } = createMatch(TWO, 3, BOARD);
    for (const s of [0, 1]) state = must(state, s, chainAction(state, s)).state;
    expect(state.requests?.anchor).toBeNull();
    state = must(state, state.turn.seat, { type: "roll" }).state;
    for (const s of [0, 1]) state = must(state, s, chainAction(state, s)).state;
    const anchor = state.requests?.anchor;
    expect(anchor).toMatch(/^[0-9a-f]{64}$/);
    expect(state.revealCount).toBe(1);
  });
});

describe("관측 의뢰: 뽑기", () => {
  it("의뢰는 비밀과 닻으로만 정해지고, 판에 해당 별이 넉넉한 의뢰만 나온다", () => {
    const active = activeRequests(BOARD);
    expect(active.length).toBeGreaterThan(5);
    const anchor = "a".repeat(64);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const secret = requestSecretOf(`seed-${i}`);
      const card = requestOf(BOARD, secret, anchor);
      expect(requestOf(BOARD, secret, anchor)).toBe(card);
      expect(active).toContain(card);
      seen.add(card);
    }
    // 200번이면 이 판의 의뢰가 모두 한 번은 나온다(결정적인 씨앗)
    expect(seen.size).toBe(active.length);
    // 약속에 자리 번호가 들어가 남의 약속을 베껴 낼 수 없다
    const secret = requestSecretOf("x");
    expect(requestCommitment(0, secret)).not.toBe(requestCommitment(1, secret));
  });

  it("이룬 정도: 별 사실은 가진 별 수, 계절은 가장 많이 모은 그 계절 별자리, 넓은 순찰은 별자리 수", () => {
    const all = scene({
      stars: STAR_SQUARES.map((square) => ({ square, owner: 0 })),
    });
    for (const card of REQUEST_CARDS) {
      expect(requestDone(all, 0, card.id), card.title).toBe(true);
      expect(requestDone(all, 1, card.id)).toBe(false);
    }
    const winter = REQUEST_CARDS.find((c) => c.title === "겨울 하늘 지도");
    const ori = BOARD.groups.find((g) => g.id === "Ori");
    if (!winter || !ori) throw new Error("겨울 의뢰·오리온이 없다");
    const two = scene({
      stars: ori.squares.slice(0, 2).map((square) => ({ square, owner: 0 })),
    });
    expect(requestProgress(two, 0, winter.id)).toEqual({ have: 2, need: 3 });
  });
});

/** 2인 기본 판 마지막 돌림: 두 사람이 한 번씩 굴리고 마치면 판이 끝난다. 0번은 별을 모두 가졌다 */
function lastRound(): GalaxyState {
  const base = scene({
    rules: TWO,
    round: 36,
    stars: STAR_SQUARES.map((square) => ({ square, owner: 0 })),
  });
  const requests = base.requests;
  if (!requests) throw new Error("의뢰가 없다");
  return {
    ...base,
    requests: {
      ...requests,
      commits: [0, 1].map((s) => requestCommitment(s, secretOf(base, s))),
      anchor: "b".repeat(64),
    },
  };
}

describe("관측 의뢰: 판 끝에 펼치기", () => {
  it("차례 수를 마치면 의뢰를 펼치는 단계로 가고, 모두 펼치면 이룬 사람에게 지원금을 주고 끝낸다", () => {
    let s = lastRound();
    for (const seat of [0, 1]) {
      s = roll(s, [2, 6]).state; // 소행성대 칸(들르기)
      expect(s.turn.seat).toBe(seat);
      s = must(s, seat, { type: "end" }).state;
    }
    expect(s.phase).toBe("requestReveal");
    expect(s.result).toBeNull();
    // 다른 비밀·남의 비밀은 받지 않는다
    expect(
      refused(s, 0, { type: "requestReveal", secret: secretOf(s, 1) }),
    ).toContain("약속한 의뢰");
    const cashBefore = [...s.cash];
    const first = must(s, 0, chainAction(s, 0));
    expect(first.events).toEqual([
      {
        type: "requestRevealed",
        seat: 0,
        card: requestOf(BOARD, secretOf(s, 0), "b".repeat(64)),
        done: true,
      },
    ]);
    expect(refused(first.state, 0, chainAction(first.state, 0))).toContain(
      "이미",
    );
    const last = must(first.state, 1, chainAction(first.state, 1));
    expect(paysOf(last.events)).toEqual([
      { type: "pay", from: -1, to: 0, amount: 150, reason: "request" },
    ]);
    expect(last.state.cash[0]).toBe((cashBefore[0] ?? 0) + 150);
    expect(last.state.phase).toBe("gameOver");
    expect(last.state.result?.kind).toBe("turns");
    expect(last.state.requests?.reveals[1]?.done).toBe(false);
  });

  it("펼치기를 기다리던 한 사람을 더 기다리지 않으면 그 사람이 진다", () => {
    let s = lastRound();
    for (const seat of [0, 1]) {
      s = roll(s, [2, 6]).state;
      s = must(s, seat, { type: "end" }).state;
    }
    s = must(s, 0, chainAction(s, 0)).state;
    const retired = must(s, 0, { type: "retire" }).state;
    expect(retired.result?.kind).toBe("forfeit");
    expect(retired.result?.seat).toBe(1);
  });

  it("기권은 의뢰를 펼치지 않고 바로 끝난다", () => {
    const s = must(lastRound(), 1, { type: "resign" }).state;
    expect(s.phase).toBe("gameOver");
    expect(s.result?.kind).toBe("resign");
  });
});
