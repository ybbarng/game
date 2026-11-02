/**
 * 예측서를 쏟아붓는 쪽(stress.ts가 띄운다). blast.ts의 jitter(지금 화면 `remote-ledger.ts` retryDelay)와 같고,
 * 서버가 503으로 돌려보낸 **응답 수**를 모두 센다(`/api/state` entryBusyRecent와 맞춰 보려고).
 *
 *   node entries.js --url … --load 파일 --close-at-ms <마감의 실제 ms> --window 60 --arrival spike|uniform
 */
import { readFileSync } from "node:fs";
import { arg } from "./common";

async function main() {
  const url = arg("url", "http://127.0.0.1:8790/stardraw-api");
  const load = JSON.parse(readFileSync(arg("load", ""), "utf8")) as unknown[];
  const closeAt = Number(arg("close-at-ms", "0"));
  const window = Number(arg("window", "60"));
  const arrival = arg("arrival", "uniform");
  const start = closeAt - window * 1000;
  const sleep = (ms: number) =>
    new Promise((r) => setTimeout(r, Math.max(0, ms)));
  let r503 = 0;
  const statuses: Record<string, number> = {};
  const errors: Record<string, number> = {};
  const send = async (body: string) => {
    try {
      const res = await fetch(`${url}/api/enter`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const text = await res.text();
      statuses[res.status] = (statuses[res.status] ?? 0) + 1;
      if (res.status === 503) r503++;
      else if (!res.ok) {
        const k = `${res.status} ${text.replace(/[0-9:T.-]{6,}/g, "…").slice(0, 60)}`;
        errors[k] = (errors[k] ?? 0) + 1;
      }
      return res.status;
    } catch (err) {
      const k = `0 ${String((err as Error).cause ?? err).slice(0, 60)}`;
      errors[k] = (errors[k] ?? 0) + 1;
      statuses[0] = (statuses[0] ?? 0) + 1;
      return 0;
    }
  };
  const latencies: number[] = [];
  const doneAts: number[] = [];
  let accepted = 0;
  let gaveUp = 0;
  const one = async (i: number) => {
    const offset = arrival === "spike" ? 0 : (i / load.length) * window * 1000;
    await sleep(start + offset - Date.now());
    const body = JSON.stringify(load[i]);
    const t0 = Date.now();
    let status = await send(body);
    for (let k = 1; status === 503; k++) {
      const wait = 1000 + Math.random() * 3000 + 500 * (Math.min(k, 4) - 1);
      if (Date.now() + wait > closeAt - 5000) break;
      await sleep(wait);
      status = await send(body);
    }
    if (status === 200) {
      accepted++;
      latencies.push(Date.now() - t0);
      doneAts.push(Date.now() - closeAt);
    } else if (status === 503) gaveUp++;
  };
  await Promise.all(load.map((_, i) => one(i)));
  latencies.sort((a, b) => a - b);
  doneAts.sort((a, b) => a - b);
  const q = (xs: number[], p: number) =>
    xs.length ? xs[Math.min(xs.length - 1, Math.floor(xs.length * p))] : null;
  console.log(
    `결과 ${JSON.stringify({
      sent: load.length,
      accepted,
      gaveUp503: gaveUp,
      responses503: r503,
      statuses,
      errors,
      latencyP50Ms: q(latencies, 0.5),
      latencyP95Ms: q(latencies, 0.95),
      latencyMaxMs: latencies.at(-1) ?? null,
      lastAcceptedMsFromClose: doneAts.at(-1) ?? null,
      firstAcceptedMsFromClose: doneAts[0] ?? null,
    })}`,
  );
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
