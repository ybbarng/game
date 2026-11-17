import { describe, expect, it } from "vitest";
import { toneProblems } from "@/study/tone";

import { timePresetHelp } from "./TimePresetPicker";

/** 시간 설명은 모든 게임 옵션 화면에서 해요체 마침표 문장이다(docs/standing-rules.md 3절) */
describe("개인 시간 설명", () => {
  it.each(["none", "fast", "normal"] as const)(
    "%s: 해요체 문장이고 마침표로 끝난다",
    (p) => {
      expect(toneProblems([timePresetHelp(p)])).toEqual([]);
    },
  );
});
