import { DEFAULT_WEBAUTHN_POLICY } from "@game/stardraw-core";
import { describe, expect, it } from "vitest";

import { originConfig, originProblems } from "./config";

/** 환경 변수 대신 넣는 값(process.env를 건드리지 않는다) */
const from =
  (values: Record<string, string>) =>
  (name: string): string | undefined =>
    values[name];

const problemsOf = (values: Record<string, string>) => {
  const { policy, devOrigins } = originConfig(from(values));
  return originProblems(policy, devOrigins);
};

describe("운영 시작 검사: 출처", () => {
  it("운영 설정(기본값, 또는 game.byb.kr과 https 출처 하나)은 통과하고, 받는 출처가 공개 검사기의 출처 안에 있다", () => {
    for (const values of [
      {},
      {
        STARDRAW_RP_ID: "game.byb.kr",
        STARDRAW_ORIGINS: "https://game.byb.kr",
      },
    ]) {
      const { policy, devOrigins } = originConfig(from(values));
      expect(originProblems(policy, devOrigins)).toEqual([]);
      expect(policy.rpId).toBe(DEFAULT_WEBAUTHN_POLICY.rpId);
      expect(devOrigins).toEqual([]);
      for (const o of policy.origins)
        expect(DEFAULT_WEBAUTHN_POLICY.origins).toContain(o);
    }
  });

  it("운영 rpId에 https가 아닌 출처나 localhost가 있으면 거절한다", () => {
    expect(
      problemsOf({
        STARDRAW_RP_ID: "game.byb.kr",
        STARDRAW_ORIGINS: "https://game.byb.kr,http://localhost:3456",
      }),
    ).toEqual([
      "STARDRAW_ORIGINS에 https가 아닌 출처가 있다: http://localhost:3456",
      "STARDRAW_ORIGINS에 localhost 출처가 있다: http://localhost:3456",
      "STARDRAW_ORIGINS의 출처가 rpId(game.byb.kr) 아래가 아니다: http://localhost:3456",
      "STARDRAW_ORIGINS의 http://localhost:3456는 공개 장부 검사가 받지 않는 출처다(받는 출처: https://game.byb.kr)",
    ]);
    expect(
      problemsOf({
        STARDRAW_RP_ID: "game.byb.kr",
        STARDRAW_DEV_ORIGINS: "http://localhost:4173",
      }),
    ).toEqual([
      "STARDRAW_DEV_ORIGINS에 https가 아닌 출처가 있다: http://localhost:4173",
      "STARDRAW_DEV_ORIGINS에 localhost 출처가 있다: http://localhost:4173",
    ]);
    expect(problemsOf({ STARDRAW_ORIGINS: "http://game.byb.kr" })).toContain(
      "STARDRAW_ORIGINS에 https가 아닌 출처가 있다: http://game.byb.kr",
    );
    // 같은 rpId 아래여도 공개 검사기가 받지 않는 출처는 거절(서버만 받고 검사에서 틀리는 서명이 생긴다)
    expect(
      problemsOf({
        STARDRAW_ORIGINS: "https://game.byb.kr,https://x.game.byb.kr",
      }),
    ).toEqual([
      "STARDRAW_ORIGINS의 https://x.game.byb.kr는 공개 장부 검사가 받지 않는 출처다(받는 출처: https://game.byb.kr)",
    ]);
    expect(problemsOf({ STARDRAW_ORIGINS: "https://game.byb.kr/" })).toEqual([
      "STARDRAW_ORIGINS의 값이 출처 모양이 아니다: https://game.byb.kr/",
      "STARDRAW_ORIGINS의 https://game.byb.kr/는 공개 장부 검사가 받지 않는 출처다(받는 출처: https://game.byb.kr)",
    ]);
  });

  it("다른 운영 rpId도 https와 rpId 아래 출처만 받는다", () => {
    expect(
      problemsOf({
        STARDRAW_RP_ID: "example.org",
        STARDRAW_ORIGINS: "https://example.org,https://game.byb.kr",
      }),
    ).toEqual([
      "STARDRAW_ORIGINS의 출처가 rpId(example.org) 아래가 아니다: https://game.byb.kr",
    ]);
  });

  it("rpId가 localhost(로컬·리허설 화면 확인)면 검사하지 않는다", () => {
    expect(
      problemsOf({
        STARDRAW_RP_ID: "localhost",
        STARDRAW_ORIGINS: "http://localhost:3456,http://localhost:4173",
        STARDRAW_DEV_ORIGINS: "http://localhost:3456",
      }),
    ).toEqual([]);
  });
});
