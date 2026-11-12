import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkParity,
  IGNORED,
  reasonInBody,
  report,
  resolveBody,
  WATCHED,
  watchedEntry,
} from "./native-parity.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MINI = "apps/web/src/cube/mini/MiniCubeApp.tsx";

describe("감시 목록", () => {
  it("적힌 파일·폴더가 저장소에 모두 있다(옮기거나 지우면 목록도 고친다)", () => {
    for (const w of [...WATCHED.map((w) => w.path), ...IGNORED]) {
      expect(existsSync(path.join(ROOT, w)), w).toBe(true);
    }
  });

  it("미니 화면·큐브 보기·키·연습은 감시하고, 시험 파일과 사이트 전용 대결은 뺀다", () => {
    expect(watchedEntry(MINI)?.why).toBe("미니 큐브 화면");
    expect(watchedEntry("apps/web/src/cube/view/mirror.ts")).not.toBeNull();
    expect(watchedEntry("apps/web/src/cube/input/keymaps.ts")).not.toBeNull();
    expect(watchedEntry("apps/web/src/cube/practice/stages.ts")).not.toBeNull();
    expect(watchedEntry("apps/web/src/cube/mini/hint.test.ts")).toBeNull();
    expect(
      watchedEntry("apps/web/src/cube/hero/big-hero-test-util.ts"),
    ).toBeNull();
    expect(watchedEntry("apps/web/src/cube/practice/versus.ts")).toBeNull();
    // 파일 하나로 적은 것은 이름이 비슷한 다른 파일을 잡지 않는다
    expect(watchedEntry("apps/web/src/cube/keys/drill.ts")).toBeNull();
    expect(watchedEntry("apps/web/src/cube/settings.test.ts")).toBeNull();
    expect(watchedEntry("apps/web/src/cube/tiers/TierTable.tsx")).toBeNull();
  });
});

describe("PR 본문의 통과 줄", () => {
  it("「네이티브 해당 없음: <이유>」를 찾는다", () => {
    expect(reasonInBody("요약\n\n네이티브 해당 없음: 사이트 대결 화면만")).toBe(
      "사이트 대결 화면만",
    );
    expect(reasonInBody("- 네이티브 해당 없음：문구만")).toBe("문구만");
    expect(reasonInBody("**네이티브 해당 없음**: 시험 정리\r\n다음 줄")).toBe(
      "시험 정리",
    );
  });

  it("이유가 비었거나 줄 중간에 있으면 통과 줄이 아니다", () => {
    expect(reasonInBody("네이티브 해당 없음:")).toBeNull();
    expect(reasonInBody("네이티브 해당 없음:   \n다음")).toBeNull();
    expect(reasonInBody("여기는 네이티브 해당 없음: 아님")).toBeNull();
    expect(reasonInBody("")).toBeNull();
    expect(reasonInBody(undefined)).toBeNull();
  });
});

describe("판정", () => {
  it("감시 대상이 안 바뀌면 통과", () => {
    const r = checkParity(
      ["docs/52-cubie-native.md", "apps/web/src/omok/a.ts"],
      "",
    );
    expect(r).toMatchObject({ ok: true, state: "none" });
  });

  it("미니 화면만 바뀌고 네이티브가 그대로면 실패하고, 바뀐 파일과 까닭을 알린다", () => {
    const r = checkParity([MINI, "docs/52-cubie-native.md"], "본문");
    expect(r).toMatchObject({ ok: false, state: "missing" });
    const text = report(r).join("\n");
    expect(text).toContain(MINI);
    expect(text).toContain("네이티브 해당 없음: <이유>");
  });

  it("apps/cubie·native 아래도 바뀌면 통과", () => {
    expect(
      checkParity([MINI, "apps/cubie/Sources/Cubie/NativeCube.swift"], "").ok,
    ).toBe(true);
    expect(checkParity([MINI, "native/cube-core/src/hint.rs"], "").ok).toBe(
      true,
    );
  });

  it("본문에 이유 줄이 있으면 통과", () => {
    const r = checkParity(
      [MINI],
      "네이티브 해당 없음: 기록 창(사이트 창)만 고침",
    );
    expect(r).toMatchObject({ ok: true, state: "reason" });
    expect(report(r)[0]).toBe("네이티브 해당 없음: 기록 창(사이트 창)만 고침");
  });
});

describe("본문 읽기", () => {
  const okFetch = (body) => async () => ({
    ok: true,
    json: async () => ({ body }),
  });

  it("이벤트 본문에 이유가 있으면 API를 부르지 않는다", async () => {
    let called = false;
    const body = await resolveBody(
      { PR_BODY: "네이티브 해당 없음: x", PR_API_URL: "u", GITHUB_TOKEN: "t" },
      async () => {
        called = true;
        return { ok: true, json: async () => ({}) };
      },
    );
    expect(body).toBe("네이티브 해당 없음: x");
    expect(called).toBe(false);
  });

  it("이벤트 본문에 없으면 지금 본문을 읽는다(본문을 고친 뒤 다시 돌리기)", async () => {
    const env = { PR_BODY: "옛 본문", PR_API_URL: "u", GITHUB_TOKEN: "t" };
    expect(await resolveBody(env, okFetch("네이티브 해당 없음: 새 이유"))).toBe(
      "네이티브 해당 없음: 새 이유",
    );
  });

  it("API가 실패하거나 주소·열쇠가 없으면 이벤트 본문을 쓴다", async () => {
    const env = { PR_BODY: "옛 본문", PR_API_URL: "u", GITHUB_TOKEN: "t" };
    expect(await resolveBody(env, async () => ({ ok: false }))).toBe("옛 본문");
    expect(
      await resolveBody(env, async () => {
        throw new Error("연결 끊김");
      }),
    ).toBe("옛 본문");
    expect(await resolveBody({ PR_BODY: "옛 본문" }, okFetch("x"))).toBe(
      "옛 본문",
    );
  });
});
