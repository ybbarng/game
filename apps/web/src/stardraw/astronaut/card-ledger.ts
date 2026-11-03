import {
  decodeRecord,
  decodeRegistration,
  fromBase64Url,
  type PublicRoundFile,
  roundFilePath,
  taggedHash,
} from "@game/stardraw-core";

import type { SharedCard } from "./card-code";
import {
  ASTRONAUT_TAG,
  type Astronaut,
  astronautOf,
  crockford40,
} from "./identity";

/**
 * 등록증 공유본을 공개 장부와 대조한다(docs/36 11-66). 주소에 담긴 등록 회차의 회차 파일 하나만 받아,
 * 거기 실린 등록 열쇠 가운데 그린 값(등록번호·이름·주소·얼굴·드문 사진·배경 별)이 주소의 값과 모두 같은 것이 있는지 본다.
 * 가짜(값을 바꿔 본) 등록증을 가려내는 일이고, 보여 주는 사람이 그 등록증의 주인인지는 알 수 없다(그건 입상 확인의 몫).
 */
export type CardCheck =
  | { state: "found"; round: number }
  | { state: "missing" }
  /** 그 회차가 아직 봉인 전(회차 파일이 없다) */
  | { state: "unsealed" }
  /** 등록 회차를 담지 않았거나 대조할 장부가 없다 */
  | { state: "unknown" }
  | { state: "error" };

/** 닫힌 회차의 등록 열쇠와 봉인 시각(초, 0이면 모름). 아직 닫히지 않았으면 null */
export interface RoundRegistrations {
  pubs: readonly Uint8Array[];
  sealedAt: number;
}
export type RegistrationSource = (
  round: number,
) => Promise<RoundRegistrations | null>;

/** 서버 공개 장부의 회차 파일(`/ledger/rounds/NNNNNN.json`) 하나 */
export function serverRegistrations(
  base: string,
  fetchFn: typeof fetch = (...a) => fetch(...a),
): RegistrationSource {
  return async (round) => {
    const res = await fetchFn(`${base}${roundFilePath(round)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`회차 파일을 받지 못했습니다(${res.status})`);
    const file = (await res.json()) as PublicRoundFile;
    const record = decodeRecord(fromBase64Url(file.record));
    return {
      pubs: file.registrations.map(
        (r) => decodeRegistration(fromBase64Url(r)).pub,
      ),
      sealedAt: record.rootLoggedAt,
    };
  };
}

const sameFace = (a: Astronaut, b: Astronaut) =>
  a.face.skin === b.face.skin &&
  a.face.head === b.face.head &&
  a.face.eyes === b.face.eyes &&
  a.face.antenna === b.face.antenna &&
  a.face.mouth === b.face.mouth &&
  a.face.marks === b.face.marks &&
  a.face.helmet === b.face.helmet &&
  a.face.sky === b.face.sky;

/** 이 공개 열쇠의 등록증이 공유본과 같은가(그린 값 모두) */
export function sameAstronaut(pub: Uint8Array, card: Astronaut): boolean {
  // 등록번호부터 견준다(대부분 여기서 갈린다. 이름·주소 고르기는 해시를 여러 번 한다)
  const raw = crockford40(taggedHash(ASTRONAUT_TAG, pub));
  if (`SD-${raw.slice(0, 4)}-${raw.slice(4)}` !== card.number) return false;
  const a = astronautOf(pub);
  return (
    a.name === card.name &&
    a.placeId === card.placeId &&
    a.otherGalaxy === card.otherGalaxy &&
    a.egg === card.egg &&
    sameFace(a, card)
  );
}

/**
 * 발급일이 그 회차 봉인 날과 맞는가. 등록증 발급일은 등록 회차의 마감 날이고 봉인은 마감 직후라, 공유한 사람과 보는 사람의
 * 시간대가 달라도 하루 안쪽이다. 봉인 시각을 모르거나 발급일을 담지 않았으면 따지지 않는다
 */
function sameDay(card: SharedCard, sealedAt: number): boolean {
  if (card.issuedDay === null || sealedAt <= 0) return true;
  return Math.abs(card.issuedDay - Math.floor(sealedAt / 86_400)) <= 1;
}

export async function checkCard(
  card: SharedCard,
  source: RegistrationSource | null,
): Promise<CardCheck> {
  if (card.round === null || !source) return { state: "unknown" };
  let got: RoundRegistrations | null;
  try {
    got = await source(card.round);
  } catch {
    return { state: "error" };
  }
  if (!got) return { state: "unsealed" };
  const found =
    sameDay(card, got.sealedAt) &&
    got.pubs.some((pub) => sameAstronaut(pub, card.astronaut));
  return found ? { state: "found", round: card.round } : { state: "missing" };
}
