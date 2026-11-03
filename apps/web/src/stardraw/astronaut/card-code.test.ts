// @vitest-environment node
import {
  fromBase64Url,
  taggedHash,
  toBase64Url,
  toHex,
} from "@game/stardraw-core";
import { describe, expect, it } from "vitest";

import {
  CARD_VERSION,
  cardCodeOf,
  cardUrl,
  codeOf,
  dayOf,
  decodeCard,
  encodeCard,
} from "./card-code";
import {
  ASTRONAUT_TAG,
  astronautOf,
  FACE_PARTS,
  picksFromHash,
  serialOf,
} from "./identity";
import { NAMES } from "./names";
import { ARM_PLACES, OTHER_GALAXY_PLACES, type Place } from "./places";

/** 정해 둔 공개 열쇠(원시 P-256 꼴: 04 ‖ 64바이트) */
const key = (i: number) => {
  const k = new Uint8Array(65);
  k[0] = 4;
  for (let j = 1; j < 65; j++) k[j] = (i * 41 + j * 13 + ((i * j) % 7)) & 255;
  return k;
};
const KEYS = Array.from({ length: 40 }, (_, i) => key(i));
const ISSUED = new Date(2026, 10, 3, 14, 20).getTime();

describe("공유본 값(부호화·해독)", () => {
  it("열쇠마다 같은 등록증이 다시 그려진다(이름·주소·얼굴·드문 사진·발급일·회차)", () => {
    for (const [i, pub] of KEYS.entries()) {
      const code = cardCodeOf(pub, { issuedAt: ISSUED, round: 100 + i });
      const card = decodeCard(code);
      expect(card).not.toBeNull();
      expect(card?.astronaut).toEqual(astronautOf(pub));
      expect(card?.picks.serial).toEqual(serialOf(pub));
      expect(card?.issued).toBe("2026. 11. 3.");
      expect(card?.issuedDay).toBe(dayOf(ISSUED));
      expect(card?.round).toBe(100 + i);
    }
  });

  it("다른 은하 주소·대륙 주소도 그대로 돌아온다", () => {
    // 정해 둔 열쇠 40개에 다른 은하가 있다(위 왕복 시험이 지난다)
    const all = KEYS.map((k) => astronautOf(k));
    expect(all.some((a) => a.otherGalaxy)).toBe(true);
    // 깃발 하나만 바꿔도 다른 은하 목록에서 고른다
    const code = cardCodeOf(KEYS[0] as Uint8Array, {
      issuedAt: null,
      round: null,
    });
    const bytes = fromBase64Url(code.slice(3));
    bytes[8] = (bytes[8] ?? 0) | 1;
    const galaxy = decodeCard(`v1.${toBase64Url(bytes)}`);
    expect(galaxy?.astronaut.otherGalaxy).toBe(true);
    expect(OTHER_GALAXY_PLACES.map((p) => p.id)).toContain(
      galaxy?.picks.place.id,
    );
    // 지구 대륙: 고른 값을 지구로 바꿔 담으면 그 대륙이 돌아온다
    const earth = ARM_PLACES.find((p) => p.areas?.length);
    const picks = picksFromHash(
      taggedHash(ASTRONAUT_TAG, KEYS[1] as Uint8Array),
    );
    for (const area of earth?.areas ?? []) {
      const back = decodeCard(
        encodeCard(
          { ...picks, otherGalaxy: false, place: earth as Place, area },
          { issuedDay: null, round: null },
        ),
      );
      expect(back?.astronaut.placeId).toBe(area.id);
      expect(back?.astronaut.home).toBe(`지구 ${area.name}`);
    }
  });

  it("공개 열쇠도, 열쇠 해시도 주소에 없다(등록번호 40비트만 열쇠에서 나온다)", () => {
    for (const pub of KEYS.slice(0, 8)) {
      const code = cardCodeOf(pub, { issuedAt: ISSUED, round: 7 });
      const url = cardUrl("https://game.byb.kr", code);
      const bytes = fromBase64Url(code.slice(3));
      expect(bytes).toHaveLength(26);
      expect(url).not.toContain(toBase64Url(pub).slice(0, 12));
      expect(url).not.toContain(toHex(pub).slice(0, 12));
      // 열쇠 바이트가 이어서 들어 있지 않다
      const hex = toHex(bytes);
      for (let i = 1; i + 6 <= 65; i += 6)
        expect(hex).not.toContain(toHex(pub.slice(i, i + 6)));
      expect(url.length).toBeLessThan(80);
    }
  });

  it("판 번호·길이가 맞지 않으면 알아볼 수 없다", () => {
    const good = cardCodeOf(key(1), { issuedAt: ISSUED, round: 3 });
    expect(decodeCard(null)).toBeNull();
    expect(decodeCard("")).toBeNull();
    expect(decodeCard(good.replace(`${CARD_VERSION}.`, "v9."))).toBeNull();
    expect(decodeCard(good.slice(3))).toBeNull();
    expect(decodeCard(good.slice(0, -4))).toBeNull();
    expect(decodeCard(`${good}AAAA`)).toBeNull();
    expect(decodeCard("v1.@@@@")).toBeNull();
  });

  it("범위 밖 값은 깨지지 않고 목록 안으로 맞춘다(바꿔 보는 재미)", () => {
    const all = decodeCard(`v1.${toBase64Url(new Uint8Array(26).fill(255))}`);
    expect(all).not.toBeNull();
    const zero = decodeCard(`v1.${toBase64Url(new Uint8Array(26))}`);
    expect(zero?.issued).toBeNull();
    expect(zero?.round).toBeNull();
    for (const c of [all, zero]) {
      if (!c) throw new Error("해독 실패");
      const a = c.astronaut;
      expect(NAMES).toContain(a.name);
      expect(a.number).toMatch(/^SD-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
      for (const part of [
        "skin",
        "head",
        "eyes",
        "antenna",
        "mouth",
        "marks",
      ] as const)
        expect(FACE_PARTS[part]).toContain(a.face[part]);
      expect(a.address.length).toBeGreaterThan(2);
    }
    // 한 글자를 바꾸면 다른 등록증 한 장
    const code = cardCodeOf(key(2), { issuedAt: ISSUED, round: 3 });
    const tweaked = `${code.slice(0, 12)}${code[12] === "A" ? "B" : "A"}${code.slice(13)}`;
    expect(decodeCard(tweaked)).not.toBeNull();
  });
});

describe("목록 항목 표", () => {
  it("같은 목록 안에서 표가 겹치지 않는다(겹치면 판 번호를 올린다)", () => {
    const unique = (codes: number[]) => new Set(codes).size === codes.length;
    expect(unique(NAMES.map((n) => codeOf("name", n, 3)))).toBe(true);
    expect(unique(ARM_PLACES.map((p) => codeOf("place", p.id, 3)))).toBe(true);
    expect(
      unique(OTHER_GALAXY_PLACES.map((p) => codeOf("galaxy", p.id, 3))),
    ).toBe(true);
    for (const p of ARM_PLACES)
      if (p.areas)
        expect(unique(p.areas.map((a) => codeOf("area", a.id, 2)))).toBe(true);
  });

  it("목록 차례와 상관없다: 표는 id만으로 정해진다", () => {
    expect(codeOf("name", "별하솔", 3)).toBe(codeOf("name", "별하솔", 3));
    expect(codeOf("name", "별하솔", 3)).not.toBe(codeOf("place", "별하솔", 3));
  });
});
