/**
 * 규모 측정 도구의 공통 부분(docs/36 11-30). 단위 시험이 아니다. 운영 서버에는 요청을 보내지 않는다.
 *
 * 작업 증명 풀이를 미리 하지 않아도 되게, 측정용 일정표는 목표값을 가장 크게(0xffffffff) 둔다.
 * 그러면 nonce 0이 거의 언제나(1 - 2^-32) 맞는다. 서버가 응모 한 장을 확인하는 비용은 목표값과 상관없이
 * Argon2id(16MB) 한 번이라, 받는 쪽 측정은 실제와 같다. 바뀌는 것은 응모하는 쪽의 풀이 시간뿐이다.
 */
import {
  generateSigner,
  type KeyRegistration,
  type QualHolding,
  REGISTRATION_VERSION,
  type Schedule,
  type SoftPasskey,
  signTicket,
  softPasskeySigner,
  type Ticket,
  unsignedTicket,
} from "@game/stardraw-core";

export const MAX_TARGET = 0xffffffff;

/** 측정용 일정표: 10분 회차, 마감 여유 5초, 목표값 최대 */
export function benchSchedule(epoch: number, length = 600): Schedule {
  return {
    epoch,
    entries: [
      {
        fromRound: 1,
        length,
        closeMargin: 5,
        powTarget: MAX_TARGET,
        registerPowTarget: MAX_TARGET,
      },
    ],
  };
}

/** 정해진 씨앗으로 도는 간단한 난수(측정이 매번 같은 번호를 고르게) */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 2 ** 32;
  };
}

export function pickNumbers(rand: () => number): number[] {
  const pool = Array.from({ length: 45 }, (_, i) => i + 1);
  const out: number[] = [];
  for (let i = 0; i < 6; i++)
    out.push(...pool.splice(Math.floor(rand() * pool.length), 1));
  return out.sort((a, b) => a - b);
}

export async function makePlayers(n: number): Promise<SoftPasskey[]> {
  const out: SoftPasskey[] = [];
  for (let i = 0; i < n; i++)
    out.push(softPasskeySigner(await generateSigner()));
  return out;
}

/** 작업 증명 nonce 0인 등록(측정 일정표의 최대 목표값에서 맞는다) */
export function registrationOf(p: SoftPasskey): KeyRegistration {
  return {
    v: REGISTRATION_VERSION,
    credentialId: p.credentialId,
    pub: p.publicKey,
    nonce: 0,
  };
}

/** nonce 0인 응모권(서명은 실제 패스키 모양) */
export function ticketOf(
  p: SoftPasskey,
  round: number,
  numbers: number[],
  qual?: QualHolding | null,
): Promise<Ticket> {
  return signTicket(p, unsignedTicket(p, round, numbers, qual), 0);
}

/** 크기만 재는 소속 증서(길이는 실제와 같고 값은 무작위라 검사는 통과하지 않는다) */
export function fakeQual(): QualHolding {
  const r = (n: number) => crypto.getRandomValues(new Uint8Array(n));
  return { periodId: r(32), seed: r(16), stamp: r(48) };
}

export const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)}KB`;
export const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)}MB`;

export function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}
