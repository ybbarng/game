import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import { ManualClock } from "@game/fair-play";
import {
  DEFAULT_WEBAUTHN_POLICY,
  drandRoundForClose,
  drandTime,
  generateSigner,
  roundTimes,
  type SoftPasskey,
  softPasskeySigner,
  type Ticket,
  toHex,
} from "@game/stardraw-core";
import { beforeEach, describe, expect, it } from "vitest";

import { defaultSchedule } from "./config";
import { EntryError } from "./engine";
import {
  DEFAULT_ROOM_LIMITS,
  type RoomEvent,
  RoomHub,
  type RoomLimits,
  roomModMessage,
  roomPassMessage,
} from "./room";

/** 스트림을 받는 가짜 응답: 쓴 줄을 이벤트로 모은다 */
class FakeRes extends EventEmitter {
  events: RoomEvent[] = [];
  ended = false;
  status = 0;
  writeHead(status: number) {
    this.status = status;
    return this;
  }
  write(chunk: string) {
    for (const line of chunk.split("\n"))
      if (line.startsWith("data: "))
        this.events.push(JSON.parse(line.slice(6)));
    return true;
  }
  end() {
    this.ended = true;
    this.emit("close");
    return this;
  }
  of<T extends RoomEvent["type"]>(type: T) {
    return this.events.filter((e) => e.type === type) as Extract<
      RoomEvent,
      { type: T }
    >[];
  }
}
const asRes = (r: FakeRes) => r as unknown as ServerResponse;

const EPOCH = 1_800_000_000;
const schedule = defaultSchedule(EPOCH, 600);
const ROUND = 1;
const times = roundTimes(schedule, ROUND);
const DRAW_AT = drandTime(drandRoundForClose(times.closesAt));

let clock: ManualClock;
let hub: RoomHub;
let alice: SoftPasskey;
let bob: SoftPasskey;
let director: SoftPasskey;
let stranger: SoftPasskey;
let registered: Set<string>;
let tickets: Ticket[];
let sealed: boolean;
let drawn: boolean;

beforeEach(async () => {
  clock = new ManualClock();
  clock.advance((times.opensAt + 10) * 1000);
  alice = softPasskeySigner(await generateSigner());
  bob = softPasskeySigner(await generateSigner());
  director = softPasskeySigner(await generateSigner());
  stranger = softPasskeySigner(await generateSigner());
  registered = new Set([toHex(alice.publicKey), toHex(bob.publicKey)]);
  tickets = [];
  sealed = false;
  drawn = false;
  hub = new RoomHub({
    clock,
    policy: DEFAULT_WEBAUTHN_POLICY,
    schedule: () => schedule,
    isRegistered: (p) => registered.has(toHex(p)),
    isDirector: (p) => toHex(p) === toHex(director.publicKey),
    sealed: () => sealed,
    tickets: () => tickets,
    entered: (_r, p) => tickets.some((t) => toHex(t.pub) === toHex(p)),
    drawn: () => drawn,
  });
});

/** 상한을 작게 둔 방(같은 시계·등록·응모권) */
function smallHub(limits: Partial<RoomLimits>) {
  return new RoomHub(
    {
      clock,
      policy: DEFAULT_WEBAUTHN_POLICY,
      schedule: () => schedule,
      isRegistered: (p) => registered.has(toHex(p)),
      isDirector: () => false,
      sealed: () => sealed,
      tickets: () => tickets,
      entered: (_r, p) => tickets.some((t) => toHex(t.pub) === toHex(p)),
      drawn: () => false,
    },
    { ...DEFAULT_ROOM_LIMITS, ...limits },
  );
}

async function passFor(who: SoftPasskey) {
  const { nonce } = hub.challenge(ROUND);
  const signature = await who.sign(
    roomPassMessage(ROUND, Buffer.from(nonce, "base64url")),
  );
  return hub.issuePass(ROUND, { pub: who.publicKey, signature, nonce });
}

const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    if (err instanceof EntryError) return err.status;
    throw err;
  }
  return 200;
};

describe("대화 표(신분증 제시 한 번)", () => {
  it("등록한 우주인은 받고, 등록하지 않은 열쇠는 거절", async () => {
    const p = await passFor(alice);
    expect(p.pass).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(passFor(stranger)).rejects.toMatchObject({ status: 403 });
  });

  it("한 번 쓰는 값은 두 번 쓸 수 없고, 다른 회차·다른 용도 서명은 안 된다", async () => {
    const { nonce } = hub.challenge(ROUND);
    const n = Buffer.from(nonce, "base64url");
    const signature = await alice.sign(roomPassMessage(ROUND, n));
    await hub.issuePass(ROUND, { pub: alice.publicKey, signature, nonce });
    await expect(
      hub.issuePass(ROUND, { pub: alice.publicKey, signature, nonce }),
    ).rejects.toMatchObject({ status: 403 });
    const other = hub.challenge(ROUND).nonce;
    const wrong = await alice.sign(
      roomPassMessage(2, Buffer.from(other, "base64url")),
    );
    await expect(
      hub.issuePass(ROUND, {
        pub: alice.publicKey,
        signature: wrong,
        nonce: other,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("기한이 지난 값은 409, 서버가 내지 않은 값·다른 회차 값은 403", async () => {
    const { nonce, expiresAt } = hub.challenge(ROUND);
    expect(expiresAt).toBeLessThanOrEqual(
      clock.now() + DEFAULT_ROOM_LIMITS.nonceTtlMs,
    );
    const sign = (n: string) =>
      alice.sign(roomPassMessage(ROUND, Buffer.from(n, "base64url")));
    const signature = await sign(nonce);
    clock.advance(expiresAt - clock.now() + 1);
    await expect(
      hub.issuePass(ROUND, { pub: alice.publicKey, signature, nonce }),
    ).rejects.toMatchObject({ status: 409 });
    // 한 바이트를 바꾼 값(서명은 그 값에 맞게 새로 해도)은 서버가 낸 값이 아니다
    const fresh = Buffer.from(hub.challenge(ROUND).nonce, "base64url");
    fresh[5] = (fresh[5] ?? 0) ^ 1;
    const forged = fresh.toString("base64url");
    await expect(
      hub.issuePass(ROUND, {
        pub: alice.publicKey,
        signature: await sign(forged),
        nonce: forged,
      }),
    ).rejects.toMatchObject({ status: 403 });
    // 다음 회차 방이 낸 값은 이 회차에서 쓰지 못한다
    const next = roundTimes(schedule, ROUND + 1);
    clock.advance(Math.max(0, next.opensAt * 1000 - clock.now()) + 1000);
    const other = hub.challenge(ROUND + 1).nonce;
    await expect(
      hub.issuePass(ROUND, {
        pub: alice.publicKey,
        signature: await sign(other),
        nonce: other,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("값을 많이 내줘도 먼저 받아 둔 값은 그대로 쓴다(발급한 값을 기억하지 않는다)", async () => {
    const early = hub.challenge(ROUND).nonce;
    for (let i = 0; i < 5000; i++) hub.challenge(ROUND);
    const signature = await alice.sign(
      roomPassMessage(ROUND, Buffer.from(early, "base64url")),
    );
    await expect(
      hub.issuePass(ROUND, { pub: alice.publicKey, signature, nonce: early }),
    ).resolves.toMatchObject({ id: expect.any(String) });
  });

  it("서명이 틀리면 값을 쓰지 않은 것으로 두고, 쓴 값 기억이 가득 차면 기한 안의 것을 버리지 않고 잠깐 거절한다", async () => {
    const small = smallHub({ maxUsedNonces: 1 });
    const { nonce } = small.challenge(ROUND);
    const n = Buffer.from(nonce, "base64url");
    const wrong = await bob.sign(roomPassMessage(ROUND, n));
    await expect(
      small.issuePass(ROUND, { pub: alice.publicKey, signature: wrong, nonce }),
    ).rejects.toMatchObject({ status: 403 });
    const signature = await alice.sign(roomPassMessage(ROUND, n));
    await small.issuePass(ROUND, { pub: alice.publicKey, signature, nonce });
    clock.advance(2000);
    const second = small.challenge(ROUND).nonce;
    const sig2 = await bob.sign(
      roomPassMessage(ROUND, Buffer.from(second, "base64url")),
    );
    const take = () =>
      small.issuePass(ROUND, {
        pub: bob.publicKey,
        signature: sig2,
        nonce: second,
      });
    await expect(take()).rejects.toMatchObject({ status: 503 });
    // 앞 값의 기한이 지나면 기억에서 지워져 다시 받는다(두 번째 값은 그보다 늦게 나와 아직 기한 안)
    clock.advance(DEFAULT_ROOM_LIMITS.nonceTtlMs - 1500);
    await expect(take()).resolves.toMatchObject({ id: expect.any(String) });
    small.stop();
  });

  it("국장 패스키는 등록이 없어도 표를 받고 국장으로 표시된다", async () => {
    const p = await passFor(director);
    const res = new FakeRes();
    hub.connect(ROUND, asRes(res), p.pass);
    expect(res.of("hello")[0]?.people[0]).toMatchObject({ director: true });
  });
});

describe("스트림과 말", () => {
  it("들어오면 얼굴, 말은 연결된 사람에게만 건네고 남기지 않는다", async () => {
    const a = await passFor(alice);
    const b = await passFor(bob);
    const ra = new FakeRes();
    const watcher = new FakeRes();
    hub.connect(ROUND, asRes(ra), a.pass);
    hub.connect(ROUND, asRes(watcher), undefined);
    // 보는 사람 수는 1초마다 한 번 모아 알린다
    expect(ra.of("watchers")).toHaveLength(0);
    clock.advance(1000);
    expect(ra.of("watchers").at(-1)?.count).toBe(1);
    const rb = new FakeRes();
    hub.connect(ROUND, asRes(rb), b.pass);
    expect(ra.of("join").map((e) => e.person.id)).toEqual([b.id]);
    hub.say(ROUND, b.pass, "  오늘은   시리우스!  ");
    expect(ra.of("say")[0]).toMatchObject({
      from: b.id,
      text: "오늘은 시리우스!",
    });
    expect(watcher.of("say")).toHaveLength(1);
    // 늦게 온 사람은 앞 말을 받지 않는다
    const late = new FakeRes();
    hub.connect(ROUND, asRes(late), undefined);
    expect(late.of("say")).toHaveLength(0);
    expect(JSON.stringify(late.of("hello")[0])).not.toContain("시리우스");
  });

  it("보는 연결이 가득 차도 표 가진 사람은 들어오고, 표 하나의 탭 수는 따로 묶는다", async () => {
    const small = smallHub({ maxWatchers: 2, connectionsPerPass: 2 });
    const { nonce } = small.challenge(ROUND);
    const a = await small.issuePass(ROUND, {
      pub: alice.publicKey,
      signature: await alice.sign(
        roomPassMessage(ROUND, Buffer.from(nonce, "base64url")),
      ),
      nonce,
    });
    const open = (pass: string | undefined) => {
      const r = new FakeRes();
      return { r, code: status(() => small.connect(ROUND, asRes(r), pass)) };
    };
    expect(open(undefined).code).toBe(200);
    const second = open(undefined);
    expect(second.code).toBe(200);
    expect(open(undefined).code).toBe(503);
    expect(open(a.pass).code).toBe(200);
    expect(open(a.pass).code).toBe(200);
    expect(open(a.pass).code).toBe(429);
    // 보는 연결 하나가 나가면 다시 받는다
    second.r.end();
    expect(open(undefined).code).toBe(200);
    small.stop();
  });

  it("봉인 뒤 응모권 목록은 방마다 한 번만 읽는다", async () => {
    let reads = 0;
    tickets = [
      {
        pub: alice.publicKey,
        numbers: [1, 2, 3, 4, 5, 6],
      } as unknown as Ticket,
    ];
    const counted = new RoomHub({
      clock,
      policy: DEFAULT_WEBAUTHN_POLICY,
      schedule: () => schedule,
      isRegistered: (p) => registered.has(toHex(p)),
      isDirector: () => false,
      sealed: () => sealed,
      tickets: () => {
        reads++;
        return tickets;
      },
      entered: (_r, p) => tickets.some((t) => toHex(t.pub) === toHex(p)),
      drawn: () => false,
    });
    const passIn = async (who: SoftPasskey) => {
      const { nonce } = counted.challenge(ROUND);
      const signature = await who.sign(
        roomPassMessage(ROUND, Buffer.from(nonce, "base64url")),
      );
      return counted.issuePass(ROUND, { pub: who.publicKey, signature, nonce });
    };
    const a = await passIn(alice);
    const b = await passIn(bob);
    counted.connect(ROUND, asRes(new FakeRes()), a.pass);
    expect(reads).toBe(0);
    sealed = true;
    clock.advance(1000);
    for (let i = 0; i < 3; i++) {
      const r = new FakeRes();
      counted.connect(ROUND, asRes(r), i === 0 ? b.pass : undefined);
      const hello = r.of("hello")[0];
      expect(hello?.picks?.byPerson[a.id]).toEqual([1, 2, 3, 4, 5, 6]);
      expect(hello?.people.find((p) => p.id === b.id)?.entered).toBe(false);
    }
    expect(reads).toBe(1);
    counted.stop();
  });

  it("40자를 넘으면 거절, 표 없이 말하면 거절", async () => {
    const a = await passFor(alice);
    expect(status(() => hub.say(ROUND, a.pass, "가".repeat(40)))).toBe(200);
    expect(status(() => hub.say(ROUND, a.pass, "가".repeat(41)))).toBe(413);
    expect(status(() => hub.say(ROUND, "남의표", "안녕"))).toBe(401);
  });

  it("말 빠르기: 몰아서 3번, 그 뒤 2.5초마다 한 번", async () => {
    const a = await passFor(alice);
    for (let i = 0; i < 3; i++)
      expect(status(() => hub.say(ROUND, a.pass, `${i}`))).toBe(200);
    expect(status(() => hub.say(ROUND, a.pass, "넷"))).toBe(429);
    clock.advance(DEFAULT_ROOM_LIMITS.sayIntervalMs);
    expect(status(() => hub.say(ROUND, a.pass, "넷"))).toBe(200);
    expect(status(() => hub.say(ROUND, a.pass, "다섯"))).toBe(429);
  });

  it("응원은 0.8초에 한 번", async () => {
    const a = await passFor(alice);
    expect(status(() => hub.cheer(ROUND, a.pass, "meteor", null))).toBe(200);
    expect(status(() => hub.cheer(ROUND, a.pass, "meteor", null))).toBe(429);
    clock.advance(DEFAULT_ROOM_LIMITS.cheerIntervalMs);
    expect(status(() => hub.cheer(ROUND, a.pass, "meteor", null))).toBe(200);
  });

  it("응원은 1초마다 수로 묶어 한 소식, 방에 없는 얼굴의 반짝임은 세지 않는다", async () => {
    const a = await passFor(alice);
    const b = await passFor(bob);
    const ra = new FakeRes();
    const rb = new FakeRes();
    hub.connect(ROUND, asRes(ra), a.pass);
    hub.connect(ROUND, asRes(rb), b.pass);
    hub.cheer(ROUND, a.pass, "meteor", null);
    hub.cheer(ROUND, b.pass, "twinkle", a.id);
    clock.advance(DEFAULT_ROOM_LIMITS.cheerIntervalMs);
    hub.cheer(ROUND, a.pass, "twinkle", "없는사람");
    hub.cheer(ROUND, b.pass, "twinkle", a.id);
    // 한 사람씩 보내던 소식은 더 보내지 않는다
    expect(ra.of("cheer")).toEqual([]);
    expect(ra.of("cheers")).toEqual([]);
    clock.advance(1000);
    expect(ra.of("cheers")).toEqual([
      { type: "cheers", meteor: 1, twinkle: { [a.id]: 2 } },
    ]);
    expect(rb.of("cheers")).toEqual(ra.of("cheers"));
    // 응원이 없던 사이에는 보내지 않는다
    clock.advance(3000);
    expect(ra.of("cheers")).toHaveLength(1);
  });

  it("방 전체 말이 상한을 넘으면 429, 그 사람의 몫은 줄지 않는다", async () => {
    const small = smallHub({ roomSayBurst: 2, roomSayIntervalMs: 1000 });
    const { nonce: n1 } = small.challenge(ROUND);
    const a = await small.issuePass(ROUND, {
      pub: alice.publicKey,
      signature: await alice.sign(
        roomPassMessage(ROUND, Buffer.from(n1, "base64url")),
      ),
      nonce: n1,
    });
    const { nonce: n2 } = small.challenge(ROUND);
    const b = await small.issuePass(ROUND, {
      pub: bob.publicKey,
      signature: await bob.sign(
        roomPassMessage(ROUND, Buffer.from(n2, "base64url")),
      ),
      nonce: n2,
    });
    expect(status(() => small.say(ROUND, a.pass, "하나"))).toBe(200);
    expect(status(() => small.say(ROUND, a.pass, "둘"))).toBe(200);
    expect(status(() => small.say(ROUND, b.pass, "셋"))).toBe(429);
    clock.advance(1000);
    // 방 몫이 다시 찼고, 밀렸던 bob의 몫(몰아서 3번)은 그대로다
    expect(status(() => small.say(ROUND, b.pass, "셋"))).toBe(200);
    clock.advance(1000);
    expect(status(() => small.say(ROUND, b.pass, "넷"))).toBe(200);
    small.stop();
  });

  it("defer가 있으면 같은 차례의 소식을 연결마다 한 번에 쓰고, 그 사이 들어온 연결에는 인사 뒤 소식만", async () => {
    const queued: (() => void)[] = [];
    const deferred = new RoomHub({
      clock,
      policy: DEFAULT_WEBAUTHN_POLICY,
      schedule: () => schedule,
      isRegistered: (p) => registered.has(toHex(p)),
      isDirector: () => false,
      sealed: () => false,
      tickets: () => [],
      entered: () => false,
      drawn: () => false,
      defer: (fn) => queued.push(fn),
    });
    const run = () => {
      for (const fn of queued.splice(0)) fn();
    };
    const { nonce } = deferred.challenge(ROUND);
    const a = await deferred.issuePass(ROUND, {
      pub: alice.publicKey,
      signature: await alice.sign(
        roomPassMessage(ROUND, Buffer.from(nonce, "base64url")),
      ),
      nonce,
    });
    const early = new FakeRes();
    let writes = 0;
    const write = early.write.bind(early);
    early.write = (chunk: string) => {
      writes++;
      return write(chunk);
    };
    deferred.connect(ROUND, asRes(early), undefined);
    writes = 0;
    deferred.say(ROUND, a.pass, "하나");
    deferred.say(ROUND, a.pass, "둘");
    expect(early.of("say")).toEqual([]);
    // 모으는 사이에 들어온 우주인: 인사를 바로 받고, 앞의 두 말은 받지 않는다. 다른 연결은 그의 들어옴을 받는다
    const late = new FakeRes();
    deferred.connect(ROUND, asRes(late), a.pass);
    expect(late.of("hello")).toHaveLength(1);
    deferred.say(ROUND, a.pass, "셋");
    run();
    expect(writes).toBe(1);
    expect(early.of("say").map((e) => e.text)).toEqual(["하나", "둘", "셋"]);
    expect(early.of("join").map((e) => e.person.id)).toEqual([a.id]);
    expect(late.of("say").map((e) => e.text)).toEqual(["셋"]);
    expect(late.of("join")).toEqual([]);
    deferred.stop();
  });

  it("쓰기가 쌓여 상한을 넘은 연결은 끊고 방에서 뺀다", async () => {
    const small = smallHub({ maxBufferedBytes: 1000 });
    const slow = new FakeRes() as FakeRes & {
      writableLength: number;
      destroyed: boolean;
      destroy: () => void;
    };
    slow.writableLength = 0;
    slow.destroyed = false;
    slow.destroy = () => {
      slow.destroyed = true;
      slow.emit("close");
    };
    const fast = new FakeRes();
    small.connect(ROUND, asRes(slow), undefined);
    small.connect(ROUND, asRes(fast), undefined);
    clock.advance(1000);
    expect(slow.of("watchers").at(-1)).toMatchObject({ count: 2 });
    slow.writableLength = 1001;
    clock.advance(15_000);
    expect(slow.destroyed).toBe(true);
    clock.advance(1000);
    expect(fast.of("watchers").at(-1)).toMatchObject({ count: 1 });
    small.stop();
  });
});

describe("봉인·추첨·닫기", () => {
  it("봉인 전에는 고른 별을 보내지 않고, 봉인 뒤 별마다 수와 방 안 사람의 6개", async () => {
    const a = await passFor(alice);
    tickets = [
      {
        pub: alice.publicKey,
        numbers: [1, 2, 3, 4, 5, 6],
      } as unknown as Ticket,
      {
        pub: stranger.publicKey,
        numbers: [1, 7, 8, 9, 10, 11],
      } as unknown as Ticket,
    ];
    const ra = new FakeRes();
    hub.connect(ROUND, asRes(ra), a.pass);
    const hello = ra.of("hello")[0];
    expect(hello?.picks).toBeNull();
    expect(hello?.people[0]?.entered).toBe(true);
    sealed = true;
    clock.advance(1000);
    const picks = ra.of("sealed")[0]?.picks;
    expect(picks?.counts[1]).toBe(2);
    expect(picks?.byPerson[a.id]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Object.keys(picks?.byPerson ?? {})).toHaveLength(1);
  });

  it("봉인 뒤 언덕에 오른 사람은 들어옴 소식에 고른 별을 싣는다(먼저 와 있던 화면이 등수를 알게)", async () => {
    const a = await passFor(alice);
    tickets = [
      { pub: bob.publicKey, numbers: [1, 2, 3, 4, 5, 6] } as unknown as Ticket,
    ];
    const ra = new FakeRes();
    hub.connect(ROUND, asRes(ra), a.pass);
    // 봉인 전: 예측한 사람이 들어와도 고른 별은 없다
    const b = await passFor(bob);
    const early = new FakeRes();
    hub.connect(ROUND, asRes(early), b.pass);
    expect(ra.of("join")[0]?.person).toMatchObject({ entered: true });
    expect(ra.of("join")[0]?.person.picks).toBeUndefined();
    early.end();
    sealed = true;
    clock.advance(1000);
    // 봉인 뒤 다시 오르면 실린다
    hub.connect(ROUND, asRes(new FakeRes()), b.pass);
    expect(ra.of("join")).toHaveLength(2);
    const join = ra.of("join")[1];
    expect(join?.person).toMatchObject({
      entered: true,
      picks: [1, 2, 3, 4, 5, 6],
    });
    // 예측하지 않은 사람은 봉인 뒤에도 없다
    expect(ra.of("hello")[0]?.people[0]?.picks).toBeUndefined();
  });

  it("관측 시각이 지나도 닫히기 전까지는 늦게 와서 보고, 언덕에 오르고, 말한다", async () => {
    const a = await passFor(alice);
    clock.advance((DRAW_AT - (times.opensAt + 10)) * 1000);
    // 관측 도중: 보는 연결과 새 표 모두 된다
    const watcher = new FakeRes();
    hub.connect(ROUND, asRes(watcher), undefined);
    expect(watcher.status).toBe(200);
    const b = await passFor(bob);
    const rb = new FakeRes();
    hub.connect(ROUND, asRes(rb), b.pass);
    expect(rb.status).toBe(200);
    expect(watcher.of("join").map((e) => e.person.id)).toEqual([b.id]);
    // 추첨 전 표도 그대로 다시 들어온다
    const back = new FakeRes();
    hub.connect(ROUND, asRes(back), a.pass);
    expect(back.status).toBe(200);
    drawn = true;
    clock.advance(1000);
    expect(back.of("drawn")).toHaveLength(1);
    // 관측이 끝난 뒤(닫히기 직전)에도 처음 오른 사람이 말할 수 있다
    clock.advance(DEFAULT_ROOM_LIMITS.closeAfterMs - 2000);
    const late = await passFor(stranger).catch((e) => e);
    expect(late).toMatchObject({ status: 403 }); // 등록하지 않은 열쇠는 여전히 거절
    registered.add(toHex(stranger.publicKey));
    const s = await passFor(stranger);
    const rs = new FakeRes();
    hub.connect(ROUND, asRes(rs), s.pass);
    expect(rs.of("hello")[0]?.drawn).toBe(true);
    hub.say(ROUND, s.pass, "늦었지만 봤어요");
    expect(back.of("say").at(-1)).toMatchObject({ from: s.id });
  });

  it("닫힌 뒤에는 보는 연결도, 새 표도, 말도 거절한다", async () => {
    const a = await passFor(alice);
    const back = new FakeRes();
    hub.connect(ROUND, asRes(back), a.pass);
    clock.advance(
      (DRAW_AT - (times.opensAt + 10)) * 1000 +
        DEFAULT_ROOM_LIMITS.closeAfterMs,
    );
    expect(back.of("closed")).toHaveLength(1);
    expect(back.ended).toBe(true);
    expect(status(() => hub.say(ROUND, a.pass, "끝"))).toBe(410);
    expect(status(() => hub.challenge(ROUND))).toBe(410);
    expect(
      status(() => hub.connect(ROUND, asRes(new FakeRes()), undefined)),
    ).toBe(410);
  });
});

describe("국장 조치", () => {
  async function modded(
    action: "hide" | "kick",
    target: string,
    who = director,
  ) {
    const { nonce } = hub.challenge(ROUND);
    const signature = await who.sign(
      roomModMessage(ROUND, action, target, Buffer.from(nonce, "base64url")),
    );
    return hub.moderate(ROUND, {
      pub: who.publicKey,
      signature,
      nonce,
      action,
      target,
    });
  }

  it("국장은 말을 가리고 사람을 내보낸다. 국장이 아니면 거절", async () => {
    const a = await passFor(alice);
    const ra = new FakeRes();
    const watcher = new FakeRes();
    hub.connect(ROUND, asRes(ra), a.pass);
    hub.connect(ROUND, asRes(watcher), undefined);
    const { id } = hub.say(ROUND, a.pass, "광고입니다");
    await modded("hide", id);
    expect(watcher.of("hide")[0]?.id).toBe(id);
    await expect(modded("kick", a.id, alice)).rejects.toMatchObject({
      status: 403,
    });
    await modded("kick", a.id);
    expect(ra.ended).toBe(true);
    expect(watcher.of("kicked")[0]?.id).toBe(a.id);
    expect(status(() => hub.say(ROUND, a.pass, "다시"))).toBe(401);
  });
});

describe("신고", () => {
  it("이 방에서 나간 말의 번호만 받고, 국장 화면에 사람 수를 보낸다", async () => {
    const a = await passFor(alice);
    const b = await passFor(bob);
    const d = await passFor(director);
    const rd = new FakeRes();
    hub.connect(ROUND, asRes(rd), d.pass);
    const { id } = hub.say(ROUND, a.pass, "광고입니다");
    for (const bad of [
      `${ROUND}-0`,
      `${ROUND}-2`,
      `${ROUND + 1}-1`,
      "x",
      `${ROUND}-1 `,
      42,
    ])
      expect(status(() => hub.report(ROUND, b.pass, bad))).toBe(400);
    expect(hub.report(ROUND, b.pass, id)).toEqual({ count: 1 });
    // 같은 사람이 다시 신고해도 한 사람
    expect(hub.report(ROUND, b.pass, id)).toEqual({ count: 1 });
    expect(hub.report(ROUND, a.pass, id)).toEqual({ count: 2 });
    expect(JSON.stringify(rd.events)).toContain(`"count":2`);
  });

  it("신고 빠르기: 몰아서 5번, 그 뒤 2초마다 한 번", async () => {
    const a = await passFor(alice);
    const b = await passFor(bob);
    const { id } = hub.say(ROUND, a.pass, "안녕");
    for (let i = 0; i < DEFAULT_ROOM_LIMITS.reportBurst; i++)
      expect(status(() => hub.report(ROUND, b.pass, id))).toBe(200);
    expect(status(() => hub.report(ROUND, b.pass, id))).toBe(429);
    // 다른 사람의 몫은 따로
    expect(status(() => hub.report(ROUND, a.pass, id))).toBe(200);
    clock.advance(DEFAULT_ROOM_LIMITS.reportIntervalMs);
    expect(status(() => hub.report(ROUND, b.pass, id))).toBe(200);
    expect(status(() => hub.report(ROUND, b.pass, id))).toBe(429);
  });

  it("세어 두는 말 수에 상한이 있고, 넘으면 오래된 말부터 버린다", async () => {
    const small = smallHub({
      sayBurst: 10,
      reportBurst: 10,
      maxReportedMessages: 2,
    });
    const passIn = async (who: SoftPasskey) => {
      const { nonce } = small.challenge(ROUND);
      const signature = await who.sign(
        roomPassMessage(ROUND, Buffer.from(nonce, "base64url")),
      );
      return small.issuePass(ROUND, { pub: who.publicKey, signature, nonce });
    };
    const a = await passIn(alice);
    const b = await passIn(bob);
    const [first, second, third] = [1, 2, 3].map(
      (i) => small.say(ROUND, a.pass, `${i}`).id,
    );
    expect(small.report(ROUND, a.pass, first)).toEqual({ count: 1 });
    expect(small.report(ROUND, a.pass, second)).toEqual({ count: 1 });
    expect(small.report(ROUND, b.pass, second)).toEqual({ count: 2 });
    // 셋째 말을 세면 첫 말이 버려진다. 둘째 말은 남아 있다
    small.report(ROUND, a.pass, third);
    expect(small.report(ROUND, b.pass, second)).toEqual({ count: 2 });
    expect(small.report(ROUND, b.pass, first)).toEqual({ count: 1 });
    small.stop();
  });
});

describe("관측지 요약 한 줄(docs/33 11절)", () => {
  it("닫힐 때 가장 많았던 보는 사람·얼굴, 언덕에 오른 사람, 말·신고·응원 수만 남긴다", async () => {
    hub.stop();
    const logs: string[] = [];
    hub = new RoomHub({
      clock,
      policy: DEFAULT_WEBAUTHN_POLICY,
      schedule: () => schedule,
      isRegistered: (p) => registered.has(toHex(p)),
      isDirector: () => false,
      sealed: () => sealed,
      tickets: () => tickets,
      entered: () => false,
      drawn: () => drawn,
      log: (m) => logs.push(m),
    });
    const a = await passFor(alice);
    const b = await passFor(bob);
    const ra = new FakeRes();
    const ra2 = new FakeRes();
    const rb = new FakeRes();
    const w1 = new FakeRes();
    const w2 = new FakeRes();
    hub.connect(ROUND, asRes(w1), undefined);
    hub.connect(ROUND, asRes(w2), undefined);
    hub.connect(ROUND, asRes(ra), a.pass);
    // 같은 사람의 탭 둘은 얼굴 하나
    hub.connect(ROUND, asRes(ra2), a.pass);
    hub.connect(ROUND, asRes(rb), b.pass);
    w2.end();
    const said = hub.say(ROUND, a.pass, "시리우스!");
    hub.say(ROUND, b.pass, "카노푸스는 안 보여요");
    hub.report(ROUND, b.pass, said.id);
    hub.cheer(ROUND, a.pass, "meteor", null);
    hub.cheer(ROUND, b.pass, "twinkle", a.id);
    expect(logs).toEqual([]);
    clock.advance(
      (DRAW_AT - (times.opensAt + 10)) * 1000 +
        DEFAULT_ROOM_LIMITS.closeAfterMs,
    );
    expect(logs).toHaveLength(1);
    const line = logs[0] as string;
    expect(line.startsWith("관측지 ")).toBe(true);
    expect(JSON.parse(line.slice("관측지 ".length))).toEqual({
      round: ROUND,
      peakWatchers: 2,
      peakFaces: 2,
      hill: 2,
      says: 2,
      reported: 1,
      meteors: 1,
      twinkles: 1,
    });
    // 말 내용·열쇠는 없다
    expect(line).not.toContain("시리우스");
    expect(line).not.toContain(toHex(alice.publicKey).slice(0, 16));
  });
});
