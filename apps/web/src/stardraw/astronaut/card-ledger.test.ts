// @vitest-environment node
import {
  emptyWinners,
  encodeRecord,
  encodeRegistration,
  type RoundRecord,
  roundFilePath,
  toBase64Url,
} from "@game/stardraw-core";
import { describe, expect, it } from "vitest";

import { cardCodeOf, decodeCard, type SharedCard } from "./card-code";
import {
  checkCard,
  type RegistrationSource,
  sameAstronaut,
  serverRegistrations,
} from "./card-ledger";
import { astronautOf } from "./identity";

const key = (i: number) => {
  const k = new Uint8Array(65);
  k[0] = 4;
  for (let j = 1; j < 65; j++) k[j] = (i * 29 + j * 17) & 255;
  return k;
};
const MINE = key(1);
const OTHERS = [key(2), key(3), key(4)];
/** 2026-11-03 05:00 UTC(한국 14시) */
const SEALED = Date.UTC(2026, 10, 3, 5, 0) / 1000;

const cardOf = (
  pub: Uint8Array,
  round: number | null,
  issuedAt = SEALED * 1000,
) => decodeCard(cardCodeOf(pub, { issuedAt, round })) as SharedCard;

/** 한 회차만 닫힌 장부(그 회차에 실린 등록 열쇠) */
const ledgerWith =
  (round: number, pubs: Uint8Array[]): RegistrationSource =>
  async (r) =>
    r === round ? { pubs, sealedAt: SEALED } : null;

describe("공유본을 장부와 대조", () => {
  it("그 회차 등록 열쇠 가운데 같은 등록증이 있으면 등록된 우주인", async () => {
    const check = await checkCard(
      cardOf(MINE, 5),
      ledgerWith(5, [...OTHERS, MINE]),
    );
    expect(check).toEqual({ state: "found", round: 5 });
  });

  it("값을 하나라도 바꾼 등록증은 장부에서 찾을 수 없다", async () => {
    const card = cardOf(MINE, 5);
    const other = astronautOf(OTHERS[0] as Uint8Array);
    const fakes: SharedCard[] = [
      {
        ...card,
        astronaut: {
          ...card.astronaut,
          name: other.name === card.astronaut.name ? "별하린" : other.name,
        },
      },
      {
        ...card,
        astronaut: {
          ...card.astronaut,
          face: {
            ...card.astronaut.face,
            mouth: (card.astronaut.face.mouth + 1) % 6,
          },
        },
      },
      {
        ...card,
        astronaut: {
          ...card.astronaut,
          placeId: "mars" === card.astronaut.placeId ? "venus" : "mars",
        },
      },
      {
        ...card,
        astronaut: {
          ...card.astronaut,
          egg: card.astronaut.egg ? null : "laika",
        },
      },
      // 남의 등록번호에 내 얼굴
      { ...card, astronaut: { ...card.astronaut, number: other.number } },
    ];
    for (const fake of fakes)
      expect(await checkCard(fake, ledgerWith(5, [...OTHERS, MINE]))).toEqual({
        state: "missing",
      });
    // 등록 회차를 바꿔도 그 회차에는 없다
    expect(
      await checkCard(cardOf(MINE, 4), async (r) =>
        r === 4
          ? { pubs: OTHERS, sealedAt: SEALED }
          : { pubs: [MINE], sealedAt: SEALED },
      ),
    ).toEqual({ state: "missing" });
  });

  it("발급일이 봉인 날에서 이틀 넘게 떨어지면 찾을 수 없다(하루는 시간대 차이로 둔다)", async () => {
    const day = 86_400_000;
    const src = ledgerWith(5, [MINE]);
    expect(
      (await checkCard(cardOf(MINE, 5, SEALED * 1000 + day), src)).state,
    ).toBe("found");
    expect(
      (await checkCard(cardOf(MINE, 5, SEALED * 1000 - 3 * day), src)).state,
    ).toBe("missing");
  });

  it("그 회차가 아직 봉인 전이면 장부에 오르지 않은 등록증", async () => {
    expect(await checkCard(cardOf(MINE, 9), ledgerWith(5, [MINE]))).toEqual({
      state: "unsealed",
    });
  });

  it("회차가 없거나 장부가 없으면 대조할 수 없고, 받다 실패하면 차분히 알린다", async () => {
    expect(await checkCard(cardOf(MINE, null), ledgerWith(5, [MINE]))).toEqual({
      state: "unknown",
    });
    expect(await checkCard(cardOf(MINE, 5), null)).toEqual({
      state: "unknown",
    });
    expect(
      await checkCard(cardOf(MINE, 5), async () => {
        throw new Error("끊김");
      }),
    ).toEqual({ state: "error" });
  });

  it("같은 열쇠면 같은 등록증, 다른 열쇠면 다르다", () => {
    expect(sameAstronaut(MINE, astronautOf(MINE))).toBe(true);
    expect(sameAstronaut(key(2), astronautOf(MINE))).toBe(false);
  });
});

describe("서버 회차 파일 받기", () => {
  const record = (round: number): RoundRecord => ({
    v: 1,
    round,
    prev: new Uint8Array(32),
    count: 0,
    merkleRoot: new Uint8Array(32),
    registrationCount: 2,
    registrationRoot: new Uint8Array(32),
    rootLoggedAt: SEALED,
    void: true,
    drandRound: 1,
    drandSignature: new Uint8Array(0),
    numbers: [],
    bonus: 0,
    winners: emptyWinners(),
    scheduleChanges: [],
    nicknames: [],
  });
  const files = new Map<string, unknown>([
    [
      roundFilePath(5),
      {
        record: toBase64Url(encodeRecord(record(5))),
        tickets: [],
        registrations: [OTHERS[0], MINE].map((pub) =>
          toBase64Url(
            encodeRegistration({
              v: 1,
              credentialId: Uint8Array.of(1, 2, 3),
              pub: pub as Uint8Array,
              nonce: 7,
            }),
          ),
        ),
      },
    ],
  ]);
  const asked: string[] = [];
  const fakeFetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    if (url.endsWith("/boom")) return new Response("", { status: 500 });
    const path = url.replace("https://x/api", "");
    const body = files.get(path);
    return body
      ? new Response(JSON.stringify(body), { status: 200 })
      : new Response("", { status: 404 });
  }) as typeof fetch;
  const src = serverRegistrations("https://x/api", fakeFetch);

  it("그 회차 파일 하나만 받아 세 경우를 가른다(있음·없음·봉인 전)", async () => {
    asked.length = 0;
    expect(await checkCard(cardOf(MINE, 5), src)).toEqual({
      state: "found",
      round: 5,
    });
    expect(asked).toEqual(["https://x/api/ledger/rounds/000005.json"]);
    expect((await checkCard(cardOf(key(9), 5), src)).state).toBe("missing");
    expect((await checkCard(cardOf(MINE, 6), src)).state).toBe("unsealed");
  });

  it("서버 오류는 오류로", async () => {
    const broken = serverRegistrations(
      "https://x/api",
      (async () => new Response("", { status: 503 })) as typeof fetch,
    );
    expect((await checkCard(cardOf(MINE, 5), broken)).state).toBe("error");
  });
});
