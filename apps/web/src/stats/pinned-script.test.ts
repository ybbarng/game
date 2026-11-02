import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 같은 출처에서 내보내는 바깥 통계 스크립트(docs/33, docs/39 3절 1번). game.byb.kr에서 도는 코드는 같은 출처의
 * 기기 저장소(별 따기 등록증·소속 증서)를 모두 읽을 수 있다. 그래서 내용이 바뀌거나 새 파일이 생기면 이 시험이
 * 실패한다. 바꿀 때는 새 파일이 실행 중에 바깥 코드를 받지 않는지, 보내는 값(주소 뒤 # 조각 등)을 다시 검토한 뒤
 * 아래 해시를 고친다(2026-11-02 사용자: 바뀌면 다시 검토해야 한다)
 */
const PINNED: Record<string, string> = {
  "umami-3.4.1.js":
    "b0daad94fb47a7826d88ef692a319fa8f96479b17a22ae2a7aa5c58156dfe3db",
};

const DIR = join(__dirname, "../../public/stats");

describe("고정한 통계 스크립트", () => {
  it("검토한 파일만 있다(새 파일은 검토 뒤 PINNED에 더한다)", () => {
    expect(readdirSync(DIR).sort()).toEqual(Object.keys(PINNED).sort());
  });

  it.each(Object.entries(PINNED))(
    "%s 내용이 검토한 그대로다(바꾸면 docs/33·39 검토 뒤 해시를 고친다)",
    (name, sha256) => {
      const digest = createHash("sha256")
        .update(readFileSync(join(DIR, name)))
        .digest("hex");
      expect(digest).toBe(sha256);
    },
  );
});
