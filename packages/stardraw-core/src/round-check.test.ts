import { describe, expect, it } from "vitest";
import { toHex } from "./bytes";
import { type DrandBeacon, drandRandomness, drandRoundForClose } from "./drand";
import { drawNumbers, drawSeed } from "./draw";
import { roundSummary } from "./light";
import { genesisHash, type RoundRecord, recordHash } from "./record";
import { type KeyRegistration, sortRegistrations } from "./registration";
import { closeRound, sealDigest, sortTickets } from "./round";
import { checkRound, type RoundCheckInput } from "./round-check";
import { roundTimes, type Schedule } from "./schedule";
import type { SoftPasskey } from "./signature";
import {
  FakeTsa,
  fakeSignature,
  HOURLY,
  registerKeys,
  signers,
  TEST_POW,
  ticketFor,
} from "./testing";
import type { Ticket } from "./ticket";
import { sealImprint } from "./tsa";

/**
 * 「이 회차 확인」: 기록 사슬과 그 회차 파일·봉인 파일 하나로 확인한다(docs/36 11-30).
 * 2회차 장부, 회차마다 셋(1등·2등·낙첨)이 낸다. drand 서명은 가짜라 확인을 바꿔 끼운다
 */

const beaconFor = (schedule: Schedule, round: number): DrandBeacon => ({
  round: drandRoundForClose(roundTimes(schedule, round).closesAt),
  signature: fakeSignature(round),
});
const loggedAt = (round: number) => roundTimes(HOURLY, round).closesAt + 60;
const tsa = new FakeTsa("tsa-a", () => 0);

interface Built {
  records: RoundRecord[];
  tickets: Ticket[][];
  registrations: KeyRegistration[][];
  people: SoftPasskey[];
}

let built: Promise<Built> | null = null;
function ledger(): Promise<Built> {
  built ??= (async () => {
    const people = await signers(3);
    const records: RoundRecord[] = [];
    const tickets: Ticket[][] = [];
    const registrations: KeyRegistration[][] = [];
    let prev = genesisHash(HOURLY);
    for (let round = 1; round <= 2; round++) {
      const draw = drawNumbers(
        drawSeed(round, drandRandomness(beaconFor(HOURLY, round))),
      );
      const miss = Array.from({ length: 45 }, (_, i) => i + 1).filter(
        (n) => !draw.numbers.includes(n) && n !== draw.bonus,
      );
      const picks = [
        draw.numbers,
        [...draw.numbers.slice(0, 5), draw.bonus],
        miss.slice(0, 6),
      ];
      const list = await Promise.all(
        picks.map((p, i) =>
          ticketFor(people[i] as SoftPasskey, round, p, prev),
        ),
      );
      const regs = round === 1 ? await registerKeys(people, prev) : [];
      const record = closeRound({
        schedule: HOURLY,
        round,
        prev,
        tickets: list,
        registrations: regs,
        rootLoggedAt: loggedAt(round),
        beacon: beaconFor(HOURLY, round),
      });
      records.push(record);
      tickets.push(sortTickets(list));
      registrations.push(sortRegistrations(regs));
      prev = recordHash(record);
    }
    return { records, tickets, registrations, people };
  })();
  return built;
}

function sealOf(record: RoundRecord) {
  const digest = sealDigest(record);
  return {
    digest: toHex(digest),
    loggedAt: record.rootLoggedAt,
    log: {
      kind: "tsa",
      tokens: [
        {
          tsa: "tsa-a",
          genTime: record.rootLoggedAt,
          token: btoa(
            String.fromCharCode(
              ...tsa.stamp(sealImprint(digest), record.rootLoggedAt),
            ),
          ),
        },
      ],
    },
  };
}

async function input(round: number): Promise<RoundCheckInput> {
  const l = await ledger();
  const record = l.records[round - 1] as RoundRecord;
  const tickets = l.tickets[round - 1] as Ticket[];
  return {
    genesis: HOURLY,
    records: l.records,
    round,
    fileRecord: record,
    tickets,
    registrations: l.registrations[round - 1] as KeyRegistration[],
    seal: sealOf(record),
    summary: roundSummary(tickets),
  };
}

const OPTIONS = {
  beaconVerifier: () => true,
  powParams: TEST_POW,
  tsaAuthorities: [tsa.authority],
};

describe("이 회차 확인(checkRound)", () => {
  it("맞는 회차는 문제가 없고, 1~3등 작업 증명을 계산한다", async () => {
    for (const round of [1, 2]) {
      const report = await checkRound(await input(round), OPTIONS);
      expect(report.problems).toEqual([]);
      expect(report.powChecked).toBe(3);
    }
  });

  it("사슬이 끊기면(앞 기록을 바꿈) 드러난다", async () => {
    const base = await input(2);
    const first = base.records[0] as RoundRecord;
    const records = [{ ...first, count: first.count + 1 }, base.records[1]];
    const report = await checkRound(
      { ...base, records: records as RoundRecord[] },
      OPTIONS,
    );
    expect(report.problems.map((p) => p.message)).toContain(
      "앞 기록 해시와 이어지지 않는다(장부가 바뀌었다)",
    );
  });

  it("응모권을 빼거나 회차 파일 기록이 다르면 드러난다", async () => {
    const base = await input(1);
    const fewer = await checkRound(
      { ...base, tickets: base.tickets.slice(1), summary: undefined as never },
      OPTIONS,
    );
    expect(fewer.problems.map((p) => p.message)).toEqual(
      expect.arrayContaining([
        "응모 수가 2인데 기록은 3",
        "응모권 목록으로 만든 머클 루트가 기록과 다르다",
      ]),
    );
    const other = await input(2);
    const swapped = await checkRound(
      { ...base, fileRecord: other.fileRecord },
      OPTIONS,
    );
    expect(swapped.problems.map((p) => p.message)).toContain(
      "회차 파일의 기록이 기록 사슬의 기록과 다르다",
    );
  });

  it("틀린 요약, 바꾼 봉인 값, 없는 봉인 파일", async () => {
    const base = await input(1);
    const wrong = await checkRound(
      { ...base, summary: { qualified: 1, qualPubs: ["00"], twins: [] } },
      OPTIONS,
    );
    expect(wrong.problems.map((p) => p.message)).toEqual([
      "요약이 회차 파일로 다시 계산한 값과 다르다",
    ]);
    const seal = await checkRound(
      {
        ...base,
        seal: { ...(base.seal as never as object), digest: "00" } as never,
      },
      OPTIONS,
    );
    expect(seal.problems.map((p) => p.message)).toContain(
      "봉인 값이 기록과 다르다",
    );
    const none = await checkRound({ ...base, seal: null }, OPTIONS);
    expect(none.problems).toEqual([]);
    expect(none.skipped).toEqual(["봉인 파일을 받지 못했습니다"]);
  });

  it("drand 서명이 틀리면 드러난다", async () => {
    const report = await checkRound(await input(1), {
      ...OPTIONS,
      beaconVerifier: () => false,
    });
    expect(report.problems.map((p) => p.message)).toEqual([
      "drand 서명이 맞지 않는다",
    ]);
  });
});
