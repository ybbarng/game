/**
 * 화투 카드 표 약속(`HwatuFairSpec`, `kit.cardTable`)을 암호 없이 따라가며 판을 두는 시험 도구.
 *
 * 멘탈 포커 방에서 카드가 움직이는 진행(섞기·열쇠·더미 요청)은 fair-play `HwatuHostTable`·`HwatuGuestSeat`가
 * 함께 돌리고, 게임은 약속만 넘긴다. 공통 진행은 진짜 암호로 공통 시험이 본다(`hwatu/fair-room-*.test.ts`,
 * `hwatu/nyrongppong-reload.test.ts`, `gostop/fair-room.test.ts`). 이 도구는 약속 쪽만 본다: 섞기·열쇠 대신
 * 이 도구가 진짜 패를 알고, 자리마다 무엇을 아는지(내 손패, 모두에게 연 카드, 내가 가져온 카드)를 장부로 들고
 * 방장 진행과 같은 차례로 카드를 연다. 그래서 한 판이 ms 단위로 끝난다.
 *
 * 걸음마다 확인하는 것(어기면 바로 던진다)
 * - 방장 엔진 상태에는 모두에게 열린 카드만 진짜 카드다(나머지는 자리 표)
 * - 자리마다 받은 화면(자리 표)을 그 자리가 아는 카드로 바꾸면 모르는 자리 표가 남지 않는다
 * - 손패에서 보일 카드(`revealsOf`)는 그 자리 손패에 있고, 낸다고 한 카드(`claimedOf`)는 연 카드다
 * - 모두에게 연 카드는 그 걸음 뒤 모든 자리 화면에 보인다(남의 손패를 괜히 열지 않는다)
 * - 더미는 앞에서부터 차례로 열고, 모두에게 여는 더미는 `deckGuard`를 지킨다
 * 판 끝에 확인하는 것
 * - 진짜 패로 다시 돌리면(`checkHwatuReplay`, 연 더미 자리까지) 맞고, 자리마다 받은 화면이 다시 계산한 화면과 같다
 * - 복기(`replayArchive`)가 진짜 패로 게임 끝까지 돈다
 */

import {
  checkHwatuReplay,
  HWATU_CARDS,
  type HwatuFairSpec,
  type HwatuLogged,
  hwatuLayout,
  slotOfToken,
  swapTokens,
  tokenOf,
} from "@game/fair-play";
import { monthOf, type PresetDeal } from "@game/hwatu";

import type { GameKit, KitBot } from "@/game/kit";
import { replayArchive } from "@/review/replay";

/** fair-play 카드 번호표의 카드(자리 → 카드 장부는 글로 들고 바꿀 때만 이 모양으로 넘긴다) */
type Card = (typeof HWATU_CARDS)[number];
const asCards = (m: Map<number, string>) =>
  m as unknown as ReadonlyMap<number, Card>;

/** 모두에게 연 자리 */
const PUBLIC = -1;

// biome-ignore lint/suspicious/noExplicitAny: 게임마다 모양이 다르다
type AnyKit = GameKit<any, any, any, any, any, any>;
// biome-ignore lint/suspicious/noExplicitAny: 게임마다 모양이 다르다
type AnySpec = HwatuFairSpec<any, any, any, any, any>;
// biome-ignore lint/suspicious/noExplicitAny: 게임마다 모양이 다르다
type AnyView = any;

/** 카드 하나가 열린 일: 모두에게(`to: -1`) 또는 그 자리에게 */
export interface SimOpen {
  card: string;
  slot: number;
  to: number;
  why: "floor" | "play" | "deck" | "chongtong" | "all";
}

/** 기록 한 걸음 */
export interface SimStep {
  index: number;
  seat: number;
  action: unknown;
  round: number;
  /** 이 걸음 앞에서 연 카드 */
  opened: SimOpen[];
  /** 걸음 뒤 방장 엔진 상태(자리 표) */
  state: unknown;
  events: unknown[];
  /** 걸음 뒤 자리마다 받은 화면(그 자리가 아는 카드로 바꾸고 다시 계산한 것) */
  views: AnyView[];
}

export interface SimResult {
  steps: SimStep[];
  /** 판 → 진짜 패 */
  deals: Map<number, { preset: PresetDeal }>;
  /** 판 시작 때 연 카드(바닥·총통) */
  dealt: Map<number, SimOpen[]>;
  log: HwatuLogged[];
  /** 처음 상태(자리 표) */
  initial: unknown;
  final: unknown;
  rounds: number;
}

interface RoundCtx {
  round: number;
  attempt: number;
  layout: ReturnType<typeof hwatuLayout>;
  /** 자리 → 진짜 카드 */
  cards: Map<number, string>;
  /** 자리 → 누가 아나(PUBLIC이면 모두) */
  audience: Map<number, number>;
  deckNext: number;
  requests: { slot: number; to: number }[];
  allRevealed: boolean;
  opened: SimOpen[];
}

/** 같은 달 넉 장이 있는 달 */
function fourMonth(cards: readonly string[]): number | null {
  const count = new Map<number, number>();
  for (const id of cards)
    count.set(monthOf(id), (count.get(monthOf(id)) ?? 0) + 1);
  for (const [m, n] of count) if (n >= 4) return m;
  return null;
}

/** 시드로 정해지는 섞기(같은 시드면 같은 패) */
function shuffled(seed: number): string[] {
  const deck = [...HWATU_CARDS] as string[];
  let s = seed >>> 0 || 1;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [deck[i], deck[j]] = [deck[j] as string, deck[i] as string];
  }
  return deck;
}

function fail(message: string, detail?: unknown): never {
  throw new Error(
    detail === undefined
      ? message
      : `${message}: ${JSON.stringify(detail).slice(0, 600)}`,
  );
}

/**
 * 약속대로 게임 끝까지(또는 `until`이 참일 때까지) 둔다. 자리마다 따로 기기라고 본다(가장 엄격한 경우:
 * 방장 기기 자리끼리도 서로의 손패를 모른다). 모든 자리를 `bot`이 두고, 둘 사람이 없으면 시간 끝(`kit.timing`)을 넣는다
 */
export function simulateCardTable(options: {
  kit: AnyKit;
  rules: unknown;
  seed: number;
  // biome-ignore lint/suspicious/noExplicitAny: 게임마다 모양이 다르다
  bot: KitBot<any, any>;
  /** 섞기 시드(없으면 `seed`). 판마다 판 번호·다시 섞은 횟수를 더해 섞는다 */
  deckSeed?: number;
  /** 약속을 바꿔 보는 시험용(없으면 `kit.cardTable`) */
  spec?: AnySpec;
  /** 걸음마다 부른다 */
  check?: (step: SimStep) => void;
  /** 참이면 그 걸음에서 멈춘다(게임 끝 확인은 끝난 판까지만) */
  until?: (state: unknown) => boolean;
  maxSteps?: number;
}): SimResult {
  const { kit, rules, seed } = options;
  const spec = (options.spec ?? kit.cardTable) as AnySpec;
  if (!spec || "kind" in spec) fail("화투 카드 표 약속이 아니다");
  const players = spec.players(rules);
  const seats = Array.from({ length: players }, (_, s) => s);
  const rounds = new Map<number, RoundCtx>();
  const deals = new Map<number, { preset: PresetDeal }>();
  const dealt = new Map<number, SimOpen[]>();

  const known = (round: number, seat: number): Map<number, string> => {
    const ctx = rounds.get(round);
    const out = new Map<number, string>();
    if (!ctx) return out;
    for (const [slot, to] of ctx.audience)
      if (to === PUBLIC || to === seat || ctx.allRevealed)
        out.set(slot, ctx.cards.get(slot) as string);
    return out;
  };
  const publicCards = (round: number): Map<number, string> => {
    const ctx = rounds.get(round);
    const out = new Map<number, string>();
    if (!ctx) return out;
    for (const [slot, to] of ctx.audience)
      if (to === PUBLIC || ctx.allRevealed)
        out.set(slot, ctx.cards.get(slot) as string);
    return out;
  };
  const open = (
    ctx: RoundCtx,
    slot: number,
    to: number,
    why: SimOpen["why"],
  ) => {
    const before = ctx.audience.get(slot);
    if (before === PUBLIC || (before !== undefined && before === to)) return;
    ctx.audience.set(slot, to);
    ctx.opened.push({ card: ctx.cards.get(slot) as string, slot, to, why });
  };

  /** 판을 섞고 나눈다: 손패는 그 자리, 바닥은 모두. 바닥에 넉 장이면 다시 섞고, 총통이면 그 넉 장을 보인다 */
  const beginRound = (round: number): void => {
    if (rounds.has(round)) return;
    const shape = spec.layout(rules, seed, round);
    const layout = hwatuLayout(shape.hands, shape.floor);
    for (let attempt = 0; ; attempt++) {
      const order = shuffled(
        (options.deckSeed ?? seed) * 131 + round * 17 + attempt,
      );
      const ctx: RoundCtx = {
        round,
        attempt,
        layout,
        cards: new Map(order.map((c, slot) => [slot, c])),
        audience: new Map(),
        deckNext: 0,
        requests: [],
        allRevealed: false,
        opened: [],
      };
      layout.hands.forEach((slots, seat) => {
        for (const slot of slots) ctx.audience.set(slot, seat);
      });
      for (const slot of layout.floor) open(ctx, slot, PUBLIC, "floor");
      const floor = layout.floor.map((s) => ctx.cards.get(s) as string);
      if (spec.redealOnFour && fourMonth(floor) !== null) continue;
      if (spec.chongtong)
        for (const slots of layout.hands) {
          const month = fourMonth(slots.map((s) => ctx.cards.get(s) as string));
          if (month === null) continue;
          for (const s of slots)
            if (monthOf(ctx.cards.get(s) as string) === month)
              open(ctx, s, PUBLIC, "chongtong");
        }
      rounds.set(round, ctx);
      const card = (slot: number) => ctx.cards.get(slot) as string;
      deals.set(round, {
        preset: {
          hands: layout.hands.map((s) => s.map(card)),
          floor: layout.floor.map(card),
          deck: layout.deck.map(card),
          redeals: attempt,
        },
      });
      dealt.set(round, [...ctx.opened]);
      ctx.opened = [];
      return;
    }
  };
  /** 엔진에 넣는 패: 모두에게 열린 카드만 진짜, 나머지는 자리 표 */
  const presetFor = (round: number): PresetDeal => {
    const ctx = rounds.get(round) as RoundCtx;
    const pub = publicCards(round);
    const card = (slot: number) => pub.get(slot) ?? tokenOf(slot);
    return {
      hands: ctx.layout.hands.map((s) => s.map(card)),
      floor: ctx.layout.floor.map(card),
      deck: ctx.layout.deck.map(card),
      redeals: ctx.attempt,
    };
  };
  /** 아직 섞지 않은 다음 판 자리(미리 돌려 보기에서 판이 바뀌는지만 본다) */
  const dummyPreset = (round: number): PresetDeal => {
    const shape = spec.layout(rules, seed, round);
    const l = hwatuLayout(shape.hands, shape.floor);
    return {
      hands: l.hands.map((s) => s.map(tokenOf)),
      floor: l.floor.map(tokenOf),
      deck: l.deck.map(tokenOf),
    };
  };
  const opened = (state: unknown) =>
    swapTokens(state, asCards(publicCards(spec.roundOf(state)))).value;

  beginRound(1);
  let state = spec.createMatch(rules, seed, presetFor(1)).state;
  const initial = state;
  const log: HwatuLogged[] = [];
  const steps: SimStep[] = [];
  const lastToken: AnyView[] = [];
  const ended = new Set<number>();
  /** 판이 끝나면 모두 열고(판 끝 확인), 게임이 이어지면 다음 판을 섞는다 */
  const roundEnded = (s: unknown) => {
    const round = spec.roundOf(s);
    if (!spec.roundOver(s) || ended.has(round)) return;
    ended.add(round);
    (rounds.get(round) as RoundCtx).allRevealed = true;
    if (!spec.gameOver(s)) beginRound(round + 1);
  };
  // 첫 판이 시작하자마자 끝날 수 있다(총통)
  roundEnded(state);

  const viewsOf = (s: unknown): AnyView[] =>
    seats.map((seat) => {
      const raw = spec.viewOf(s, seat);
      lastToken[seat] = raw;
      const swapped = swapTokens(raw, asCards(known(spec.roundOf(s), seat)));
      if (swapped.missing > 0)
        fail(`${seat}번 자리 화면에 그 자리가 모르는 카드가 있다`, raw);
      return spec.refreshView(swapped.value);
    });

  /** 방장 엔진 상태에 아직 모두에게 열리지 않은 카드가 있으면 던진다 */
  const expectHidden = (s: unknown) => {
    const round = spec.roundOf(s);
    const ctx = rounds.get(round);
    if (!ctx || ctx.allRevealed || spec.roundOver(s)) return;
    const pub = new Set(publicCards(round).values());
    const text = JSON.stringify(s);
    const leaked = (HWATU_CARDS as readonly string[]).filter(
      (c) => !pub.has(c) && text.includes(`"${c}"`),
    );
    if (leaked.length > 0)
      fail("방장 엔진 상태에 모두에게 열리지 않은 카드가 있다", leaked);
  };

  /**
   * 이 걸음에 모두에게 연 카드는 걸음 뒤 모든 자리 화면에 보여야 한다. 판 끝에 모두 연 것과 총통으로 보인 넉 장은
   * 화면이 아니라 판 끝 계산·엔진 판정에 쓰여 뺀다(총통은 게임 시험이 따로 본다)
   */
  const expectShown = (opens: readonly SimOpen[], views: AnyView[]) => {
    for (const o of opens) {
      if (o.to !== PUBLIC || o.why === "all" || o.why === "chongtong") continue;
      for (const [seat, view] of views.entries())
        if (!JSON.stringify(view).includes(`"${o.card}"`))
          fail(
            `모두에게 연 ${o.card}가 ${seat}번 자리 화면에 없다(보일 일이 없는 카드를 열었다)`,
            view,
          );
    }
  };

  let views = viewsOf(state);
  expectHidden(state);
  expectShown(dealt.get(1) ?? [], views);
  let rng = 1;
  const max = options.maxSteps ?? 5000;

  /** 방장 진행의 `prepare`: 보일 카드를 열고, 엔진을 미리 돌려 더미를 몇 장 쓰는지 보고 연다 */
  const prepare = (seat: number, action: unknown, view: AnyView): unknown => {
    const round = spec.roundOf(state);
    const ctx = rounds.get(round) as RoundCtx;
    const hand = spec.viewOf(state, seat).hand as string[];
    const slots: number[] = [];
    for (const card of spec.revealsOf(action, view)) {
      if (hand.includes(card)) continue;
      const slot = hand
        .map((t) => slotOfToken(t))
        .find((s) => s !== null && ctx.cards.get(s) === card);
      if (slot === undefined || slot === null)
        fail(
          `${seat}번 자리가 보일 카드 ${card}가 그 자리 손패에 없다`,
          action,
        );
      slots.push(slot);
    }
    for (const s of slots) open(ctx, s, PUBLIC, "play");
    const knownNow = new Set([
      ...slots.map((s) => ctx.cards.get(s) as string),
      ...hand,
    ]);
    for (const c of spec.claimedOf(action))
      if (!knownNow.has(c))
        fail(`낸다고 한 카드 ${c}를 열지 않았다(revealsOf가 빠뜨렸다)`, action);
    const out =
      slots.length > 0 ? { ...(action as object), fairSlots: slots } : action;
    for (let guard = 0; guard < 8; guard++) {
      const current = opened(state);
      const r = spec.roundOf(current);
      const next = rounds.has(r + 1) ? presetFor(r + 1) : null;
      const dry = spec.step(
        spec.withPreset(current, next ?? dummyPreset(r + 1)),
        seat,
        out,
      );
      if (!dry.ok) fail(`엔진이 받지 않는다(${dry.error})`, out);
      if (spec.roundOf(dry.state) !== r) {
        if (next) break;
        beginRound(r + 1);
        continue;
      }
      const deck = spec.deckOf(current);
      const consumed = deck.length - spec.deckOf(dry.state).length;
      let fresh = false;
      if (consumed > 0) {
        const usedBefore = ctx.layout.deck.length - deck.length;
        for (const [k, use] of spec.deckUses(dry.events, consumed).entries()) {
          const index = usedBefore + k;
          if (index < ctx.deckNext) continue;
          if (index !== ctx.deckNext) fail("더미를 순서와 다르게 연다");
          const slot = ctx.layout.deck[index] as number;
          const to = use === null ? PUBLIC : use;
          if (to === PUBLIC && spec.deckGuard)
            for (const s of seats) {
              const v = lastToken[s];
              const turn = (v as { turn?: unknown })?.turn;
              if (typeof turn !== "number") continue;
              const text = JSON.stringify(v);
              const freshCards = (ctx.layout.hands[turn] ?? [])
                .filter((h) => ctx.audience.get(h) === PUBLIC)
                .map((h) => ctx.cards.get(h) as string)
                .filter((c) => !text.includes(`"${c}"`));
              if (!spec.deckGuard(v, freshCards))
                fail(
                  `${s}번 자리가 이 더미 열기를 미리 보기로 본다(deckGuard)`,
                );
            }
          ctx.deckNext += 1;
          ctx.requests.push({ slot, to });
          if (to === PUBLIC) fresh = true;
          open(ctx, slot, to, "deck");
        }
        if (fresh) continue;
      }
      if (
        spec.revealBeforeEnd &&
        spec.roundOver(dry.state) &&
        !ctx.allRevealed
      ) {
        ctx.allRevealed = true;
        for (const slot of ctx.cards.keys())
          if (ctx.audience.get(slot) !== PUBLIC)
            ctx.opened.push({
              card: ctx.cards.get(slot) as string,
              slot,
              to: PUBLIC,
              why: "all",
            });
        continue;
      }
      break;
    }
    return out;
  };

  while (!spec.gameOver(state)) {
    if (options.until?.(state)) break;
    if (log.length >= max) fail("판이 끝나지 않는다");
    let pick: { seat: number; action: unknown } | null = null;
    for (const seat of spec.pendingSeats(state)) {
      const view = views[seat];
      if (!view?.decision) continue;
      const decided = options.bot.decide(view, { seed: rng++ } as never);
      pick = {
        seat,
        action: kit.timing ? kit.timing.stamp(decided, 0) : decided,
      };
      break;
    }
    if (!pick) {
      const turn = kit.timing?.turn(state);
      if (!turn || !kit.timing) fail("둘 사람이 없는데 판이 멈췄다", state);
      pick = { seat: turn.seat, action: kit.timing.timeout(turn.left + 1) };
    }
    const round = spec.roundOf(state);
    const ctx = rounds.get(round) as RoundCtx;
    const action = prepare(pick.seat, pick.action, views[pick.seat]);
    // 방장 진행의 `step`: 열린 카드를 넣고, 다음 판을 시작하는 걸음이면 다음 판 패를 넣는다
    const input = spec.withPreset(
      opened(state),
      rounds.has(round + 1) ? presetFor(round + 1) : null,
    );
    const result = spec.step(input, pick.seat, action);
    if (!result.ok) fail(`엔진이 받지 않는다(${result.error})`, action);
    state = spec.withPreset(result.state, null);
    log.push({ seat: pick.seat, action });
    const opens = [...ctx.opened];
    ctx.opened = [];
    roundEnded(state);
    views = viewsOf(state);
    expectHidden(state);
    // 판을 넘기는 걸음이면 앞 판에서 연 카드는 새 판 화면에 없다(판 끝에 모두 연다). 새 판 바닥을 본다
    const now = spec.roundOf(state);
    if (now === round) expectShown(opens, views);
    else expectShown(dealt.get(now) ?? [], views);
    const info: SimStep = {
      index: log.length - 1,
      seat: pick.seat,
      action,
      round,
      opened: opens,
      state,
      events: result.events,
      views,
    };
    steps.push(info);
    options.check?.(info);
  }

  const result = (): SimResult => ({
    steps,
    deals,
    dealt,
    log,
    initial,
    final: state,
    rounds: rounds.size,
  });
  // 판 끝 확인: 끝난 판의 진짜 패로 다시 돌린다(연 더미 자리까지)
  const finished = new Map(
    [...deals].filter(([r]) => rounds.get(r)?.allRevealed),
  );
  const checked = checkHwatuReplay(spec, rules, seed, log, finished, {
    of: (r) => rounds.get(r)?.requests ?? [],
    deviceOf: (seat) => seat,
  });
  if (finished.size === 0) return result();
  if (!checked.ok) fail(`진짜 패로 다시 돌리니 틀렸다: ${checked.reason}`);
  // 자리마다 받은 화면이 진짜 패로 다시 계산한 화면과 같다(참가자 판 끝 검증이 보는 것)
  for (const [i, real] of checked.states.entries()) {
    const step = steps[i - 1];
    if (i === 0 || !step) continue;
    for (const seat of seats) {
      const want = JSON.stringify(spec.refreshView(spec.viewOf(real, seat)));
      if (JSON.stringify(step.views[seat]) !== want)
        fail(
          `${i}번째 걸음 ${seat}번 자리 화면이 진짜 패로 다시 계산한 것과 다르다`,
        );
    }
  }
  if (spec.gameOver(state)) {
    const replayed = replayArchive(kit, {
      id: "sim",
      game: kit.id,
      mode: "online",
      startedAt: 0,
      updatedAt: 0,
      rules,
      seed,
      deals: Object.fromEntries(deals),
      log,
      seat: 0,
      seatNames: null,
      rounds: rounds.size,
      over: true,
    } as never);
    if (replayed.error) fail(`복기가 돌지 않는다: ${replayed.error}`);
    if (!spec.gameOver(replayed.states.at(-1)))
      fail("복기가 게임 끝까지 가지 않는다");
  }
  return result();
}
