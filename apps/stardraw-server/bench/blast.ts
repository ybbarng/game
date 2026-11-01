/**
 * 응모를 쏟아붓는 쪽(rush.js가 띄운다, docs/36 11-30). 503이면 다시 내고, 다른 거절은 다시 내지 않는다.
 * 도착은 uniform(마감 전 window초 동안 고르게) 또는 spike(마감 window초 전에 한꺼번에).
 * --policy now는 예전 화면(1·2·3·4초 뒤 네 번), jitter는 지금 화면(`remote-ledger.ts` retryDelay: 1~4초 무작위에
 * 차례로 0.5초씩 더함, 4번째부터 2.5~5.5초, 마감 5초 전까지, docs/36 11-31)과 같다.
 */
import { readFileSync } from "node:fs";
import { arg } from "./common";

interface Outcome {
  status: number;
  attempts: number;
  /** 첫 요청을 낸 때(마감 기준 ms, 음수면 마감 전) */
  sentAt: number;
  /** 마지막 응답을 받은 때(마감 기준 ms) */
  doneAt: number;
  error?: string;
}

async function main() {
  const url = arg("url", "http://127.0.0.1:8766/stardraw-api");
  const load = JSON.parse(readFileSync(arg("load", ""), "utf8")) as {
    ticket: string;
    registration?: string;
  }[];
  const closeAt = Number(arg("close-at-ms", "0"));
  const window = Number(arg("window", "120"));
  const arrival = arg("arrival", "uniform");
  // now: 지금 화면(1·2·3·4초 뒤 네 번), jitter: 제안(흔들어 기다리며 마감 5초 전까지)
  const policy = arg("policy", "now");
  const start = closeAt - window * 1000;
  const sleep = (ms: number) =>
    new Promise((r) => setTimeout(r, Math.max(0, ms)));

  const send = (body: string) =>
    fetch(`${url}/api/enter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

  const one = async (i: number): Promise<Outcome> => {
    const offset = arrival === "spike" ? 0 : (i / load.length) * window * 1000;
    await sleep(start + offset - Date.now());
    const body = JSON.stringify(load[i]);
    const sentAt = Date.now() - closeAt;
    let attempts = 0;
    try {
      let res = await send(body);
      attempts++;
      if (policy === "jitter") {
        // 지금 화면: 1~4초 무작위 + 차례로 0.5초씩 기다리며 마감 5초 전까지 다시 낸다(모두 같은 순간에 다시 내지 않게)
        for (let k = 1; res.status === 503; k++) {
          const wait = 1000 + Math.random() * 3000 + 500 * (Math.min(k, 4) - 1);
          if (Date.now() + wait > closeAt - 5000) break;
          await res.arrayBuffer();
          await sleep(wait);
          res = await send(body);
          attempts++;
        }
      } else {
        for (let k = 1; res.status === 503 && k <= 4; k++) {
          await res.arrayBuffer();
          await sleep(k * 1000);
          res = await send(body);
          attempts++;
        }
      }
      const text = await res.text();
      return {
        status: res.status,
        attempts,
        sentAt,
        doneAt: Date.now() - closeAt,
        ...(res.ok ? {} : { error: text.slice(0, 80) }),
      };
    } catch (err) {
      return {
        status: 0,
        attempts,
        sentAt,
        doneAt: Date.now() - closeAt,
        error: String(err).slice(0, 80),
      };
    }
  };

  const outcomes = await Promise.all(load.map((_, i) => one(i)));
  const byStatus: Record<string, number> = {};
  const errors: Record<string, number> = {};
  for (const o of outcomes) {
    byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    if (o.error) {
      const key = `${o.status} ${o.error.replace(/[0-9:T.-]{6,}/g, "…")}`;
      errors[key] = (errors[key] ?? 0) + 1;
    }
  }
  const ok = outcomes.filter((o) => o.status === 200);
  const okTimes = ok.map((o) => o.doneAt).sort((a, b) => a - b);
  const latencies = ok.map((o) => o.doneAt - o.sentAt).sort((a, b) => a - b);
  const q = (xs: number[], p: number) =>
    xs.length ? xs[Math.min(xs.length - 1, Math.floor(xs.length * p))] : null;
  // 받은 수를 초 단위로 세어 가장 많이 받은 10초 구간의 초당 수
  const buckets = new Map<number, number>();
  for (const t of okTimes) {
    const b = Math.floor(t / 1000);
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
  }
  let best10 = 0;
  for (const b of buckets.keys()) {
    let s = 0;
    for (let k = 0; k < 10; k++) s += buckets.get(b + k) ?? 0;
    best10 = Math.max(best10, s / 10);
  }
  const first503 = outcomes
    .filter((o) => o.attempts > 1 || o.status === 503)
    .map((o) => o.sentAt)
    .sort((a, b) => a - b)[0];
  const span =
    okTimes.length > 1
      ? ((okTimes.at(-1) as number) - (okTimes[0] as number)) / 1000
      : 0;
  const summary = {
    sent: load.length,
    accepted: ok.length,
    notAccepted: load.length - ok.length,
    byStatus,
    errors,
    retried: outcomes.filter((o) => o.attempts > 1).length,
    gaveUp503: outcomes.filter((o) => o.status === 503).length,
    lastAcceptedMs: okTimes.at(-1) ?? null,
    acceptedPerSecond: span > 0 ? +(ok.length / span).toFixed(1) : null,
    best10sPerSecond: +best10.toFixed(1),
    first503SentMs: first503 ?? null,
    latencyP50Ms: q(latencies, 0.5),
    latencyP95Ms: q(latencies, 0.95),
  };
  console.log(`결과 ${JSON.stringify(summary)}`);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
