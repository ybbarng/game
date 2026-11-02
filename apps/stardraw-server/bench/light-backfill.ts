/**
 * 운영 장부에 가벼운 기록을 처음 붙이는 연습(docs/36 11-30 구현 4단계, 「운영 장부에 처음 붙일 때」).
 * 공개 장부 파일(genesis·head·회차·봉인)을 서버에서 GET으로만 받아 앵커 저장소와 같은 폴더 모양
 * (<out>/ledgers/<장부 id>/ledger/…)으로 쓰고, 서버가 띄울 때 하는 것과 같은 `Publisher.lights`로 가벼운 기록을 채운다.
 * 채운 기록이 회차 파일의 기록과 같은 글인지 보고, 걸린 시간과 크기를 적는다.
 * 그 뒤 터미널 검사기로 그 폴더를 검사하면 요약 대조까지 본다:
 *   node packages/stardraw-cli/dist/stardraw-verify.mjs --source <out>
 *
 * 묶기: pnpm -C apps/stardraw-server exec rolldown -c bench/rolldown.bench.mjs
 * 실행: nice -n 15 node apps/stardraw-server/dist/bench/light-backfill.js --base https://game.byb.kr/stardraw-api --out <빈 폴더>
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  ledgerId,
  lightFileName,
  loadRoundFiles,
  type Schedule,
} from "@game/stardraw-core";
import { Publisher, pad } from "../src/publish";
import { arg, kb } from "./common";

const fileText = (value: unknown) => `${JSON.stringify(value)}\n`;

async function main() {
  const base = arg("base", "https://game.byb.kr/stardraw-api");
  const out = arg("out", "");
  if (!out) throw new Error("--out <빈 폴더>를 주세요");
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${base}${path}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  };
  const genesis = await get<{ v: 1; schedule: Schedule }>(
    "/ledger/genesis.json",
  );
  const head = await get<{ rounds: number }>("/ledger/head.json");
  const id = ledgerId(genesis.schedule);
  const dir = join(out, "ledgers", id, "ledger");
  for (const sub of ["rounds", "seals"])
    mkdirSync(join(dir, sub), { recursive: true });
  writeFileSync(join(dir, "genesis.json"), fileText(genesis));
  writeFileSync(join(dir, "head.json"), fileText(head));
  const t0 = performance.now();
  const files = await loadRoundFiles(base, fetch, 1, head.rounds, {
    seals: true,
  });
  for (const [i, f] of files.entries()) {
    writeFileSync(join(dir, "rounds", `${pad(i + 1)}.json`), fileText(f.round));
    writeFileSync(join(dir, "seals", `${pad(i + 1)}.json`), fileText(f.seal));
  }
  const downloaded = performance.now() - t0;

  const t1 = performance.now();
  new Publisher(dir).lights(head.rounds);
  const filled = performance.now() - t1;

  let same = 0;
  for (let r = 1; r <= head.rounds; r++) {
    const light = JSON.parse(readFileSync(join(dir, lightFileName(r)), "utf8"));
    const round = JSON.parse(
      readFileSync(join(dir, "rounds", `${pad(r)}.json`), "utf8"),
    );
    if (light.record === round.record && light.round === r) same++;
  }
  const size = (sub: string) =>
    readdirSync(join(dir, sub), { recursive: true })
      .map((f) => join(dir, sub, String(f)))
      .filter((p) => statSync(p).isFile())
      .reduce((n, p) => n + statSync(p).size, 0);
  console.log(
    JSON.stringify(
      {
        ledger: id,
        rounds: head.rounds,
        tickets: files.reduce((n, f) => n + f.round.tickets.length, 0),
        downloadMs: Math.round(downloaded),
        fillMs: Math.round(filled),
        sameRecord: `${same}/${head.rounds}`,
        roundsSize: kb(size("rounds")),
        sealsSize: kb(size("seals")),
        lightSize: kb(size("light")),
        folder: out,
      },
      null,
      2,
    ),
  );
}

await main();
