/**
 * 관측지 인사(hello) 비용(docs/36 11-23 메모리 상한, 2026-11-03 검토 M9). 실제 저장소(SQLite)에 응모권 n장을 넣고
 * 언덕 위 얼굴 k명이 있을 때, 보는 사람 하나와 얼굴 하나가 들어올 때 걸리는 시간을 봉인 전·뒤로 잰다.
 * 들어오는 연결마다 인사에 언덕 위 사람 전체와(봉인 뒤) 고른 별이 실린다.
 *
 * 묶기: pnpm -C apps/stardraw-server exec rolldown -c bench/rolldown.bench.mjs
 * 실행: nice -n 15 node apps/stardraw-server/dist/bench/room.js [--tickets 3000] [--faces 300] [--runs 5]
 */
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ManualClock } from "@game/fair-play";
import {
  DEFAULT_WEBAUTHN_POLICY,
  entrantId,
  roomPassMessage,
  roundTimes,
  ticketId,
  toHex,
} from "@game/stardraw-core";
import { RoomHub } from "../src/room";
import { Store } from "../src/store";
import {
  arg,
  benchSchedule,
  makePlayers,
  pickNumbers,
  seeded,
  ticketOf,
} from "./common";

class NullRes extends EventEmitter {
  writeHead() {
    return this;
  }
  write() {
    return true;
  }
  end() {
    this.emit("close");
    return this;
  }
}

const median = (xs: number[]) =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

async function main() {
  const n = Number(arg("tickets", "3000"));
  const faces = Number(arg("faces", "300"));
  const runs = Number(arg("runs", "5"));
  const schedule = benchSchedule(1_800_000_000, 1200);
  const round = 1;
  const times = roundTimes(schedule, round);
  const dir = mkdtempSync(join(tmpdir(), "room-bench-"));
  const store = new Store(join(dir, "db.sqlite"));
  const rand = seeded(7);
  const players = await makePlayers(n);
  for (const p of players) {
    const t = await ticketOf(p, round, pickNumbers(rand));
    store.addEntry(
      round,
      toHex(ticketId(t)),
      toHex(entrantId(p.publicKey)),
      t,
      0,
    );
  }
  const clock = new ManualClock();
  clock.advance((times.opensAt + 10) * 1000);
  let sealed = false;
  const hub = new RoomHub({
    clock,
    policy: DEFAULT_WEBAUTHN_POLICY,
    schedule: () => schedule,
    isRegistered: () => true,
    isDirector: () => false,
    sealed: () => sealed,
    tickets: (r) => store.entries(r),
    entered: (r, pub) => store.hasEntry(r, toHex(entrantId(pub))),
    drawn: () => false,
  });
  const passes: string[] = [];
  for (const p of players.slice(0, faces)) {
    const { nonce } = hub.challenge(round);
    const signature = await p.sign(
      roomPassMessage(round, Buffer.from(nonce, "base64url")),
    );
    passes.push(
      (await hub.issuePass(round, { pub: p.publicKey, signature, nonce })).pass,
    );
  }
  const connect = (pass: string | undefined) => {
    const res = new NullRes();
    const t0 = performance.now();
    hub.connect(round, res as unknown as ServerResponse, pass);
    return { ms: performance.now() - t0, res };
  };
  // 얼굴들이 언덕에 오른다(봉인 전)
  const setup0 = performance.now();
  const held = passes.map((p) => connect(p).res);
  const setupMs = performance.now() - setup0;

  const measure = (label: string) => {
    const watch: number[] = [];
    const face: number[] = [];
    for (let i = 0; i < runs; i++) {
      const w = connect(undefined);
      watch.push(w.ms);
      w.res.end();
      // 이미 언덕에 있는 얼굴의 다른 탭(인사 + 들어옴 소식 없음)
      const f = connect(passes[i % passes.length]);
      face.push(f.ms);
      f.res.end();
    }
    console.log(
      `${label}: 보는 사람 인사 중앙값 ${median(watch).toFixed(2)}ms, 얼굴 탭 인사 중앙값 ${median(face).toFixed(2)}ms`,
    );
  };
  console.log(
    `응모권 ${n}장, 언덕 위 얼굴 ${faces}명. 얼굴 ${faces}명이 차례로 오르는 데 ${setupMs.toFixed(0)}ms`,
  );
  measure("봉인 전");
  sealed = true;
  clock.advance(1000);
  measure("봉인 뒤");
  for (const r of held) r.end();
  hub.stop();
  store.close();
  rmSync(dir, { recursive: true, force: true });
}

void main();
