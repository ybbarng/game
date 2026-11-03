import {
  fromBase64Url,
  sha256,
  taggedHash,
  toBase64Url,
  utf8,
} from "@game/stardraw-core";

import {
  ASTRONAUT_TAG,
  type Astronaut,
  type AstronautPicks,
  astronautFromPicks,
  type Egg,
  FACE_PARTS,
  type FacePart,
  picksFromHash,
} from "./identity";
import { NAMES } from "./names";
import {
  ARM_PLACES,
  type Area,
  OTHER_GALAXY_PLACES,
  type Place,
} from "./places";

/**
 * 등록증 공유본 주소의 값(docs/36 11-66). `/stardraw/card?c=v1.<base64url 26바이트>`
 *
 * 공개 열쇠도, 열쇠 해시도 담지 않는다. 등록증에 보이는 것을 고른 값으로만 담는다:
 * 등록번호 40비트(앞면에 보이는 값, 뒷면 별 무늬·지문 도장도 여기서 나온다), 이름·주소는 목록 항목의 짧은 표,
 * 얼굴 부위 번호, 배경 별 씨앗, 발급일, 등록 회차(장부와 대조할 때 받을 회차 파일).
 *
 * 판 1의 바이트(모두 큰 끝 먼저)
 * - 0..5   등록번호 40비트
 * - 5..8   이름 표(24비트)
 * - 8      깃발: 비트0 다른 은하, 비트1 헬멧, 비트2~3 드문 사진(0 없음, 1 우주견, 2 작은 별의 아이, 3 달토끼)
 * - 9..12  주소 표(24비트, 다른 은하면 다른 은하 목록에서)
 * - 12..14 대륙 표(16비트, 대륙이 있는 곳만 쓴다)
 * - 14..17 얼굴: 피부·머리, 눈·더듬이, 입·무늬(4비트씩)
 * - 17..21 배경 별 씨앗(32비트)
 * - 21..23 발급일(2020-01-01부터 날 수 + 1, 0이면 없음)
 * - 23..26 등록 회차(0이면 없음)
 *
 * 목록 항목은 차례가 아니라 id에서 만든 표로 담는다. 목록 차례는 바꿔도 되고(names.ts, places.ts) 항목을 더하거나 빼도
 * 다른 우주인의 주소가 그대로여야 해서다. 맞는 표가 없으면(주소를 손으로 바꿔 본 경우) 표가 그다음으로 큰 항목으로 맞춘다.
 * 그래서 아무 값을 넣어도 등록증 한 장이 그려진다(바꿔 보는 재미). 고를 수 있는 목록은 주지 않는다.
 * 같은 목록 안에서 표가 겹치면 시험이 알린다(`card-code.test.ts`). 그때는 판 번호를 올린다.
 */
export const CARD_VERSION = "v1";
const BYTES = 26;
const CODE_TAG = "stardraw/card/v1";
/** 드문 사진(값 1~3). 판 1에서 차례를 고정한다 */
const CARD_EGGS: readonly Egg[] = ["laika", "prince", "rabbit"];
const FACE_ORDER: readonly FacePart[] = [
  "skin",
  "head",
  "eyes",
  "antenna",
  "mouth",
  "marks",
];
/** 발급일 0번 날(UTC 날 번호) */
const DAY0 = Date.UTC(2020, 0, 1) / 86_400_000;

/** 목록 항목 하나의 표: sha256(판 ‖ 종류 ‖ id) 앞 `bytes`바이트 */
export function codeOf(kind: string, id: string, bytes: 2 | 3): number {
  const h = sha256(utf8(`${CODE_TAG}\0${kind}\0${id}`));
  return bytes === 3
    ? ((h[0] ?? 0) << 16) | ((h[1] ?? 0) << 8) | (h[2] ?? 0)
    : ((h[0] ?? 0) << 8) | (h[1] ?? 0);
}

type Table<T> = { code: number; item: T }[];
const tables = new Map<string, Table<unknown>>();
function tableOf<T>(
  key: string,
  kind: string,
  items: readonly T[],
  idOf: (t: T) => string,
  bytes: 2 | 3,
): Table<T> {
  let t = tables.get(key) as Table<T> | undefined;
  if (!t) {
    t = items
      .map((item) => ({ code: codeOf(kind, idOf(item), bytes), item }))
      .sort((a, b) => a.code - b.code);
    tables.set(key, t as Table<unknown>);
  }
  return t;
}

/** 표에 맞는 항목. 없으면 표가 그다음으로 큰 항목(끝을 넘으면 처음으로) */
function pick<T>(table: Table<T>, code: number): T {
  const hit = table.find((e) => e.code >= code) ?? table[0];
  if (!hit) throw new Error("빈 목록");
  return hit.item;
}

const nameTable = () => tableOf("name", "name", NAMES, (n) => n, 3);
const placeTable = (galaxy: boolean) =>
  galaxy
    ? tableOf("galaxy", "galaxy", OTHER_GALAXY_PLACES, (p: Place) => p.id, 3)
    : tableOf("place", "place", ARM_PLACES, (p: Place) => p.id, 3);
const areaTable = (place: Place) =>
  tableOf(`area/${place.id}`, "area", place.areas ?? [], (a: Area) => a.id, 2);

/** 공유본에 담는 값과 그것으로 그린 등록증 */
export interface SharedCard {
  picks: AstronautPicks;
  astronaut: Astronaut;
  /** 발급일 "2026. 11. 3."(담지 않았으면 null) */
  issued: string | null;
  /** 발급일의 날 번호(UTC 날짜로 센 달력 날, 장부 대조에 쓴다) */
  issuedDay: number | null;
  /** 등록 회차(장부와 대조할 회차 파일) */
  round: number | null;
}

/** 시각(ms) → 그 기기 달력의 날 번호(발급일 글자와 같은 날) */
export function dayOf(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
}

/** 날 번호 → "2026. 11. 3."(`dateOf`와 같은 꼴) */
export function dayText(day: number): string {
  const d = new Date(day * 86_400_000);
  return `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}.`;
}

/** 공개 열쇠 → 공유본 값 "v1.…". 열쇠는 고른 값을 뽑는 데만 쓰고 담지 않는다 */
export function cardCodeOf(
  pub: Uint8Array,
  extra: { issuedAt: number | null; round: number | null },
): string {
  return encodeCard(picksFromHash(taggedHash(ASTRONAUT_TAG, pub)), {
    issuedDay: extra.issuedAt === null ? null : dayOf(extra.issuedAt),
    round: extra.round,
  });
}

export function encodeCard(
  p: AstronautPicks,
  extra: { issuedDay: number | null; round: number | null },
): string {
  const b = new Uint8Array(BYTES);
  b.set(p.serial.slice(0, 5), 0);
  const name = codeOf("name", p.name, 3);
  b[5] = name >> 16;
  b[6] = (name >> 8) & 255;
  b[7] = name & 255;
  const egg = p.egg ? CARD_EGGS.indexOf(p.egg) + 1 : 0;
  b[8] = (p.otherGalaxy ? 1 : 0) | (p.face.helmet ? 2 : 0) | (egg << 2);
  const place = codeOf(p.otherGalaxy ? "galaxy" : "place", p.place.id, 3);
  b[9] = place >> 16;
  b[10] = (place >> 8) & 255;
  b[11] = place & 255;
  const area = p.area ? codeOf("area", p.area.id, 2) : 0;
  b[12] = area >> 8;
  b[13] = area & 255;
  const f = FACE_ORDER.map((k) => p.face[k] & 15);
  b[14] = ((f[0] ?? 0) << 4) | (f[1] ?? 0);
  b[15] = ((f[2] ?? 0) << 4) | (f[3] ?? 0);
  b[16] = ((f[4] ?? 0) << 4) | (f[5] ?? 0);
  const sky = p.face.sky >>> 0;
  b[17] = sky >>> 24;
  b[18] = (sky >>> 16) & 255;
  b[19] = (sky >>> 8) & 255;
  b[20] = sky & 255;
  const day =
    extra.issuedDay === null
      ? 0
      : Math.max(0, Math.min(0xffff, extra.issuedDay - DAY0 + 1));
  b[21] = day >> 8;
  b[22] = day & 255;
  const round =
    extra.round === null ? 0 : Math.max(0, Math.min(0xffffff, extra.round));
  b[23] = round >> 16;
  b[24] = (round >> 8) & 255;
  b[25] = round & 255;
  return `${CARD_VERSION}.${toBase64Url(b)}`;
}

/**
 * 공유본 값 → 등록증. 판 번호나 길이가 맞지 않으면 null(「알아볼 수 없는 등록증입니다.」).
 * 길이만 맞으면 값은 모두 범위 안으로 맞춰 등록증 한 장을 그린다
 */
export function decodeCard(text: string | null | undefined): SharedCard | null {
  if (!text) return null;
  const dot = text.indexOf(".");
  if (dot < 0 || text.slice(0, dot) !== CARD_VERSION) return null;
  let b: Uint8Array;
  try {
    b = fromBase64Url(text.slice(dot + 1));
  } catch {
    return null;
  }
  if (b.length !== BYTES) return null;
  const u = (i: number, n: number) => {
    let v = 0;
    for (let k = 0; k < n; k++) v = v * 256 + (b[i + k] ?? 0);
    return v;
  };
  const otherGalaxy = ((b[8] ?? 0) & 1) === 1;
  const place = pick(placeTable(otherGalaxy), u(9, 3));
  const area = place.areas?.length ? pick(areaTable(place), u(12, 2)) : null;
  const eggCode = ((b[8] ?? 0) >> 2) & 3;
  const nib = [
    (b[14] ?? 0) >> 4,
    (b[14] ?? 0) & 15,
    (b[15] ?? 0) >> 4,
    (b[15] ?? 0) & 15,
    (b[16] ?? 0) >> 4,
    (b[16] ?? 0) & 15,
  ];
  const part = (k: FacePart, i: number) => {
    const list = FACE_PARTS[k];
    const v = nib[i] ?? 0;
    return list.includes(v) ? v : (list[v % list.length] as number);
  };
  const picks: AstronautPicks = {
    serial: b.slice(0, 5),
    name: pick(nameTable(), u(5, 3)),
    otherGalaxy,
    place,
    area,
    egg: eggCode === 0 ? null : (CARD_EGGS[eggCode - 1] as Egg),
    face: {
      skin: part("skin", 0),
      head: part("head", 1),
      eyes: part("eyes", 2),
      antenna: part("antenna", 3),
      mouth: part("mouth", 4),
      marks: part("marks", 5),
      helmet: ((b[8] ?? 0) & 2) === 2,
      sky: u(17, 4),
    },
  };
  const day = u(21, 2);
  const issuedDay = day === 0 ? null : DAY0 + day - 1;
  const round = u(23, 3);
  return {
    picks,
    astronaut: astronautFromPicks(picks),
    issued: issuedDay === null ? null : dayText(issuedDay),
    issuedDay,
    round: round === 0 ? null : round,
  };
}

/** 공유본 주소 */
export function cardUrl(origin: string, code: string): string {
  return `${origin}/stardraw/card?c=${code}`;
}
