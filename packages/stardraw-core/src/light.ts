import { fromBase64Url, toHex } from "./bytes";
import {
  fetchFailure,
  type PoliteFetchOptions,
  politeFetch,
} from "./polite-fetch";
import { decodeRecord, type RoundRecord } from "./record";
import { sortTickets } from "./round";
import type { Ticket } from "./ticket";

/**
 * 가벼운 확인(docs/36 11-30 설계 1). 보통 기기는 장부 전체(응모권·봉인) 대신
 * 회차 기록 사슬과 작은 요약(가벼운 기록 파일), 내 응모권의 머클 포함 증명만 받는다.
 * 장부 형식(기록·응모권·등록 바이너리)은 그대로다. 여기 파일은 모두 회차 파일에서 다시 만들 수 있는 파생 파일이고,
 * 전체 검사(검증 페이지·터미널 검사기)가 요약을 회차 파일로 다시 계산해 대조한다.
 *
 *   ledger/light/000001.json                 { v, round, record, summary } 회차마다
 *   ledger/light/bundles/1000|100|10/000001.json  다 찬 구간 묶음 { v, first, size, items }
 */

/** 회차 기록에 없는, 화면이 쓰는 세기(응모권 전체를 받지 않고 쓰려고) */
export interface RoundSummary {
  /** 소속 증서가 붙은 응모권 수(관측 기록) */
  qualified: number;
  /**
   * 소속 증서 공개 열쇠의 앞 8바이트 hex(응모권 id 순, 같은 증서가 여러 번 나올 수 있다).
   * 「내 소속 증서가 이 기기에서 내지 않은 응모에 쓰였다」 알림에 쓴다. 33바이트 전체 대신 앞부분만 둬
   * 소속 응모 한 장마다 70자가 아니라 19자로 줄인다(우연히 겹칠 확률 2^-64)
   */
  qualPubs: string[];
  /** 같은 번호 조합이 2장 이상인 것: [오름차순 번호 6개, 장 수], 번호 사전 순(「같은 꿈」 인증서) */
  twins: [number[], number][];
}

/** 요약에 남기는 소속 공개 열쇠 앞부분 길이(바이트) */
export const QUAL_PUB_PREFIX = 8;

export const qualPubPrefix = (qualPub: Uint8Array) =>
  toHex(qualPub.subarray(0, QUAL_PUB_PREFIX));

const comboKey = (numbers: readonly number[]) =>
  [...numbers].sort((a, b) => a - b).join(",");

/**
 * 한 회차 응모권 목록의 요약. 순서와 상관없이 같은 값이 나온다(서버·검사기·연습 장부가 같이 쓴다)
 */
export function roundSummary(tickets: readonly Ticket[]): RoundSummary {
  const sorted = sortTickets(tickets);
  const qualPubs = sorted.flatMap((t) =>
    t.qual ? [qualPubPrefix(t.qual.cert.qualPub)] : [],
  );
  const combos = new Map<string, number>();
  for (const t of sorted) {
    const key = comboKey(t.numbers);
    combos.set(key, (combos.get(key) ?? 0) + 1);
  }
  const twins: [number[], number][] = [...combos]
    .filter(([, n]) => n >= 2)
    .map(([key, n]) => [key.split(",").map(Number), n] as [number[], number])
    .sort((a, b) => compareCombos(a[0], b[0]));
  return { qualified: qualPubs.length, qualPubs, twins };
}

function compareCombos(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++)
    if (a[i] !== b[i]) return (a[i] as number) - (b[i] as number);
  return a.length - b.length;
}

/** 요약 둘이 같은지(전체 검사의 대조) */
export function sameSummary(a: RoundSummary, b: RoundSummary): boolean {
  return JSON.stringify(normalSummary(a)) === JSON.stringify(normalSummary(b));
}

/** 모르는 칸을 버린 요약(옛 기기는 새 칸을 무시한다, 판 올림 규칙) */
function normalSummary(s: RoundSummary): RoundSummary {
  return { qualified: s.qualified, qualPubs: s.qualPubs, twins: s.twins };
}

/** 이 요약에서 그 번호 조합이 몇 장인지(1장이면 twins에 없다) */
export function twinCount(
  summary: RoundSummary,
  numbers: readonly number[],
): number {
  const key = comboKey(numbers);
  return summary.twins.find(([n]) => comboKey(n) === key)?.[1] ?? 1;
}

// ── 가벼운 기록 파일 ──

export interface LightFile {
  v: 1;
  round: number;
  /** 회차 기록(base64url). 회차 파일의 record와 같은 바이트 */
  record: string;
  summary: RoundSummary;
}

export interface LightBundleFile {
  v: 1;
  first: number;
  size: number;
  items: LightFile[];
}

/** 가벼운 기록 묶음 크기(큰 것부터). 기록이 회차마다 약 0.4KB라 1,000회차 묶음도 0.5MB 안팎이다 */
export const LIGHT_BUNDLE_SIZES = [1000, 100, 10] as const;

const pad = (n: number) => String(n).padStart(6, "0");

/** 장부 폴더 안 상대 경로(서버 주소 /ledger/ 뒤, 앵커 사본 ledger/ 뒤와 같다) */
export const lightFileName = (round: number) => `light/${pad(round)}.json`;
export const lightBundleName = (size: number, first: number) =>
  `light/bundles/${size}/${pad(first)}.json`;
export const lightFilePath = (round: number) =>
  `/ledger/${lightFileName(round)}`;
export const lightBundlePath = (size: number, first: number) =>
  `/ledger/${lightBundleName(size, first)}`;

/** 회차 파일의 기록 글(base64url)과 응모권으로 가벼운 기록 파일을 만든다 */
export function makeLightFile(
  record: string,
  tickets: readonly Ticket[],
): LightFile {
  const decoded = decodeRecord(fromBase64Url(record));
  return { v: 1, round: decoded.round, record, summary: roundSummary(tickets) };
}

/** from~to를 받을 조각: 큰 묶음부터, 맞지 않는 곳은 낱개(size 1) */
export function lightPieces(
  from: number,
  to: number,
): { first: number; size: number }[] {
  const pieces: { first: number; size: number }[] = [];
  let round = from;
  while (round <= to) {
    const size =
      LIGHT_BUNDLE_SIZES.find(
        (s) => (round - 1) % s === 0 && round + s - 1 <= to,
      ) ?? 1;
    pieces.push({ first: round, size });
    round += size;
  }
  return pieces;
}

/** 받은 가벼운 기록 하나 */
export interface LightRound {
  record: RoundRecord;
  summary: RoundSummary;
  /** 받은 기록 글(전체 검사가 회차 파일과 같은 바이트인지 본다) */
  recordText: string;
}

/** 가벼운 기록을 내지 않는 서버(옛 판)라 받을 수 없다 */
export class LightMissing extends Error {
  constructor(readonly round: number) {
    super(`${round}회차 가벼운 기록 파일이 없습니다`);
    this.name = "LightMissing";
  }
}

function checkLight(file: LightFile, round: number, what: string): LightRound {
  if (
    file?.v !== 1 ||
    file.round !== round ||
    typeof file.record !== "string" ||
    typeof file.summary !== "object" ||
    file.summary === null ||
    !Array.isArray(file.summary.qualPubs) ||
    !Array.isArray(file.summary.twins)
  )
    throw new Error(`${what}의 모양이 맞지 않습니다`);
  const record = decodeRecord(fromBase64Url(file.record));
  if (record.round !== round)
    throw new Error(`${what}의 기록 회차가 ${record.round}입니다`);
  return {
    record,
    summary: normalSummary(file.summary),
    recordText: file.record,
  };
}

/**
 * from~to 회차의 가벼운 기록을 받는다(맞는 묶음이 있으면 묶음으로). 닫힌 회차 파일은 바뀌지 않아 브라우저 캐시를 쓴다.
 * 낱개 파일이 없으면(가벼운 기록을 아직 내지 않는 서버) LightMissing을 던진다
 */
export async function loadLightFiles(
  base: string,
  fetchFn: typeof fetch,
  from: number,
  to: number,
  options: {
    polite?: PoliteFetchOptions;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<LightRound[]> {
  const f = politeFetch(fetchFn, options.polite);
  const total = Math.max(0, to - from + 1);
  const out: LightRound[] = new Array(total);
  let done = 0;
  const finished = (n: number) => {
    done += n;
    options.onProgress?.(done, total);
  };
  const json = async <T>(path: string): Promise<T | null> => {
    const res = await f(`${base}${path}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(fetchFailure(path, res.status));
    return (await res.json()) as T;
  };
  const single = async (round: number) => {
    const path = lightFilePath(round);
    const body = await json<LightFile>(path);
    if (body === null) throw new LightMissing(round);
    out[round - from] = checkLight(body, round, path);
    finished(1);
  };
  const bundle = async (first: number, size: number) => {
    const path = lightBundlePath(size, first);
    const body = await json<LightBundleFile>(path);
    if (body === null) {
      // 묶음이 아직 없으면(띄울 때 채우는 중) 한 단계 작은 조각으로
      const smaller = LIGHT_BUNDLE_SIZES.find((s) => s < size);
      await Promise.all(
        smaller
          ? Array.from({ length: size / smaller }, (_, i) =>
              bundle(first + i * smaller, smaller),
            )
          : Array.from({ length: size }, (_, i) => single(first + i)),
      );
      return;
    }
    if (
      body.first !== first ||
      body.size !== size ||
      body.items?.length !== size
    )
      throw new Error(`${path}의 모양이 맞지 않습니다`);
    for (let i = 0; i < size; i++)
      out[first + i - from] = checkLight(
        body.items[i] as LightFile,
        first + i,
        path,
      );
    finished(size);
  };
  await Promise.all(
    lightPieces(from, to).map((p) =>
      p.size === 1 ? single(p.first) : bundle(p.first, p.size),
    ),
  );
  return out;
}
