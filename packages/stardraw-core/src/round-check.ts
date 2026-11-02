import { compareBytes, equalBytes, taggedHash, toHex } from "./bytes";
import {
  type BeaconVerifier,
  drandRandomness,
  drandRoundForClose,
  verifyQuicknetBeacon,
} from "./drand";
import { drawNumbers, drawSeed, RANKS, rankOf } from "./draw";
import { entrantId } from "./keys";
import { type RoundSummary, roundSummary, sameSummary } from "./light";
import { merkleRoot } from "./merkle";
import { scheduleFromRecords } from "./operations";
import { checkPow, POW_PARAMS, type PowParams } from "./pow";
import { genesisHash, type RoundRecord, recordHash } from "./record";
import {
  checkRegistration,
  type KeyRegistration,
  registrationContent,
  registrationId,
} from "./registration";
import { isVoidRound, sealDigest } from "./round";
import { phaseOf, roundTimes, type Schedule } from "./schedule";
import type { WebAuthnPolicy } from "./signature";
import {
  TICKET_VERSION,
  TICKET_VERSION_QUAL,
  type Ticket,
  ticketContent,
  ticketId,
  verifyTicketSignature,
} from "./ticket";
import {
  DEFAULT_TSA_MIN,
  type TsaAuthority,
  type TsaProof,
  verifyTsaProof,
} from "./tsa";
import { type Problem, pickSample } from "./verify";

/**
 * 「이 회차 확인」(docs/36 11-30 설계 1의 가벼운 기기 확인). 장부 전체를 받지 않고
 * 회차 기록 사슬(가벼운 기록)과 그 회차 파일·봉인 파일 하나로 확인한다.
 *
 * 확인하는 것: 사슬(처음 일정표부터 기록 해시가 이어짐), 회차 파일의 기록이 사슬의 기록과 같은 바이트, 응모권·등록 목록의
 * 정렬·회차·수·머클 루트, 응모권 서명과 한 열쇠 한 장, 작업 증명(내 것·1~3등 전부, 나머지는 표본), 등록 작업 증명,
 * drand 회차·서명·당첨 번호·등수별 당첨 목록, 무효 규칙, 봉인 파일(봉인 값·시각·시각 인증 토큰), 요약.
 *
 * 확인하지 않는 것(전체 검사에 맡긴다): 응모권의 열쇠가 앞 회차에 등록됐는지, 별명·운영 기록 서명,
 * 소속 증서 발급 수, 앵커 저장소. 검증 페이지·터미널 검사기가 처음부터 다시 계산한다
 */

export interface RoundCheckInput {
  genesis: Schedule;
  /** 1회차부터 이 회차까지(이후도 있어도 된다) 닫힌 기록. 가벼운 기록에서 받은 것 */
  records: readonly RoundRecord[];
  round: number;
  /** 그 회차 파일의 기록(같은 바이트인지 본다) */
  fileRecord: RoundRecord;
  tickets: readonly Ticket[];
  registrations: readonly KeyRegistration[];
  /** 그 회차 봉인 파일. 없으면(받지 못함) 건너뛴다 */
  seal?: { digest: string; loggedAt: number; log?: unknown } | null;
  /** 가벼운 기록에 실린 요약(있으면 다시 계산해 대조) */
  summary?: RoundSummary;
}

export interface RoundCheckOptions {
  beaconVerifier?: BeaconVerifier;
  powParams?: PowParams;
  /** 표본 수(내 것·1~3등 제외). 기본 8 */
  powSample?: number;
  mine?: readonly Uint8Array[];
  webauthnPolicy?: WebAuthnPolicy;
  tsaAuthorities?: readonly TsaAuthority[];
}

export interface RoundCheckReport {
  problems: Problem[];
  skipped: string[];
  powChecked: number;
}

export async function checkRound(
  input: RoundCheckInput,
  options: RoundCheckOptions = {},
): Promise<RoundCheckReport> {
  const { round, tickets, registrations } = input;
  const problems: Problem[] = [];
  const skipped: string[] = [];
  const fail = (message: string, at = round) =>
    problems.push({ round: at, message });

  // 1. 사슬: 처음 일정표부터 이 회차까지
  let head = genesisHash(input.genesis);
  for (let i = 0; i < round; i++) {
    const r = input.records[i];
    if (!r) {
      fail(`${i + 1}회차 기록이 없다`);
      return { problems, skipped, powChecked: 0 };
    }
    if (r.round !== i + 1)
      fail(`회차 번호가 ${i + 1}여야 하는데 ${r.round}다`, i + 1);
    if (!equalBytes(r.prev, head))
      fail("앞 기록 해시와 이어지지 않는다(장부가 바뀌었다)", i + 1);
    if (i + 1 < round) head = recordHash(r);
  }
  const record = input.records[round - 1] as RoundRecord;
  if (!equalBytes(recordHash(record), recordHash(input.fileRecord)))
    fail("회차 파일의 기록이 기록 사슬의 기록과 다르다");

  // 일정표: 이 회차 앞까지의 기록으로(일정 바꾸기는 다음 회차부터 효력)
  const schedule = scheduleFromRecords(
    input.genesis,
    input.records.slice(0, round - 1),
  );
  const { closesAt, entry } = roundTimes(schedule, round);
  const params = options.powParams ?? POW_PARAMS;

  // 2. 등록 목록
  const regIds = registrations.map(registrationId);
  for (let k = 0; k < registrations.length; k++) {
    const reg = registrations[k] as KeyRegistration;
    const id = regIds[k] as Uint8Array;
    if (k > 0 && compareBytes(regIds[k - 1] as Uint8Array, id) >= 0)
      fail("등록 목록이 id 순서가 아니거나 같은 등록이 두 번 있다");
    const problem = checkRegistration(reg);
    if (problem) {
      fail(`등록 ${short(id)}: ${problem}`);
      continue;
    }
    if (
      !(await checkPow(
        record.prev,
        registrationContent(reg),
        reg.nonce,
        entry.registerPowTarget,
        params,
      ))
    )
      fail(`등록 ${short(id)}: 작업 증명이 맞지 않는다`);
  }
  if (record.registrationCount !== registrations.length)
    fail(
      `등록 수가 ${registrations.length}인데 기록은 ${record.registrationCount}`,
    );
  if (!equalBytes(record.registrationRoot, merkleRoot(regIds)))
    fail("등록 목록으로 만든 머클 루트가 기록과 다르다");

  // 3. 응모권: 판, 회차, 정렬, 서명, 한 열쇠 한 장
  const ids = tickets.map(ticketId);
  const entrants = new Set<string>();
  for (let k = 0; k < tickets.length; k++) {
    const t = tickets[k] as Ticket;
    const id = ids[k] as Uint8Array;
    if (t.v !== TICKET_VERSION && t.v !== TICKET_VERSION_QUAL)
      fail(`예측서 ${short(id)}: 모르는 판`);
    if (t.round !== round)
      fail(`예측서 ${short(id)}: 다른 회차(${t.round})의 예측서`);
    if (k > 0 && compareBytes(ids[k - 1] as Uint8Array, id) >= 0)
      fail("예측서 목록이 id 순서가 아니거나 같은 예측서가 두 번 있다");
    const who = toHex(entrantId(t.pub));
    if (entrants.has(who))
      fail(`예측서 ${short(id)}: 같은 열쇠가 이 회차에 두 장 냈다`);
    entrants.add(who);
    if (!(await verifyTicketSignature(t, options.webauthnPolicy)))
      fail(`예측서 ${short(id)}: 서명이 맞지 않는다`);
  }
  if (record.count !== tickets.length)
    fail(`예측 수가 ${tickets.length}인데 기록은 ${record.count}`);
  if (!equalBytes(record.merkleRoot, merkleRoot(ids)))
    fail("예측서 목록으로 만든 머클 루트가 기록과 다르다");

  // 4. drand·무효 규칙·당첨
  if (record.drandRound !== drandRoundForClose(closesAt))
    fail("정해진 drand 회차가 아니다");
  const shouldBeVoid = isVoidRound(closesAt, record.rootLoggedAt);
  if (record.void !== shouldBeVoid)
    fail(
      shouldBeVoid
        ? "루트 기록 시각으로는 무효 회차인데 추첨했다"
        : "무효가 아닌데 무효로 처리했다",
    );
  let sampleSeed = taggedHash(
    "stardraw/sample/v1",
    record.merkleRoot,
    record.prev,
  );
  if (!record.void) {
    const beacon = {
      round: record.drandRound,
      signature: record.drandSignature,
    };
    if (!(options.beaconVerifier ?? verifyQuicknetBeacon)(beacon))
      fail("drand 서명이 맞지 않는다");
    const randomness = drandRandomness(beacon);
    sampleSeed = taggedHash("stardraw/sample/v1", randomness);
    const draw = drawNumbers(drawSeed(round, randomness));
    if (
      draw.numbers.join() !== record.numbers.join() ||
      draw.bonus !== record.bonus
    )
      fail(
        `당첨 번호가 규칙대로가 아니다(규칙: ${draw.numbers.join(",")} + ${draw.bonus})`,
      );
    for (const rank of RANKS) {
      const expected = tickets.flatMap((t, k) =>
        rankOf(draw, t.numbers) === rank ? [ids[k] as Uint8Array] : [],
      );
      const listed = record.winners[rank];
      if (
        expected.length !== listed.length ||
        expected.some((id, i) => !equalBytes(id, listed[i] as Uint8Array))
      )
        fail(`${rank}등 당첨자 목록이 규칙대로가 아니다`);
    }
  } else if (RANKS.some((rank) => record.winners[rank].length > 0)) {
    fail("무효 회차에 당첨자가 있다");
  }

  // 5. 작업 증명: 내 것과 1~3등은 전부, 나머지는 표본(검사기와 같은 표본)
  const always = new Set((options.mine ?? []).map(toHex));
  for (const rank of [1, 2, 3] as const)
    for (const id of record.winners[rank]) always.add(toHex(id));
  const sample = pickSample(sampleSeed, tickets.length, options.powSample ?? 8);
  let powChecked = 0;
  for (let k = 0; k < tickets.length; k++) {
    const id = ids[k] as Uint8Array;
    if (!always.has(toHex(id)) && !sample.has(k)) continue;
    const t = tickets[k] as Ticket;
    powChecked++;
    if (
      !(await checkPow(
        record.prev,
        ticketContent(t),
        t.nonce,
        entry.powTarget,
        params,
      ))
    )
      fail(`예측서 ${short(id)}: 작업 증명이 맞지 않는다`);
  }

  // 6. 봉인 파일과 시각 인증 토큰
  const seal = input.seal;
  if (!seal) skipped.push("봉인 파일을 받지 못했습니다");
  else {
    if (seal.digest !== toHex(sealDigest(record)))
      fail("봉인 값이 기록과 다르다");
    if (seal.loggedAt !== record.rootLoggedAt)
      fail("봉인 시각이 기록과 다르다");
    const log = seal.log as TsaProof | null | undefined;
    if (record.rootLoggedAt === 0) {
      // 무효 회차: 볼 토큰이 없다
    } else if (log?.kind !== "tsa") {
      if (phaseOf(schedule, round) === "trial")
        skipped.push("시험 회차라 시각 인증 없이 서버 시계로 봉인했습니다");
      else fail("봉인 시각 인증 토큰이 없다");
    } else {
      const check = await verifyTsaProof(log, {
        digest: sealDigest(record),
        minValid: DEFAULT_TSA_MIN,
        ...(options.tsaAuthorities
          ? { authorities: options.tsaAuthorities }
          : {}),
      });
      if (!check.ok) fail(`봉인 시각 인증: ${check.problems.join(", ")}`);
      else if (check.loggedAt !== record.rootLoggedAt)
        fail("봉인 시각이 가장 이른 토큰 시각과 다르다");
    }
  }

  // 7. 요약
  if (input.summary && !sameSummary(input.summary, roundSummary(tickets)))
    fail("요약이 회차 파일로 다시 계산한 값과 다르다");

  return { problems, skipped, powChecked };
}

function short(id: Uint8Array): string {
  return toHex(id).slice(0, 12);
}
