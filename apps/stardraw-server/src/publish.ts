import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  BUNDLE_SIZES,
  decodeTicket,
  encodeRecord,
  encodeRegistration,
  encodeTicket,
  fromBase64Url,
  type KeyRegistration,
  LIGHT_BUNDLE_SIZES,
  type LightBundleFile,
  type LightFile,
  lightBundleName,
  lightFileName,
  makeLightFile,
  type RoundRecord,
  type Schedule,
  sortRegistrations,
  sortTickets,
  type Ticket,
  toBase64Url,
} from "@game/stardraw-core";

/**
 * 공개 장부 파일(누구나 내려받아 처음부터 검사한다, docs/36 7절).
 *   genesis.json         처음 일정표(시험 표시·옮긴 등록의 수와 루트 포함)와 옮겨 온 등록 목록
 *   head.json            닫힌 회차 수, 마지막 기록 해시, 봉인한 회차 수, 서버 공개 열쇠
 *   seals/000001.json    마감 직후 봉인 값과 투명성 로그 증거(drand 값보다 먼저 나온다)
 *   rounds/000001.json   회차 기록(고정 바이너리 base64url)과 응모권·열쇠 등록 목록(id 순)
 *   bundles/10/000001.json, bundles/100/000001.json
 *                        다 찬 10·100회차 구간의 회차·봉인 파일 묶음(받는 요청 수를 줄인다). 한 번 쓰면 바꾸지 않는다
 *   light/000001.json    가벼운 기록 파일(회차 기록 + 요약, docs/36 11-30). 회차 파일에서 다시 만들 수 있다
 *   light/bundles/1000|100|10/000001.json  다 찬 구간의 가벼운 기록 묶음
 * 바이너리 형식은 규칙 패키지(@game/stardraw-core)가 정한다.
 */

export const pad = (n: number) => String(n).padStart(6, "0");

/** 공개 장부 파일의 글: JSON 한 줄 + 줄바꿈 */
const fileText = (value: unknown) => `${JSON.stringify(value)}\n`;

/** 공개 장부 파일 하나(path는 장부 폴더 안 상대 경로, 서버 주소 /ledger/ 뒤와 같다) */
export interface MirrorFile {
  path: string;
  text: string;
}

export interface SealFile {
  v: 1;
  round: number;
  count: number;
  merkleRoot: string;
  registrationCount: number;
  registrationRoot: string;
  digest: string;
  loggedAt: number;
  log: unknown;
}

export interface RoundFile {
  v: 1;
  record: string;
  tickets: string[];
  registrations: string[];
}

export interface BundleFile {
  v: 1;
  first: number;
  size: number;
  rounds: RoundFile[];
  seals: SealFile[];
}

export interface GenesisFile {
  v: 1;
  schedule: Schedule;
}

export interface HeadFile {
  v: 1;
  rounds: number;
  head: string;
  sealed: number;
  serverKey: string;
}

export class Publisher {
  constructor(private readonly dir: string) {
    mkdirSync(join(dir, "rounds"), { recursive: true });
    mkdirSync(join(dir, "seals"), { recursive: true });
    for (const size of BUNDLE_SIZES)
      mkdirSync(join(dir, "bundles", String(size)), { recursive: true });
    for (const size of LIGHT_BUNDLE_SIZES)
      mkdirSync(join(dir, "light", "bundles", String(size)), {
        recursive: true,
      });
  }

  private write(path: string, value: unknown): void {
    const full = join(this.dir, path);
    const tmp = `${full}.tmp`;
    writeFileSync(tmp, fileText(value));
    renameSync(tmp, full);
  }

  private read(path: string): MirrorFile {
    return { path, text: readFileSync(join(this.dir, path), "utf8") };
  }

  /**
   * 앵커 저장소에 함께 올릴 그 회차 파일(docs/36 11-16): 회차·봉인 파일과, 그 회차에서 끝나는 묶음.
   * 공개한 파일을 그대로(같은 바이트) 읽는다. 회차·봉인 파일이 없으면 던지고, 묶음은 없으면 뺀다(낱개가 있다)
   */
  roundFiles(round: number): MirrorFile[] {
    const out = [
      this.read(`rounds/${pad(round)}.json`),
      this.read(`seals/${pad(round)}.json`),
    ];
    for (const size of BUNDLE_SIZES) {
      if (round % size !== 0) continue;
      const path = `bundles/${size}/${pad(round - size + 1)}.json`;
      if (existsSync(join(this.dir, path))) out.push(this.read(path));
    }
    out.push(...this.lightFiles(round, round));
    return out;
  }

  /**
   * 앵커 저장소에 올릴 from~to 회차의 가벼운 기록 파일과 그 구간에서 끝나는 가벼운 묶음(없는 것은 뺀다).
   * 가벼운 기록을 내기 전에 사본에 오른 회차를 채울 때도 쓴다
   */
  lightFiles(from: number, to: number): MirrorFile[] {
    const out: MirrorFile[] = [];
    for (let round = from; round <= to; round++) {
      const path = lightFileName(round);
      if (existsSync(join(this.dir, path))) out.push(this.read(path));
      for (const size of LIGHT_BUNDLE_SIZES) {
        if (round % size !== 0) continue;
        const bundle = lightBundleName(size, round - size + 1);
        if (existsSync(join(this.dir, bundle))) out.push(this.read(bundle));
      }
    }
    return out;
  }

  /** 봉인 파일 그대로(추첨 전 봉인 사본, docs/36 11-20) */
  sealFile(round: number): MirrorFile {
    return this.read(`seals/${pad(round)}.json`);
  }

  genesisFile(): MirrorFile {
    return this.read("genesis.json");
  }

  /** head.json과 같은 형식의 글(앵커 저장소에는 그 커밋까지 오른 회차를 가리키는 head를 둔다) */
  static headFile(h: Omit<HeadFile, "v">): MirrorFile {
    return { path: "head.json", text: fileText({ v: 1, ...h }) };
  }

  /** 처음 일정표 */
  genesis(schedule: Schedule): void {
    this.write("genesis.json", { v: 1, schedule } satisfies GenesisFile);
  }

  head(h: Omit<HeadFile, "v">): void {
    this.write("head.json", { v: 1, ...h } satisfies HeadFile);
  }

  seal(s: Omit<SealFile, "v">): void {
    this.write(`seals/${pad(s.round)}.json`, { v: 1, ...s } satisfies SealFile);
  }

  round(
    record: RoundRecord,
    tickets: readonly Ticket[],
    registrations: readonly KeyRegistration[],
  ): void {
    this.write(`rounds/${pad(record.round)}.json`, {
      v: 1,
      record: toBase64Url(encodeRecord(record)),
      tickets: sortTickets(tickets).map((t) => toBase64Url(encodeTicket(t))),
      registrations: sortRegistrations(registrations).map((r) =>
        toBase64Url(encodeRegistration(r)),
      ),
    } satisfies RoundFile);
  }

  /**
   * 닫힌 회차가 rounds개일 때 가벼운 기록 파일과 묶음 가운데 없는 것을 쓴다(docs/36 11-30).
   * 공개한 회차 파일을 읽어 만든다: 기록은 같은 글, 요약은 그 응모권으로 계산. 그래서 가벼운 기록을 내기 전에 닫힌
   * 회차(운영 장부의 지난 회차)도 서버를 다시 띄우면 채워진다. 있는 파일은 다시 쓰지 않는다(바뀌지 않는 파일)
   */
  lights(rounds: number): void {
    for (let round = this.lightDone + 1; round <= rounds; round++) {
      const path = lightFileName(round);
      if (existsSync(join(this.dir, path))) continue;
      const file = JSON.parse(
        readFileSync(join(this.dir, "rounds", `${pad(round)}.json`), "utf8"),
      ) as RoundFile;
      const light = makeLightFile(
        file.record,
        file.tickets.map((t) => decodeTicket(fromBase64Url(t))),
      );
      if (light.round !== round)
        throw new Error(`${round}회차 파일의 기록이 ${light.round}회차다`);
      this.write(path, light satisfies LightFile);
    }
    for (const size of LIGHT_BUNDLE_SIZES)
      for (let first = 1; first + size - 1 <= rounds; first += size) {
        const path = lightBundleName(size, first);
        if (existsSync(join(this.dir, path))) continue;
        const items = Array.from(
          { length: size },
          (_, i) =>
            JSON.parse(
              readFileSync(join(this.dir, lightFileName(first + i)), "utf8"),
            ) as LightFile,
        );
        this.write(path, {
          v: 1,
          first,
          size,
          items,
        } satisfies LightBundleFile);
      }
    this.lightDone = Math.max(this.lightDone, rounds);
  }

  /** 이 판에서 가벼운 기록을 모두 확인한 회차(띄울 때마다 1회차부터 한 번 본다) */
  private lightDone = 0;

  /**
   * 닫힌 회차가 rounds개일 때 다 찬 묶음 가운데 아직 없는 것을 쓴다(띄울 때 지난 구간도 채운다).
   * 묶음은 이미 낸 회차·봉인 파일을 그대로 담는다. 있는 묶음은 다시 쓰지 않는다(바뀌지 않는 파일)
   */
  bundles(rounds: number): void {
    for (const size of BUNDLE_SIZES)
      for (let first = 1; first + size - 1 <= rounds; first += size) {
        const path = `bundles/${size}/${pad(first)}.json`;
        if (existsSync(join(this.dir, path))) continue;
        const read = (kind: string, n: number) =>
          JSON.parse(
            readFileSync(join(this.dir, kind, `${pad(n)}.json`), "utf8"),
          ) as unknown;
        const range = Array.from({ length: size }, (_, i) => first + i);
        this.write(path, {
          v: 1,
          first,
          size,
          rounds: range.map((n) => read("rounds", n)) as RoundFile[],
          seals: range.map((n) => read("seals", n)) as SealFile[],
        } satisfies BundleFile);
      }
  }
}
