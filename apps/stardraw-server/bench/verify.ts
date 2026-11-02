/**
 * 장부 전체 검사 비용(docs/36 11-30): 화면·검사기가 처음 열 때 하는 일(회차 파일 JSON 읽기 → 바이너리 풀기 →
 * `verifyLedger`)을 회차 수 R × 회차당 응모 N으로 잰다.
 *
 * Argon2id(16MB) 확인 비용은 따로 센다: 검사기는 등록마다 전부, 응모권은 당첨(4·5등 포함)·내 것 전부와 회차마다 표본 8장을
 * 확인한다. 같은 장부를 아주 가벼운 Argon2(8KB)로 한 번 돌려 "Argon2 밖 비용"을 재고, 실제 16MB 한 번 시간 × 확인 수로 더한다.
 * --real-pow를 주면 실제 16MB로 끝까지 돌린다(작은 R·N에서 어림이 맞는지 보는 데 쓴다).
 * drand BLS 서명 확인도 회차마다 한 번이라 실제 quicknet 값으로 따로 잰다.
 *
 * 실행: nice -n 15 node apps/stardraw-server/dist/bench/verify.js --rounds 100 --per-round 100 [--real-pow]
 */
import {
  checkPow,
  closeRound,
  decodeRecord,
  decodeRegistration,
  decodeTicket,
  drandRoundForClose,
  encodeRecord,
  encodeRegistration,
  encodeTicket,
  fromBase64Url,
  fromHex,
  genesisHash,
  type KeyRegistration,
  POW_PARAMS,
  type RoundRecord,
  recordHash,
  roundTimes,
  sortRegistrations,
  sortTickets,
  type Ticket,
  toBase64Url,
  verifyLedger,
  verifyQuicknetBeacon,
} from "@game/stardraw-core";
import { fakeBeacon } from "../src/testing";
import {
  arg,
  benchSchedule,
  MAX_TARGET,
  makePlayers,
  pickNumbers,
  registrationOf,
  seeded,
  ticketOf,
} from "./common";

async function main() {
  const R = Number(arg("rounds", "100"));
  const N = Number(arg("per-round", "100"));
  const realPow = process.argv.includes("--real-pow");
  const schedule = benchSchedule(1_800_000_000);
  const rand = seeded(5);

  // 장부 만들기: N명이 1회차에 등록하고 매 회차 한 장씩
  const b0 = performance.now();
  const players = await makePlayers(N);
  const files: string[] = [];
  let prev = genesisHash(schedule);
  for (let round = 1; round <= R; round++) {
    const tickets: Ticket[] = [];
    for (const p of players)
      tickets.push(await ticketOf(p, round, pickNumbers(rand)));
    const registrations: KeyRegistration[] =
      round === 1 ? players.map(registrationOf) : [];
    const { closesAt } = roundTimes(schedule, round);
    const record = closeRound({
      schedule,
      round,
      prev,
      tickets,
      registrations,
      rootLoggedAt: closesAt + 1,
      beacon: fakeBeacon(drandRoundForClose(closesAt)),
    });
    prev = recordHash(record);
    files.push(
      JSON.stringify({
        v: 1,
        record: toBase64Url(encodeRecord(record)),
        tickets: sortTickets(tickets).map((t) => toBase64Url(encodeTicket(t))),
        registrations: sortRegistrations(registrations).map((r) =>
          toBase64Url(encodeRegistration(r)),
        ),
      }),
    );
  }
  const buildSec = (performance.now() - b0) / 1000;
  const bytes = files.reduce((t, f) => t + f.length + 1, 0);

  // 1. 읽기: JSON → 바이너리 → 응모권·등록·기록(화면 remote-ledger addFiles와 같은 일)
  const heap0 = process.memoryUsage().heapUsed;
  const p0 = performance.now();
  const records: RoundRecord[] = [];
  const tickets: Ticket[][] = [];
  const regs: KeyRegistration[][] = [];
  for (const text of files) {
    const f = JSON.parse(text) as {
      record: string;
      tickets: string[];
      registrations: string[];
    };
    records.push(decodeRecord(fromBase64Url(f.record)));
    tickets.push(f.tickets.map((t) => decodeTicket(fromBase64Url(t))));
    regs.push(f.registrations.map((r) => decodeRegistration(fromBase64Url(r))));
  }
  const parseMs = performance.now() - p0;
  const heapMB = (process.memoryUsage().heapUsed - heap0) / 1048576;

  // 2. 검사(Argon2 밖 비용): 8KB Argon2로
  const v0 = performance.now();
  const light = await verifyLedger(schedule, records, tickets, regs, {
    beaconVerifier: () => true,
    powParams: realPow ? POW_PARAMS : { memorySize: 8, iterations: 1 },
  });
  const verifyMs = performance.now() - v0;
  if (light.problems.length > 0)
    throw new Error(`검사 실패: ${JSON.stringify(light.problems.slice(0, 3))}`);
  const argonChecks = light.powChecked + light.keys.length;

  // 3. Argon2 16MB 한 번(같은 스레드)
  const a0 = performance.now();
  const reps = 20;
  for (let i = 0; i < reps; i++)
    await checkPow(
      crypto.getRandomValues(new Uint8Array(32)),
      crypto.getRandomValues(new Uint8Array(76)),
      i,
      MAX_TARGET,
      POW_PARAMS,
    );
  const argonMs = (performance.now() - a0) / reps;

  // 4. drand BLS 확인 한 번(실제 quicknet 1000000회차)
  const beacon = {
    round: 1000000,
    signature: fromHex(
      "83ad29e4c409f9470fc2ef02f90214df49e02b441a1a241a82d622d9f608ef98fd8b11a029f1bee9d9e83b45088abe72",
    ),
  };
  const d0 = performance.now();
  for (let i = 0; i < 5; i++)
    if (!verifyQuicknetBeacon(beacon)) throw new Error("drand 시험 값");
  const blsMs = (performance.now() - d0) / 5;

  const nonArgonMs = realPow ? null : verifyMs;
  const estimateMs = realPow
    ? verifyMs + blsMs * R
    : verifyMs + argonChecks * argonMs + blsMs * R;
  const result = {
    rounds: R,
    perRound: N,
    tickets: R * N,
    buildSec: +buildSec.toFixed(1),
    jsonBytes: bytes,
    parseMs: Math.round(parseMs),
    heapMB: Math.round(heapMB),
    verifyMs: Math.round(verifyMs),
    realPow,
    nonArgonMs: nonArgonMs === null ? null : Math.round(nonArgonMs),
    nonArgonPerTicketMs:
      nonArgonMs === null ? null : +(nonArgonMs / (R * N)).toFixed(3),
    argonChecks,
    argonPerCheckMs: +argonMs.toFixed(1),
    blsPerRoundMs: +blsMs.toFixed(1),
    estimateTotalSec: +((estimateMs + parseMs) / 1000).toFixed(1),
  };
  console.log(`결과 ${JSON.stringify(result)}`);
}

void main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
