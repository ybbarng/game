import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  encodeOperation,
  fromBase64Url,
  fromHex,
  generateSigner,
  OP_VERSION,
  roundTimes,
  type Schedule,
  type SoftPasskey,
  sealFingerprint,
  signAsDirector,
  softPasskeySigner,
  toBase64Url,
  verifyLedger,
  verifyReceipt,
} from "@game/stardraw-core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createNextServerKey,
  loadNextServerKey,
  loadServerKey,
  newServerKeyPkcs8,
  type ServerKey,
  serverKeyFromPkcs8,
} from "./server-key";
import {
  enter,
  makeRig,
  player,
  type Rig,
  readLedger,
  SCHEDULE,
  TEST_POW,
} from "./testing";

/**
 * 관인 교체(docs/36 11-25). 설정의 국장 열쇠는 1회차 기록에 관인 지정으로 실려 5회차부터 쓴다.
 * 5회차 기록에 국장이 관인 교체를 실으면 9회차부터 다음 관인 열쇠로 서명한다(다시 띄우지 않고)
 */

const TRIAL: Schedule = {
  ...SCHEDULE,
  entries: SCHEDULE.entries.map((e) => ({ ...e, phase: "trial" as const })),
};

let rig: Rig | undefined;
let director: SoftPasskey;
let nextKey: ServerKey;
beforeAll(async () => {
  director = softPasskeySigner(await generateSigner());
  nextKey = await serverKeyFromPkcs8(await newServerKeyPkcs8());
});
afterEach(() => {
  rig?.close();
  rig = undefined;
});

async function finishThrough(r: Rig, round: number): Promise<void> {
  for (let k = r.store.recordCount() + 1; k <= round; k++) await r.finish(k);
}

/** 관리 화면이 하는 일: 상태의 nextSeal로 교체 기록을 만들어 국장 패스키로 서명해 보낸다 */
async function requestRotation(r: Rig): Promise<void> {
  const state = await r.engine.directorState();
  if (!state.nextSeal) throw new Error("nextSeal 없음");
  const op = await signAsDirector(
    {
      v: OP_VERSION,
      kind: "seal-rotate",
      after: fromHex(state.view.next.after),
      effectiveRound: state.view.next.earliestEffectiveRound,
      pub: fromBase64Url(state.nextSeal.pub),
      proof: fromBase64Url(state.nextSeal.proof),
    },
    director,
  );
  await r.engine.submitDirectorOp(encodeOperation(op), "203.0.113.9");
}

describe("관인 교체(서버)", () => {
  it("국장 요청으로 실리고, 효력 회차부터 다음 관인 열쇠로 영수증·head.json에 서명하며 장부 검사를 통과한다", async () => {
    rig = await makeRig({
      schedule: TRIAL,
      nextServerKey: nextKey,
      directorKeys: [
        { credentialId: director.credentialId, pub: director.publicKey },
      ],
    });
    const r = rig;
    expect(r.logs).toContain(
      `관인 지문(지금 열쇠 파일) ${sealFingerprint(r.serverKey.publicKey)}`,
    );
    expect(r.logs).toContain(
      `관인 지문(다음 열쇠 파일) ${sealFingerprint(nextKey.publicKey)}`,
    );
    await finishThrough(r, 4);
    await r.at(roundTimes(r.engine.schedule(), 5).opensAt + 10);
    expect((await r.engine.directorState()).nextSeal).toMatchObject({
      pub: toBase64Url(nextKey.publicKey),
      fingerprint: sealFingerprint(nextKey.publicKey),
    });
    await requestRotation(r);
    await r.finish(5);
    expect(r.store.record(5)?.operations?.[0]).toMatchObject({
      kind: "seal-rotate",
      effectiveRound: 9,
    });
    // 실린 뒤에는 더 내놓지 않는다
    expect((await r.engine.directorState()).nextSeal).toBeNull();
    expect(r.engine.state().pending).toBe(1);

    // 8회차까지는 지금 열쇠
    await finishThrough(r, 7);
    await r.at(roundTimes(r.engine.schedule(), 8).opensAt + 10);
    const alice = await player();
    const before = await enter(r, alice, [1, 2, 3, 4, 5, 6]);
    expect(await verifyReceipt(r.serverKey.publicKey, before.receipt)).toBe(
      true,
    );
    expect(r.engine.state().serverKey).toBe(toBase64Url(r.serverKey.publicKey));
    // 9회차가 열리면 다시 띄우지 않아도 다음 관인 열쇠
    await r.finish(8);
    expect(readLedger(r.dir).head.serverKey).toBe(
      toBase64Url(nextKey.publicKey),
    );
    await r.at(roundTimes(r.engine.schedule(), 9).opensAt + 10);
    expect(r.engine.state().serverKey).toBe(toBase64Url(nextKey.publicKey));
    const after = await enter(r, alice, [1, 2, 3, 4, 5, 7]);
    expect(await verifyReceipt(nextKey.publicKey, after.receipt)).toBe(true);
    expect(await verifyReceipt(r.serverKey.publicKey, after.receipt)).toBe(
      false,
    );
    await r.finish(9);
    const ledger = readLedger(r.dir);
    const report = await verifyLedger(
      ledger.genesis,
      ledger.records,
      ledger.tickets,
      ledger.registrations,
      { beaconVerifier: () => true, powParams: TEST_POW },
    );
    expect(report.problems).toEqual([]);
    expect(report.operations.seals.map((x) => x.from)).toEqual([1, 9]);
  }, 20_000);

  it("교체 뒤 다음 열쇠 파일 없이 옛 열쇠로 다시 띄우면 서버가 뜨지 않는다", async () => {
    const first = await makeRig({
      schedule: TRIAL,
      nextServerKey: nextKey,
      directorKeys: [
        { credentialId: director.credentialId, pub: director.publicKey },
      ],
    });
    rig = first;
    await finishThrough(first, 4);
    await first.at(roundTimes(first.engine.schedule(), 5).opensAt + 10);
    await requestRotation(first);
    await finishThrough(first, 8);
    first.store.close();
    rig = undefined;
    const headBefore = readLedger(first.dir).head;
    await expect(
      makeRig({
        schedule: TRIAL,
        dir: first.dir,
        serverKey: first.serverKey,
        at: Math.floor(first.clock.now() / 1000),
        directorKeys: [
          { credentialId: director.credentialId, pub: director.publicKey },
        ],
      }),
    ).rejects.toThrow(
      `서버를 띄우지 않는다: 장부가 정한 9회차 관인 ${sealFingerprint(nextKey.publicKey)}의 열쇠 파일이 없다`,
    );
    // 거절한 서버는 head.json을 다시 쓰지 않는다
    expect(readLedger(first.dir).head).toEqual(headBefore);
    // 정리한 뒤(다음 열쇠를 지금 열쇠로) 다시 띄우면 오류가 없다
    const fixed = await makeRig({
      schedule: TRIAL,
      dir: first.dir,
      serverKey: nextKey,
      at: Math.floor(first.clock.now() / 1000),
      directorKeys: [
        { credentialId: director.credentialId, pub: director.publicKey },
      ],
    });
    rig = fixed;
    expect(fixed.logs.join("\n")).not.toContain("오류:");
    expect(fixed.engine.state().serverKey).toBe(toBase64Url(nextKey.publicKey));
  }, 20_000);
});

describe("띄울 때 관인 대조", () => {
  it("관인 운영 기록이 없는 장부는 지난번 head.json의 관인과 대조한다. 리허설(log)은 띄운다", async () => {
    const first = await makeRig();
    rig = first;
    await first.finish(1);
    first.store.close();
    rig = undefined;
    const other = await serverKeyFromPkcs8(await newServerKeyPkcs8());
    await expect(
      makeRig({
        dir: first.dir,
        serverKey: other,
        at: Math.floor(first.clock.now() / 1000),
      }),
    ).rejects.toThrow(
      `서버를 띄우지 않는다: 지난번 공개한 관인 ${sealFingerprint(first.serverKey.publicKey)}의 열쇠 파일이 없다`,
    );
    rig = await makeRig({
      dir: first.dir,
      serverKey: other,
      at: Math.floor(first.clock.now() / 1000),
      sealKeyMismatch: "log",
    });
    expect(rig.engine.sealKeyProblem()).toContain("지난번 공개한 관인");
  });

  it("빈 장부의 첫 시작은 대조할 것이 없고, 같은 데이터 폴더의 열쇠 파일로 다시 띄우면 그대로 뜬다", async () => {
    const first = await makeRig();
    rig = first;
    expect(first.engine.sealKeyProblem()).toBeNull();
    await first.finish(1);
    first.store.close();
    rig = await makeRig({
      dir: first.dir,
      at: Math.floor(first.clock.now() / 1000),
    });
    expect(rig.serverKey.publicKey).toEqual(first.serverKey.publicKey);
    expect(rig.engine.sealKeyProblem()).toBeNull();
  });
});

describe("관인 열쇠 파일 만들기", () => {
  it("장부에 기록이 있으면 새로 만들지 않고 거절, 비었으면 만든다", async () => {
    const dir = mkdtempSync(join(tmpdir(), "stardraw-key-"));
    try {
      const path = join(dir, "server-key.pkcs8");
      await expect(loadServerKey(path, true, true)).rejects.toThrow(
        "장부에 이미 기록이 있어 새로 만들지 않는다",
      );
      expect(existsSync(path)).toBe(false);
      await expect(loadServerKey(path, false)).rejects.toThrow(
        "서버 열쇠 파일이 없다",
      );
      const made = await loadServerKey(path, true, false);
      // 이미 있으면 장부와 상관없이 읽는다
      expect((await loadServerKey(path, true, true)).publicKey).toEqual(
        made.publicKey,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("다음 관인 열쇠 파일", () => {
  it("만들 때 이미 있으면 덮어쓰지 않고, 없으면 읽기는 null", async () => {
    const dir = mkdtempSync(join(tmpdir(), "stardraw-seal-"));
    try {
      const path = join(dir, "server-key.next.pkcs8");
      expect(await loadNextServerKey(path)).toBeNull();
      const pub = await createNextServerKey(path);
      expect(existsSync(path)).toBe(true);
      const before = readFileSync(path, "utf8");
      await expect(createNextServerKey(path)).rejects.toThrow(/이미 있다/);
      expect(readFileSync(path, "utf8")).toBe(before);
      expect((await loadNextServerKey(path))?.publicKey).toEqual(pub);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
