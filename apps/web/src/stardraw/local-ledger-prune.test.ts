// @vitest-environment node
import { ManualClock } from "@game/fair-play";
import {
  DEFAULT_WEBAUTHN_POLICY,
  type EntrantSigner,
  generateSigner,
  makeRegistration,
  makeTicket,
  softCredentialId,
  softPasskeySigner,
  type Ticket,
  ticketId,
  toHex,
} from "@game/stardraw-core";
import { describe, expect, it } from "vitest";

import {
  type LedgerStore,
  LocalLedger,
  type LocalLedgerOptions,
  PRACTICE_POW,
} from "./local-ledger";

/**
 * 오래된 회차 지우기(2026-11-01 메모리 점검: 지우지 않아 회차마다 저장이 약 14KB씩 늘어 약 15일이면 한도에 닿았다).
 * 연습 참가자를 줄이고 남길 회차를 작게 해 같은 규칙을 빠르게 본다
 */

const START = 1793253300;
const HOUR = 3600;
/** 시험의 남길 회차 수 */
const KEEP = 3;
/**
 * 쌓을 회차 수. 회차마다 같은 몫만 느는지는 비율로 보므로 실제 한도(약 15일)까지 쌓지 않아도 된다.
 * 회차가 늘수록 저장·검사가 길어져(회차마다 장부 전체를 다시 저장) 150회차로 본다(예전 400회차)
 */
const ROUNDS = 150;
/** 회차마다 느는 몫을 재는 구간(둘 다 지운 회차) */
const EARLY = 43;
const LATE = 143;

const passkey = async () => softPasskeySigner(await generateSigner());

function memoryStore(): LedgerStore & { text: string | null } {
  return {
    text: null,
    load() {
      return this.text;
    },
    save(t) {
      this.text = t;
    },
  };
}

function seeded() {
  let seed = 1;
  return (n: number) =>
    Uint8Array.from({ length: n }, () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed & 255;
    });
}

function open(
  clock: ManualClock,
  store: LedgerStore,
  more: Partial<LocalLedgerOptions> = {},
) {
  return new LocalLedger({
    clock,
    store,
    policy: DEFAULT_WEBAUTHN_POLICY,
    random: seeded(),
    bots: 1,
    keepRounds: KEEP,
    ...more,
  });
}

function startClock() {
  const clock = new ManualClock();
  clock.advance(START * 1000);
  return clock;
}

async function enter(
  ledger: LocalLedger,
  signer: EntrantSigner,
  numbers: number[],
  register: boolean,
): Promise<Ticket> {
  const round = ledger.status().round;
  const entry = ledger.schedule.entries[0];
  if (!entry) throw new Error("일정표가 비었다");
  const challenge = ledger.head();
  const ticket = await makeTicket(
    signer,
    round,
    numbers,
    challenge,
    entry.powTarget,
    { params: PRACTICE_POW },
  );
  const reg = register
    ? await makeRegistration(
        signer,
        softCredentialId(signer.publicKey),
        challenge,
        entry.registerPowTarget,
        { params: PRACTICE_POW },
      )
    : undefined;
  if (!ticket || reg === null) throw new Error("예측서를 만들지 못했다");
  await ledger.submit(ticket, reg);
  return ticket;
}

/**
 * 시계를 n회차 뒤 추첨까지 흘리고 추첨한다. 연습 참가자는 지금 회차에서 3회차 앞까지만 응모하니(오래 비운 뒤 따라잡기),
 * 한 번에 많이 흘리면 그 앞 회차는 비어 닫힌다
 */
async function nextDraw(clock: ManualClock, ledger: LocalLedger, n = 1) {
  const before = ledger.closed().length;
  const at = ledger.status().nextDrawAt + (n - 1) * HOUR;
  clock.advance((at + 1 - ledger.now()) * 1000);
  await ledger.settle();
  expect(ledger.closed().length).toBe(before + n);
}

/** 저장한 장부에서 회차 하나가 차지하는 글자 수(기록·응모권·등록·지운 회차 몫) */
function roundChars(text: string | null, round: number): number {
  const saved = JSON.parse(text ?? "{}");
  const i = round - 1;
  const light = (saved.light ?? []).find(
    (l: { round: number }) => l.round === round,
  );
  return (
    JSON.stringify(saved.records[i]).length +
    JSON.stringify(saved.tickets[i]).length +
    JSON.stringify(saved.registrations[i]).length +
    (light ? JSON.stringify(light).length : 0)
  );
}

describe("연습 장부: 오래된 회차 지우기", () => {
  it("회차가 쌓여도 저장 크기는 남길 회차 몫과 회차마다 작은 몫만 는다", async () => {
    const clock = startClock();
    const store = memoryStore();
    const ledger = open(clock, store);
    const me = await passkey();
    // 1회차는 1등이 되게 미리 본 당첨 번호로
    const first = await enter(ledger, me, ledger.peekDraw(1).numbers, true);
    await nextDraw(clock, ledger);
    await nextDraw(clock, ledger);
    const third = await enter(ledger, me, [1, 2, 3, 4, 5, 6], false);
    await nextDraw(clock, ledger);
    // 연습 참가자가 응모한 회차(지우기 전)의 크기
    const fullChars = roundChars(store.text, 3);
    // ROUNDS회차까지: 10회차씩 흘려 회차마다 쌓이는 크기를 잰다
    const sizes = new Map<number, number>();
    while (ledger.closed().length < ROUNDS) {
      await nextDraw(
        clock,
        ledger,
        Math.min(10, ROUNDS - ledger.closed().length),
      );
      sizes.set(ledger.closed().length, store.text?.length ?? 0);
    }
    expect(ledger.closed()).toHaveLength(ROUNDS);
    expect(ledger.prunedRounds()).toBe(ROUNDS - KEEP);
    // 지운 회차는 응모권·등록을 지워 지우기 전보다 훨씬 작고(회차 3은 내 응모권을 남겼다),
    // 회차 내내 회차마다 같은 작은 몫만 는다
    const lightChars = roundChars(store.text, LATE);
    expect(fullChars).toBeGreaterThan(3 * lightChars);
    const perRound =
      ((sizes.get(LATE) ?? 0) - (sizes.get(EARLY) ?? 0)) / (LATE - EARLY);
    expect(perRound).toBeLessThan(1.5 * lightChars);
    expect(store.text?.length).toBeLessThan(
      KEEP * fullChars + ROUNDS * 1.5 * lightChars,
    );

    // 내 응모권(1등 회차·지운 회차)은 남는다
    const mine = await ledger.keyTickets([me.publicKey]);
    expect(mine.map((t) => t.round)).toEqual([1, 3]);
    expect(ledger.record(1)?.winners[1].map(toHex)).toEqual([
      toHex(ticketId(first)),
    ]);
    expect(await ledger.findTicket(3, toHex(ticketId(third)))).not.toBeNull();
    // 지운 회차에는 연습 참가자 응모권이 없고, 요약은 지우기 전 값이다
    expect(await ledger.roundTickets(2)).toHaveLength(0);
    expect(ledger.closed()[0]?.summary.qualified).toBe(0);
    // 등록한 회차도 그대로
    expect(await ledger.registeredRound(me.publicKey)).toBe(1);

    // 「장부 검사」·「이 회차 확인」: 지운 회차는 남긴 응모권만 포함 증명으로
    const report = await ledger.verify([ticketId(first)]);
    expect(report.problems).toEqual([]);
    expect(report.skipped.some((s) => s.startsWith("1회차: 지운 회차"))).toBe(
      true,
    );
    expect((await ledger.verifyRound(1, [ticketId(first)])).problems).toEqual(
      [],
    );

    // 다시 열어도 같다
    const again = open(clock, store);
    expect(again.prunedRounds()).toBe(ROUNDS - KEEP);
    expect(
      (await again.keyTickets([me.publicKey])).map((t) => t.round),
    ).toEqual([1, 3]);
    expect(again.closed().map((c) => c.summary)).toEqual(
      ledger.closed().map((c) => c.summary),
    );
    expect((await again.verify()).problems).toEqual([]);
  });

  it("지운 회차에 남긴 증명이 기록과 맞지 않으면 검사가 잡는다", async () => {
    const clock = startClock();
    const store = memoryStore();
    const ledger = open(clock, store);
    const me = await passkey();
    await enter(ledger, me, [1, 2, 3, 4, 5, 6], true);
    for (let i = 0; i < KEEP + 1; i++) await nextDraw(clock, ledger);
    expect(ledger.prunedRounds()).toBe(1);
    const saved = JSON.parse(store.text ?? "{}");
    // 남긴 응모권의 증명 경로를 바꿔치기한다
    const proof = saved.light[0].t[0];
    proof.path[0] = "00".repeat(32);
    store.text = JSON.stringify(saved);
    const report = await open(clock, store).verify();
    expect(report.problems.map((p) => [p.round, p.message])).toEqual([
      [1, expect.stringContaining("머클 루트에 들어 있다는 증명이 없다")],
    ]);
  });

  it("판 2 장부는 다음에 열 때 내 것만 남기고 지운다", async () => {
    const clock = startClock();
    const store = memoryStore();
    // 판 2처럼 지우지 않고 쌓는다
    const old = open(clock, store, { keepRounds: 1000 });
    const twice = await passkey();
    const once = await passkey();
    await enter(old, twice, [1, 2, 3, 4, 5, 6], true);
    await enter(old, once, [7, 8, 9, 10, 11, 12], true);
    await nextDraw(clock, old);
    await enter(old, twice, [1, 2, 3, 4, 5, 7], false);
    for (let i = 0; i < KEEP + 2; i++) await nextDraw(clock, old);
    expect(old.prunedRounds()).toBe(0);
    const saved = JSON.parse(store.text ?? "{}");
    saved.v = 2;
    delete saved.own;
    store.text = JSON.stringify(saved);
    const before = store.text.length;

    // 한 번만 응모한 열쇠는 지갑이 알려 준다. 두 회차에 나온 열쇠는 지갑 없이도 내 것으로 본다
    const ledger = open(clock, store, { ownKeys: () => [once.publicKey] });
    expect(ledger.closed()).toHaveLength(KEEP + 3);
    await ledger.settle();
    expect(ledger.prunedRounds()).toBe(3);
    expect(JSON.parse(store.text ?? "{}").v).toBe(3);
    expect(store.text.length).toBeLessThan(before);
    expect(
      (await ledger.keyTickets([twice.publicKey, once.publicKey])).map(
        (t) => t.round,
      ),
    ).toEqual([1, 1, 2]);
    expect(await ledger.roundTickets(1)).toHaveLength(2);
    expect(await ledger.registeredRound(once.publicKey)).toBe(1);
    expect((await ledger.verify()).problems).toEqual([]);
  });

  it("저장이 실패하면 알리고, 다시 성공하기 전까지는 거듭 알리지 않는다", async () => {
    const clock = startClock();
    let full = true;
    let text: string | null = null;
    const errors: unknown[] = [];
    const ledger = open(
      clock,
      {
        load: () => text,
        save: (t) => {
          if (full) throw new DOMException("가득 참", "QuotaExceededError");
          text = t;
        },
      },
      { onSaveError: (err) => errors.push(err) },
    );
    const me = await passkey();
    await enter(ledger, me, [1, 2, 3, 4, 5, 6], true);
    await nextDraw(clock, ledger);
    expect(errors).toHaveLength(1);
    expect((errors[0] as DOMException).name).toBe("QuotaExceededError");
    full = false;
    await nextDraw(clock, ledger);
    expect(text).not.toBeNull();
    full = true;
    await nextDraw(clock, ledger);
    expect(errors).toHaveLength(2);
  });
});
