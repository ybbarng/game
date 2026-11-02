/**
 * 관측지 연결을 들고 있는 쪽(stress.ts가 여러 개 띄운다, docs/36 11-30 측정). 보는 연결 n개와 표 가진 연결(표 파일)을
 * 열고, 받은 소식 수·바이트·인사(첫 줄)까지 걸린 시간·말이 닿기까지 걸린 시간을 5초마다 한 줄로 낸다.
 * 말 지연은 말하는 쪽이 말 안에 적은 보낸 시각(`t<ms>`)으로 잰다(서버 시계를 건너뛰어도 맞게).
 *
 *   node watchers.js --url http://127.0.0.1:8790/stardraw-api --round 2 --n 500 [--passes 파일] [--ramp-ms 5000]
 */
import { readFileSync } from "node:fs";
import { Agent, request } from "node:http";
import { arg } from "./common";

const url = new URL(arg("url", "http://127.0.0.1:8790/stardraw-api"));
const round = Number(arg("round", "2"));
const n = Number(arg("n", "100"));
const passesFile = arg("passes", "");
const rampMs = Number(arg("ramp-ms", "5000"));
const label = arg("label", "w");
const passes: string[] = passesFile
  ? (JSON.parse(readFileSync(passesFile, "utf8")) as string[])
  : [];

const agent = new Agent({ keepAlive: false, maxSockets: Infinity });

let open = 0;
const failed: Record<string, number> = {};
let closedByServer = 0;
let events = 0;
let bytes = 0;
const hello: number[] = [];
let sayLags: number[] = [];
let allSayLags: number[] = [];
let sayCount = 0;

const q = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? null;
};

function connect(pass: string | undefined): void {
  const body = JSON.stringify(pass ? { pass } : {});
  const t0 = performance.now();
  const req = request(
    {
      agent,
      host: url.hostname,
      port: url.port,
      path: `${url.pathname}/api/room/${round}/events`,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      },
    },
    (res) => {
      if (res.statusCode !== 200) {
        failed[res.statusCode ?? 0] = (failed[res.statusCode ?? 0] ?? 0) + 1;
        res.resume();
        return;
      }
      open++;
      let first = true;
      let buf = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        if (first) {
          hello.push(performance.now() - t0);
          first = false;
        }
        bytes += chunk.length;
        buf += chunk;
        let i = buf.indexOf("\n\n");
        while (i >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 2);
          events++;
          if (line.includes('"type":"say"')) {
            const m = /"text":"t(\d+)/.exec(line);
            if (m) {
              const lag = Date.now() - Number(m[1]);
              sayLags.push(lag);
              sayCount++;
            }
          }
          i = buf.indexOf("\n\n");
        }
      });
      res.on("end", () => {
        open--;
        closedByServer++;
      });
      res.on("error", () => {});
    },
  );
  req.on("error", (err) => {
    const k = `err ${String((err as NodeJS.ErrnoException).code ?? err.message)}`;
    failed[k] = (failed[k] ?? 0) + 1;
  });
  req.end(body);
}

const total = n + passes.length;
const targets: (string | undefined)[] = [
  ...passes,
  ...Array.from({ length: n }, () => undefined),
];
let k = 0;
const step = Math.max(1, Math.ceil(total / Math.max(1, rampMs / 20)));
const ramp = setInterval(() => {
  for (let j = 0; j < step && k < targets.length; j++, k++) connect(targets[k]);
  if (k >= targets.length) clearInterval(ramp);
}, 20);

const report = (final: boolean) => {
  if (final) allSayLags = allSayLags.concat(sayLags);
  const line = {
    label,
    open,
    failed,
    closedByServer,
    events,
    bytesMB: +(bytes / 1048576).toFixed(1),
    helloP50: q(hello, 0.5),
    helloP95: q(hello, 0.95),
    helloMax: hello.length ? Math.max(...hello) : null,
    says: sayCount,
    sayLagP50: q(sayLags, 0.5),
    sayLagP95: q(sayLags, 0.95),
    sayLagMax: sayLags.length ? Math.max(...sayLags) : null,
    ...(final
      ? {
          allSayLagP50: q(allSayLags, 0.5),
          allSayLagP95: q(allSayLags, 0.95),
          allSayLagMax: allSayLags.length
            ? allSayLags.reduce((a, b) => Math.max(a, b), 0)
            : null,
        }
      : {}),
  };
  console.log(`${final ? "결과" : "중간"} ${JSON.stringify(line)}`);
  // 구간 값은 비우고 전체에 모은다(전체는 표본으로 줄여 메모리를 묶는다)
  for (const x of sayLags) if (Math.random() < 0.1) allSayLags.push(x);
  sayLags = [];
};
const timer = setInterval(() => report(false), 5000);
process.on("SIGTERM", () => {
  clearInterval(timer);
  report(true);
  process.exit(0);
});
