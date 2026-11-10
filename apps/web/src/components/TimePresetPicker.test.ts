import { describe, expect, it } from "vitest";

import { timePresetHelp } from "./TimePresetPicker";

/** 시간 설명은 그 옵션 화면 말투를 따르고(은하는 「~해요」), 한 설명 안에서 섞지 않는다 */
describe("개인 시간 설명", () => {
  const presets = ["none", "fast", "normal"] as const;

  it.each(presets)(
    "%s: 「~한다」 설명은 해요체 끝말이 없고 마침표로 끝난다",
    (p) => {
      const text = timePresetHelp(p);
      expect(text).toMatch(/다\.$|\)\.$/);
      expect(text).not.toMatch(/요[.,(]/);
    },
  );

  it.each(presets)(
    "%s: 「~해요」 설명은 해라체 끝말이 없고 마침표로 끝난다",
    (p) => {
      const text = timePresetHelp(p, "polite");
      expect(text).toMatch(/요\.$|\)\.$/);
      expect(text).not.toMatch(/(한다|준다|둔다|진다)[.(]/);
    },
  );
});
