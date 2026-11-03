import type { Clock } from "@game/fair-play";

import { newSecret, sha256Hex } from "./fairness";
import type { Transport } from "./transport";

/**
 * 함께 정한 난수(docs/43 2-6, docs/18 "함께 정하는 난수", 31 방법 5). 약속 뒤 공개의 기본 규칙을 따른다.
 *
 * 1. 판 시작에 각자 비밀 값 r_i를 만들어 약속(해시)만 모두에게 보낸다(`begin`).
 * 2. 필요할 때(동점 등) 모두의 약속을 받은 뒤에야 r_i를 공개한다(`reveal`). 남의 값을 보고 내 값을 고를 수 없다.
 * 3. 값은 `H(r_0‖…‖r_n‖label)`. 공개를 거부했거나(시간 안에 안 냄) 약속과 다르면 그 사람은 "잘못한 사람"(`faulted`)이고,
 *    값은 정직한 사람의 r만으로 정한다. 동점 가르기(`jointTiebreak`)에서는 잘못한 사람이 진다.
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
  /** 약속하지 않았거나, 공개하지 않았거나, 약속과 다른 값을 낸 자리 */
  faulted: { seat: number; reason: string }[];
  /** 정직한 자리의 비밀 값(자리 순). 값 계산에만 쓴다 */
  secrets: string[];
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
  for (const seat of [...new Set(seats)].sort((a, b) => a - b)) {
    const hash = hashes.get(seat);
    const secret = secrets.get(seat);
    if (hash === undefined) faulted.push({ seat, reason: "약속하지 않았다" });
    else if (secret === undefined)
      faulted.push({ seat, reason: "공개하지 않았다" });
    else if (
      !SECRET_PATTERN.test(secret) ||
      (await jointCommit(scope, secret)) !== hash
    )
      faulted.push({ seat, reason: "약속과 다른 값을 냈다" });
    else {
      honest.push(seat);
      honestSecrets.push(secret);
    }
  }
  return { scope, honest, faulted, secrets: honestSecrets };
}

/** `H(r_0‖…‖r_n‖label)`(16진). 한 번 공개한 값으로 이름표마다 다른 값을 뽑는다(판 번호·동점 번호) */
export function jointDraw(
  outcome: JointOutcome,
  label: string,
): Promise<string> {
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
 * 동점 가르기: 동점인 자리의 순서(앞이 이김). 정직한 자리는 함께 정한 값으로 섞고,
 * 잘못한 자리(공개 거부·약속과 다름)는 그 뒤에 자리 순으로 둔다(약속 뒤 공개의 기본 규칙: 그 사람이 진다)
 */
export async function jointTiebreak(
  outcome: JointOutcome,
  tied: readonly number[],
  label: string,
): Promise<number[]> {
  const seats = [...new Set(tied)].sort((a, b) => a - b);
  const honest = seats.filter((s) => outcome.honest.includes(s));
  const faulted = seats.filter((s) => !outcome.honest.includes(s));
  const draw = await jointDraw(outcome, label);
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
