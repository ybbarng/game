import type { Clock } from "@game/fair-play";

import { newSecret, sha256Hex } from "./fairness";
import type { Transport } from "./transport";

/**
 * 함께 정한 난수(docs/43 2-6·7-1, docs/18 "함께 정하는 난수", 31 방법 5). 약속 뒤 공개의 기본 규칙을 따른다.
 *
 * 1. 판 시작에 각자 비밀 값 r_i를 만들어 약속(해시)만 모두에게 보낸다(`begin`).
 * 2. 필요할 때(동점 등) 모두의 약속을 받은 뒤에야 r_i를 공개한다(`reveal`). 남의 값을 보고 내 값을 고를 수 없다.
 * 3. 값은 `H(r_0‖…‖r_n‖label)`. 공개를 거부했거나(시간 안에 안 냄) 약속과 다르면 그 사람은 "잘못한 사람"(`faulted`)이다.
 *
 * **잘못한 사람이 결과를 고르지 못하게(2026-11-04 검토 후속).** 예전에는 잘못한 사람을 빼고 정직한 사람 값만으로 정했다.
 * 그러면 남의 공개를 다 본 사람이 "나를 넣은 값"과 "뺀 값" 중 원하는 쪽을 고를 수 있고(k명이 짜면 2^k가지),
 * 벌칙은 동점인 사람에게만 붙어 제3자는 잃는 것이 없었다. 지금 규칙:
 *
 * - 약속하지 않은 자리는 그냥 뺀다. 약속을 닫은 뒤에야 공개가 시작되므로 남의 값을 모르고 빠졌다(고를 거리가 없다).
 *   이것까지 대체 값으로 보내면 "약속 안 하기"로 미리 아는 대체 값을 고를 수 있다.
 * - 공개 단계에서 잘못한 자리(공개 거부·약속과 다름)가 하나라도 있으면(`fallback`), `jointDraw`·`jointPick`은
 *   범위와 이름표만으로 정한 **대체 값** `H(joint-fallback|scope|label)`을 낸다. 누구의 비밀 값·약속에도,
 *   누가 몇 명 거부했는지에도 기대지 않는다. 약속 해시로 정하지 않는 까닭: 마지막에 약속하는 사람이 남의 해시를 보고
 *   자기 비밀 값을 골라(갈아) 대체 값을 움직일 수 있다.
 * - `jointTiebreak`은 **동점인 자리의 값만** 쓴다. 동점이 아닌 제3자의 공개는 결과에 들어가지 않아, 거부해도 결과가 똑같다.
 *   동점인 자리가 거부하면 그 자리가 맨 뒤(가장 나쁜 자리)로 가고, 남은 동점 자리는 대체 값으로 줄 세운다.
 *
 * 남는 것(약속 뒤 공개로는 없앨 수 없다): `jointDraw`·`jointPick`에서 마지막에 공개하는 사람은 "정상 값"과
 * "대체 값" 둘 중 하나를 고를 수 있다(1비트, 짜는 사람이 늘어도 둘뿐). 이 결과가 누군가에게 이득이 되는 쓰임이면
 * 쓰는 게임이 `faulted`에게 벌칙(그 판 패배 등)을 걸어야 한다. 동점 가르기는 이해관계가 동점인 자리에 있어 위처럼 따로 막는다.
 *
 * 방장의 일반방 시드(`fairness.ts` `deriveSeed`)와 같은 해시를 쓰지만 약속에 범위(`scope`)를 묶어
 * 다른 판·다른 쓰임의 약속을 다시 쓰지 못하게 한다. 메시지는 `t`가 없어(`jr: 1`) 방 코드와 섞이지 않는다.
 */

export interface JointCommitment {
  seat: number;
  hash: string;
}

export interface JointReveal {
  seat: number;
  secret: string;
}

export interface JointOutcome {
  scope: string;
  /** 약속하고 약속대로 공개한 자리(작은 순) */
  honest: number[];
  /** 약속하지 않았거나, 공개하지 않았거나, 약속과 다른 값을 낸 자리. 벌칙을 줄지는 쓰는 게임이 정한다 */
  faulted: { seat: number; reason: string }[];
  /** 정직한 자리의 비밀 값(자리 순, `honest`와 같은 차례). 값 계산에만 쓴다 */
  secrets: string[];
  /**
   * 약속한 뒤 공개 단계에서 잘못한 자리(공개 거부·약속과 다름)가 있다. 그러면 `jointDraw`·`jointPick`은
   * 비밀 값과 상관없는 대체 값을 낸다(위 설명)
   */
  fallback: boolean;
}

const SECRET_PATTERN = /^[A-Za-z0-9]{8,128}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const SCOPE_PATTERN = /^[A-Za-z0-9:._-]{1,64}$/;

export function jointCommit(scope: string, secret: string): Promise<string> {
  return sha256Hex(`joint-commit|${scope}|${secret}`);
}

/**
 * 약속과 공개로 결과를 정한다(모든 기기가 같은 재료면 같은 결과). `seats`는 약속해야 하는 자리.
 * 같은 자리의 약속·공개가 여럿이면 처음 것만 본다
 */
export async function jointOutcome(
  scope: string,
  seats: readonly number[],
  commitments: readonly JointCommitment[],
  reveals: readonly JointReveal[],
): Promise<JointOutcome> {
  const hashes = new Map<number, string>();
  for (const c of commitments)
    if (!hashes.has(c.seat)) hashes.set(c.seat, c.hash);
  const secrets = new Map<number, string>();
  for (const r of reveals)
    if (!secrets.has(r.seat)) secrets.set(r.seat, r.secret);
  const honest: number[] = [];
  const faulted: JointOutcome["faulted"] = [];
  const honestSecrets: string[] = [];
  let fallback = false;
  for (const seat of [...new Set(seats)].sort((a, b) => a - b)) {
    const hash = hashes.get(seat);
    const secret = secrets.get(seat);
    if (hash === undefined) faulted.push({ seat, reason: "약속하지 않았다" });
    else if (secret === undefined) {
      faulted.push({ seat, reason: "공개하지 않았다" });
      fallback = true;
    } else if (
      !SECRET_PATTERN.test(secret) ||
      (await jointCommit(scope, secret)) !== hash
    ) {
      faulted.push({ seat, reason: "약속과 다른 값을 냈다" });
      fallback = true;
    } else {
      honest.push(seat);
      honestSecrets.push(secret);
    }
  }
  return { scope, honest, faulted, secrets: honestSecrets, fallback };
}

/** 범위와 이름표만으로 정한 대체 값. 누구의 비밀 값·약속에도 기대지 않아 잘못한 사람이 움직일 수 없다 */
function fallbackDraw(scope: string, label: string): Promise<string> {
  return sha256Hex(`joint-fallback|${scope}|${label}`);
}

/**
 * `H(r_0‖…‖r_n‖label)`(16진). 한 번 공개한 값으로 이름표마다 다른 값을 뽑는다(판 번호·동점 번호).
 * 공개 단계에서 잘못한 자리가 있으면(`fallback`) 대체 값을 낸다
 */
export function jointDraw(
  outcome: JointOutcome,
  label: string,
): Promise<string> {
  if (outcome.fallback) return fallbackDraw(outcome.scope, label);
  return sha256Hex(
    `joint-random|${outcome.scope}|${outcome.secrets.join("|")}|${label}`,
  );
}

/** 0 이상 `n` 미만의 수 하나 */
export async function jointPick(
  outcome: JointOutcome,
  label: string,
  n: number,
): Promise<number> {
  if (!Number.isInteger(n) || n <= 0) throw new Error("n은 1 이상의 정수");
  const hex = await jointDraw(outcome, label);
  return Number.parseInt(hex.slice(0, 12), 16) % n;
}

/**
 * 동점 가르기: 동점인 자리의 순서(앞이 이김). **동점인 자리의 비밀 값만** 쓴다. 동점이 아닌 자리는 공개하든
 * 거부하든 결과가 같다. 잘못한 동점 자리(약속 안 함·공개 거부·약속과 다름)는 맨 뒤에 자리 순으로 두고
 * (약속 뒤 공개의 기본 규칙: 그 사람이 진다), 동점 자리 중 공개 단계에서 잘못한 사람이 있으면 남은 정직한 동점 자리는
 * 대체 값으로 줄 세운다(거부로 남의 순서를 고르지 못하게, 짜고 거부해도 경우가 늘지 않게)
 */
export async function jointTiebreak(
  outcome: JointOutcome,
  tied: readonly number[],
  label: string,
): Promise<number[]> {
  const seats = [...new Set(tied)].sort((a, b) => a - b);
  const honest = seats.filter((s) => outcome.honest.includes(s));
  const faulted = seats.filter((s) => !outcome.honest.includes(s));
  const revealFaulted = faulted.some((s) =>
    outcome.faulted.some((f) => f.seat === s && f.reason !== "약속하지 않았다"),
  );
  const tiedSecrets = honest.map(
    (s) => `${s}:${outcome.secrets[outcome.honest.indexOf(s)]}`,
  );
  const draw = revealFaulted
    ? await fallbackDraw(outcome.scope, `tie|${label}`)
    : await sha256Hex(
        `joint-tie-draw|${outcome.scope}|${tiedSecrets.join("|")}|${label}`,
      );
  const keys = new Map<number, string>();
  for (const seat of honest)
    keys.set(seat, await sha256Hex(`joint-tie|${draw}|${seat}`));
  honest.sort((a, b) => {
    const ka = keys.get(a) as string;
    const kb = keys.get(b) as string;
    return ka < kb ? -1 : ka > kb ? 1 : a - b;
  });
  return [...honest, ...faulted];
}

type JointWire =
  | { jr: 1; k: "commit"; scope: string; seat: number; hash: string }
  | { jr: 1; k: "reveal"; scope: string; seat: number; secret: string };

export function isJointWire(value: unknown): value is JointWire {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  if (m.jr !== 1 || m.t !== undefined) return false;
  if (typeof m.scope !== "string" || !SCOPE_PATTERN.test(m.scope)) return false;
  if (!Number.isInteger(m.seat) || (m.seat as number) < 0) return false;
  if (m.k === "commit")
    return typeof m.hash === "string" && HASH_PATTERN.test(m.hash);
  if (m.k === "reveal")
    return typeof m.secret === "string" && m.secret.length <= 128;
  return false;
}

export interface JointRandomOptions {
  transport: Transport;
  /** 약속·공개를 기다리는 시간을 잰다. 시험은 ManualClock */
  clock: Clock;
  mySeat(): number | null;
  /** 연결 아이디 → 자리. 모르면 null(그 연결의 메시지는 버린다) */
  seatOfPeer(peerId: string): number | null;
  /** 약속을 모으는 시간, 공개를 모으는 시간(각각, ms) */
  timeoutMs?: number;
  /** 비밀 값 만들기(시험이 정한 값으로) */
  newSecret?(): string;
}

interface Scope {
  seats: number[] | null;
  secret: string | null;
  commits: Map<number, string>;
  reveals: Map<number, string>;
  /** 약속을 더 받지 않는다(공개를 시작했다) */
  commitClosed: boolean;
  revealClosed: boolean;
  /** 받은 메시지마다 기다림을 다시 본다 */
  wake: (() => void) | null;
}

/** 범위(scope)를 이만큼까지만 기억한다(오래된 것부터 지운다) */
const MAX_SCOPES = 32;

/**
 * 함께 정한 난수의 방 흐름. 약속·공개는 모두에게 직접 보낸다(방장을 거치지 않는다).
 * 부분적으로 끊긴 연결에서는 기기마다 받은 재료가 달라 결과가 갈릴 수 있다. 그 경우는 방장 발표와 맞춰 보는
 * 위층(청구 통로 발표에 동점 결과를 싣기)이 잡는다(docs/43 1층 구현 절 "남은 것")
 */
export class JointRandomHub {
  private readonly scopes = new Map<string, Scope>();
  private readonly timeoutMs: number;

  constructor(private readonly options: JointRandomOptions) {
    this.timeoutMs = options.timeoutMs ?? 3_000;
    options.transport.onMessage((message, from) => {
      if (isJointWire(message)) this.receive(message, from);
    });
  }

  private scope(name: string): Scope {
    let scope = this.scopes.get(name);
    if (!scope) {
      scope = {
        seats: null,
        secret: null,
        commits: new Map(),
        reveals: new Map(),
        commitClosed: false,
        revealClosed: false,
        wake: null,
      };
      this.scopes.set(name, scope);
      if (this.scopes.size > MAX_SCOPES) {
        const oldest = this.scopes.keys().next().value as string;
        this.scopes.delete(oldest);
      }
    }
    return scope;
  }

  /** 판 시작: 내 비밀 값을 만들고 약속을 모두에게 보낸다. `seats`는 약속해야 하는 자리 전부 */
  async begin(name: string, seats: readonly number[]): Promise<void> {
    if (!SCOPE_PATTERN.test(name)) throw new Error("범위 이름이 맞지 않다");
    const scope = this.scope(name);
    scope.seats = [...seats];
    const seat = this.options.mySeat();
    if (seat === null || scope.secret !== null) return;
    const secret = this.options.newSecret?.() ?? newSecret();
    scope.secret = secret;
    const hash = await jointCommit(name, secret);
    if (!scope.commits.has(seat)) scope.commits.set(seat, hash);
    this.options.transport.send({
      jr: 1,
      k: "commit",
      scope: name,
      seat,
      hash,
    });
    scope.wake?.();
  }

  /**
   * 값을 정한다: 모두의 약속을 기다렸다가(시간이 지나면 받은 것까지) 내 값을 공개하고,
   * 약속한 모두의 공개를 기다려(시간이 지나면 받은 것까지) 결과를 낸다
   */
  async reveal(name: string): Promise<JointOutcome> {
    const scope = this.scope(name);
    const seats = scope.seats ?? [];
    await this.waitFor(scope, () => seats.every((s) => scope.commits.has(s)));
    scope.commitClosed = true;
    const seat = this.options.mySeat();
    if (seat !== null && scope.secret !== null) {
      if (!scope.reveals.has(seat)) scope.reveals.set(seat, scope.secret);
      this.options.transport.send({
        jr: 1,
        k: "reveal",
        scope: name,
        seat,
        secret: scope.secret,
      });
    }
    const committed = [...scope.commits.keys()];
    await this.waitFor(scope, () =>
      committed.every((s) => scope.reveals.has(s)),
    );
    scope.revealClosed = true;
    return jointOutcome(
      name,
      seats,
      [...scope.commits].map(([s, hash]) => ({ seat: s, hash })),
      [...scope.reveals].map(([s, secret]) => ({ seat: s, secret })),
    );
  }

  /** 조건이 맞거나 시간이 지날 때까지 기다린다(시간은 주입한 시계로) */
  private waitFor(scope: Scope, done: () => boolean): Promise<void> {
    return new Promise((resolve) => {
      if (done()) {
        resolve();
        return;
      }
      let cancel: (() => void) | null = null;
      const finish = () => {
        scope.wake = null;
        cancel?.();
        resolve();
      };
      scope.wake = () => {
        if (done()) finish();
      };
      cancel = this.options.clock.after(this.timeoutMs, finish);
    });
  }

  private receive(message: JointWire, from: string): void {
    const seat = this.options.seatOfPeer(from);
    if (seat === null || seat !== message.seat) return;
    const scope = this.scope(message.scope);
    if (message.k === "commit") {
      if (scope.commitClosed || scope.commits.has(seat)) return;
      scope.commits.set(seat, message.hash);
    } else {
      // 약속하지 않은 사람의 공개는 셈하지 않는다(결과에서 "약속하지 않았다"가 된다).
      if (scope.revealClosed || scope.reveals.has(seat)) return;
      scope.reveals.set(seat, message.secret);
    }
    scope.wake?.();
  }
}
