import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  anchorBranch,
  anchorPath,
  type BeaconVerifier,
  entrantId,
  findGitHubLedger,
  GENESIS_ANCHOR_PATH,
  genesisHash,
  loadPublicLedger,
  type PowParams,
  type PublicLedger,
  parseGenesisAnchorFile,
  recordHash,
  STARDRAW_ANCHOR_REPO,
  sealDigest,
  sortRegistrations,
  sortTickets,
  ticketId,
  toHex,
  verifyLedger,
  type WebAuthnPolicy,
} from "@mighty/stardraw-core";

import { type HeadFile, Publisher, pad } from "./publish";
import { Store } from "./store";

/**
 * 앵커로 다시 세우기(docs/36 11-26). DB와 백업을 모두 잃었을 때 공개 장부 사본으로 DB를 다시 쓴다.
 * 되살린 DB를 장부 검사로 다시 읽어 끝 해시가 원본과 같을 때만 성공이다.
 * 앵커 진행 기록(anchored·mirrored·earlySealed·genesisAnchored)은 비워 둔다: 다시 띄운 서버가 1회차부터 앵커를 다시 남기려 하고,
 * 같은 내용이 이미 있으면 성공으로 넘어간다(어긋나면 그 자리에서 기록에 드러난다)
 */

export interface RestoreOptions {
  /** 앵커 저장소를 받은 폴더, 서버의 공개 장부 폴더, 또는 "github" */
  from: string;
  /** 만들 DB 파일(이미 있으면 거절) */
  out: string;
  /** 다시 쓸 공개 장부 폴더 */
  ledgerDir: string;
  policy: WebAuthnPolicy;
  pow: PowParams;
  /** 원본이 github일 때 앵커 저장소(기본 ybbarng/stardraw-ledger) */
  repo?: string;
  fetch?: typeof fetch;
  /** 시험만 바꿔 끼운다(기본은 quicknet BLS 확인) */
  beaconVerifier?: BeaconVerifier;
  log?: (message: string) => void;
}

export interface RestoreResult {
  rounds: number;
  head: string;
  ledger: string;
  label: string;
}

interface Source {
  label: string;
  base: string;
  fetch: typeof fetch;
  /** 원본 폴더의 장부 파일(바이트 비교용). github면 null */
  dir: string | null;
  /** 그 회차 앵커 파일이 있는지(앞선 앵커 확인). 알 수 없으면 null */
  anchored:
    | ((ledger: string, branch: string, round: number) => Promise<boolean>)
    | null;
}

const VIRTUAL = "http://restore.invalid";

/** 폴더의 장부 파일을 `${VIRTUAL}/ledger/…` 주소로 내주는 fetch(없으면 404) */
function dirFetch(dir: string): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    const rest = url.startsWith(`${VIRTUAL}/ledger/`)
      ? url.slice(`${VIRTUAL}/ledger/`.length)
      : null;
    if (rest === null || rest.includes(".."))
      return new Response("없음", { status: 404 });
    try {
      return new Response(readFileSync(join(dir, rest)));
    } catch {
      return new Response("없음", { status: 404 });
    }
  }) as typeof fetch;
}

/** 받아 둔 앵커 저장소 폴더의 장부 id: genesis.txt, 없으면 사본이 하나뿐인 장부 */
function folderLedgerId(root: string): string {
  const genesis = join(root, GENESIS_ANCHOR_PATH);
  if (existsSync(genesis)) {
    const hash = parseGenesisAnchorFile(readFileSync(genesis, "utf8"));
    if (hash) return hash.slice(0, 16);
  }
  const dir = join(root, "ledgers");
  const ids = existsSync(dir)
    ? readdirSync(dir).filter((id) =>
        existsSync(join(dir, id, "ledger", "head.json")),
      )
    : [];
  if (ids.length === 1) return ids[0] as string;
  throw new Error(
    ids.length === 0
      ? `${root}에 장부 사본(ledgers/<장부 id>/ledger/head.json)이 없다`
      : `${root}에 장부가 여럿이라 고르지 못했다: ${ids.join(", ")}`,
  );
}

async function resolveSource(o: RestoreOptions): Promise<Source> {
  const fetchFn = o.fetch ?? ((...args) => fetch(...args));
  if (o.from === "github") {
    const repo = o.repo ?? STARDRAW_ANCHOR_REPO;
    const found = await findGitHubLedger({ repo, fetch: fetchFn });
    return {
      label: `GitHub ${repo} ${found.branch} 브랜치(장부 ${found.ledger})`,
      base: found.base,
      fetch: fetchFn,
      dir: null,
      anchored: async (ledger, branch, round) => {
        const res = await fetchFn(
          `https://raw.githubusercontent.com/${repo}/${branch}/${anchorPath(ledger, round)}`,
          { cache: "no-store" },
        );
        if (res.status === 404) return false;
        if (!res.ok)
          throw new Error(`앵커 파일을 확인하지 못했다(HTTP ${res.status})`);
        return true;
      },
    };
  }
  if (!existsSync(o.from)) throw new Error(`원본 폴더가 없다: ${o.from}`);
  // 서버의 공개 장부 폴더(genesis.json이 바로 있다)
  if (existsSync(join(o.from, "genesis.json")))
    return {
      label: `공개 장부 폴더 ${o.from}`,
      base: VIRTUAL,
      fetch: dirFetch(o.from),
      dir: o.from,
      anchored: null,
    };
  // 앵커 저장소를 받은 폴더(브랜치는 받은 폴더에서 고른 것 하나)
  const id = folderLedgerId(o.from);
  const dir = join(o.from, "ledgers", id, "ledger");
  return {
    label: `앵커 저장소 폴더 ${o.from}(장부 ${id})`,
    base: VIRTUAL,
    fetch: dirFetch(dir),
    dir,
    anchored: async (ledger, _branch, round) =>
      existsSync(join(o.from, anchorPath(ledger, round))),
  };
}

export async function restoreFromAnchor(
  o: RestoreOptions,
): Promise<RestoreResult> {
  const log = o.log ?? (() => {});
  if (existsSync(o.out))
    throw new Error(`이미 DB 파일이 있어 덮어쓰지 않는다: ${o.out}`);
  const source = await resolveSource(o);
  log(`원본: ${source.label}`);
  const ledger = await loadPublicLedger(source.base, source.fetch);
  const n = ledger.records.length;
  if (n === 0) throw new Error("원본에 닫힌 회차가 없다");
  checkShape(ledger);
  const ledgerHex = toHex(genesisHash(ledger.genesis)).slice(0, 16);

  // 원본보다 앞선 장부가 있으면 그것을 써야 한다(같은 회차를 다른 내용으로 다시 닫지 않게)
  const served = readHead(o.ledgerDir);
  if (served && served.rounds > n)
    throw new Error(
      `공개 장부 폴더(${o.ledgerDir})가 ${served.rounds}회차까지로 원본(${n}회차)보다 앞선다. 그 폴더를 원본으로 쓴다`,
    );

  const report = await verifyLedger(
    ledger.genesis,
    ledger.records,
    ledger.tickets,
    ledger.registrations,
    {
      webauthnPolicy: o.policy,
      powParams: o.pow,
      ...(o.beaconVerifier ? { beaconVerifier: o.beaconVerifier } : {}),
    },
  );
  if (report.problems.length > 0)
    throw new Error(
      `원본 장부 검사가 통과하지 않는다: ${report.problems
        .slice(0, 5)
        .map((p) => `${p.round}회차 ${p.message}`)
        .join(" / ")}`,
    );
  if (source.anchored) {
    const branch = anchorBranch(report.schedule, n + 1);
    if (await source.anchored(ledgerHex, branch, n + 1))
      throw new Error(
        `앵커 저장소 ${branch}에 ${n + 1}회차 앵커가 있는데 원본 사본은 ${n}회차까지다. 더 앞선 원본(서버의 공개 장부 폴더 등)을 쓴다`,
      );
  }

  writeStore(o.out, ledger);
  try {
    const head = await recheck(o, ledger);
    rewritePublic(o.ledgerDir, ledger, source.dir, dirname(o.out));
    log(`${n}회차까지 되살렸다. 장부 끝 해시 ${head}`);
    return { rounds: n, head, ledger: ledgerHex, label: source.label };
  } catch (err) {
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(`${o.out}${suffix}`, { force: true });
    throw err;
  }
}

/** 회차·봉인 파일이 서로 맞는지(검사기가 보지 않는 봉인 파일 쪽) */
function checkShape(ledger: PublicLedger): void {
  const n = ledger.records.length;
  if (ledger.head.rounds !== n)
    throw new Error(
      `head.json은 ${ledger.head.rounds}회차인데 회차 파일은 ${n}개다`,
    );
  ledger.records.forEach((record, i) => {
    const round = i + 1;
    const seal = ledger.seals[i];
    if (record.round !== round)
      throw new Error(`${round}번째 회차 파일의 회차 번호가 ${record.round}다`);
    if (!seal || seal.round !== round)
      throw new Error(`${round}회차 봉인 파일이 없다`);
    if (seal.digest !== toHex(sealDigest(record)))
      throw new Error(`${round}회차 봉인 값이 회차 기록과 다르다`);
    if (seal.loggedAt !== record.rootLoggedAt)
      throw new Error(`${round}회차 봉인 시각이 회차 기록과 다르다`);
  });
  const last = ledger.records[n - 1];
  if (!last || toHex(recordHash(last)) !== ledger.head.head)
    throw new Error("head.json의 끝 해시가 마지막 회차 기록과 다르다");
}

function readHead(dir: string): HeadFile | null {
  try {
    return JSON.parse(readFileSync(join(dir, "head.json"), "utf8")) as HeadFile;
  } catch {
    return null;
  }
}

function writeStore(path: string, ledger: PublicLedger): void {
  const store = new Store(path);
  try {
    store.transaction(() => {
      store.genesis(ledger.genesis);
      ledger.records.forEach((record, i) => {
        const round = i + 1;
        store.addRecord(record);
        // 받은 시각은 공개하지 않던 값이라 남아 있지 않다(어디서도 읽지 않는다)
        for (const ticket of ledger.tickets[i] ?? [])
          store.addEntry(
            round,
            toHex(ticketId(ticket)),
            toHex(entrantId(ticket.pub)),
            ticket,
            0,
          );
        for (const reg of ledger.registrations[i] ?? [])
          store.addRegistration(
            round,
            toHex(entrantId(reg.pub)),
            toHex(reg.credentialId),
            reg,
          );
        const seal = ledger.seals[i];
        if (!seal) throw new Error(`${round}회차 봉인 파일이 없다`);
        store.addSeal({
          round,
          digest: sealDigest(record),
          loggedAt: seal.loggedAt,
          log: seal.log ?? null,
        });
      });
    });
  } finally {
    store.close();
  }
}

/** 만든 DB를 다시 열어 장부 검사로 읽고 끝 해시가 원본과 같은지 본다 */
async function recheck(
  o: RestoreOptions,
  ledger: PublicLedger,
): Promise<string> {
  const store = new Store(o.out);
  try {
    const n = store.recordCount();
    const genesis = store.storedGenesis();
    if (!genesis || n !== ledger.records.length)
      throw new Error("되살린 DB의 회차 수가 원본과 다르다");
    const records = [];
    const tickets = [];
    const registrations = [];
    for (let round = 1; round <= n; round++) {
      const record = store.record(round);
      if (!record) throw new Error(`되살린 DB에 ${round}회차 기록이 없다`);
      records.push(record);
      tickets.push(sortTickets(store.entries(round)));
      registrations.push(sortRegistrations(store.registrations(round)));
    }
    const report = await verifyLedger(
      genesis,
      records,
      tickets,
      registrations,
      {
        webauthnPolicy: o.policy,
        powParams: o.pow,
        ...(o.beaconVerifier ? { beaconVerifier: o.beaconVerifier } : {}),
      },
    );
    if (report.problems.length > 0)
      throw new Error(
        `되살린 DB의 장부 검사가 통과하지 않는다: ${report.problems[0]?.message}`,
      );
    const head = toHex(report.head);
    if (head !== ledger.head.head)
      throw new Error(
        `되살린 DB의 끝 해시(${head})가 원본(${ledger.head.head})과 다르다`,
      );
    return head;
  } finally {
    store.close();
  }
}

/**
 * 공개 장부 파일을 다시 쓴다(서버가 회차를 닫을 때 쓰는 것과 같은 코드). 묶음과 head.json은 다시 띄운 서버가 쓴다.
 * 먼저 임시 폴더에 만들어, 원본이 폴더면 바이트가 같은지 본 뒤 옮긴다(어긋나면 공개 장부 폴더를 건드리지 않는다)
 */
function rewritePublic(
  dir: string,
  ledger: PublicLedger,
  sourceDir: string | null,
  work: string,
): void {
  const tmp = mkdtempSync(join(work, ".stardraw-restore-"));
  try {
    writePublic(tmp, ledger);
    if (sourceDir) compareFiles(tmp, sourceDir, ledger);
    mkdirSync(dir, { recursive: true });
    cpSync(tmp, dir, { recursive: true });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function writePublic(dir: string, ledger: PublicLedger): void {
  const publisher = new Publisher(dir);
  publisher.genesis(ledger.genesis);
  ledger.records.forEach((record, i) => {
    const seal = ledger.seals[i];
    if (!seal) throw new Error(`${record.round}회차 봉인 파일이 없다`);
    publisher.seal({
      round: record.round,
      count: record.count,
      merkleRoot: toHex(record.merkleRoot),
      registrationCount: record.registrationCount,
      registrationRoot: toHex(record.registrationRoot),
      digest: seal.digest,
      loggedAt: seal.loggedAt,
      log: seal.log ?? null,
    });
    publisher.round(
      record,
      ledger.tickets[i] ?? [],
      ledger.registrations[i] ?? [],
    );
  });
}

function compareFiles(
  dir: string,
  sourceDir: string,
  ledger: PublicLedger,
): void {
  const paths = [
    "genesis.json",
    ...ledger.records.flatMap((r) => [
      `rounds/${pad(r.round)}.json`,
      `seals/${pad(r.round)}.json`,
    ]),
  ];
  for (const path of paths) {
    const from = join(sourceDir, path);
    if (!existsSync(from)) continue; // 묶음으로만 올라간 회차(낱개 없음)
    if (readFileSync(from, "utf8") !== readFileSync(join(dir, path), "utf8"))
      throw new Error(`다시 쓴 공개 장부 파일이 원본과 다르다: ${path}`);
  }
}
