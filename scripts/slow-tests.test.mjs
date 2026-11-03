import { describe, expect, it } from "vitest";
import {
  issueTitle,
  parseState,
  readPlaywright,
  readVitest,
  renderBody,
  soloCommand,
  update,
} from "./slow-tests.mjs";

const ROOT = "/home/runner/work/game/game";
const CONFIG = {
  window: 3,
  minHits: 2,
  watchRatio: 0.8,
  limits: { "unit-file": 5000, "unit-test": 2500, e2e: 15000 },
};

/** 가짜 vitest JSON: files = { 경로: [[제목, ms], ...] }. 파일 시간은 시험 시간의 합 */
function vitestReport(files) {
  let t = 1_000_000;
  const start = t;
  const testResults = Object.entries(files).map(([file, tests]) => {
    const startTime = t;
    t += tests.reduce((a, [, ms]) => a + ms, 0);
    return {
      name: `${ROOT}/${file}`,
      startTime,
      endTime: t,
      status: "passed",
      assertionResults: tests.map(([title, ms]) => ({
        title,
        fullName: `묶음 ${title}`,
        status: ms == null ? "skipped" : "passed",
        duration: ms ?? undefined,
      })),
    };
  });
  return { startTime: start, testResults };
}

/** 가짜 playwright JSON: tests = [[파일, 줄, 제목, 프로젝트, ms|null(건너뜀)], ...] */
function playwrightReport(tests, duration = 100_000) {
  return {
    config: { rootDir: `${ROOT}/apps/web/e2e` },
    stats: { duration },
    suites: tests.map(([file, line, title, project, ms]) => ({
      title: file,
      file,
      specs: [],
      suites: [
        {
          title: "묶음",
          file,
          specs: [
            {
              title,
              file,
              line,
              tests: [
                {
                  projectName: project,
                  status: ms == null ? "skipped" : "expected",
                  results:
                    ms == null ? [] : [{ duration: ms, status: "passed" }],
                },
              ],
            },
          ],
        },
      ],
    })),
  };
}

/** 한 번의 CI 실행 결과를 기록에 더한다 */
function run(prevBody, { unit = {}, e2e = [] }, at) {
  const v = readVitest(vitestReport(unit), ROOT);
  const p = readPlaywright(playwrightReport(e2e), ROOT);
  const r = update(
    parseState(prevBody),
    { items: [...v.items, ...p.items], unitMs: v.totalMs, e2eMs: [p.totalMs] },
    CONFIG,
    { at, sha: `${at}abcdef` },
  );
  return { ...r, body: renderBody(r.state, r.slow, CONFIG) };
}

describe("시험 시간 읽기", () => {
  it("vitest는 파일 시간·시험 시간·전체 시간을 저장소 기준 경로로 읽고, 건너뛴 시험은 뺀다", () => {
    const r = readVitest(
      vitestReport({
        "apps/web/src/a.test.ts": [
          ["하나", 100],
          ["둘", 200],
        ],
        "packages/x/src/b.test.ts": [
          ["셋", 50],
          ["건너뜀", null],
        ],
      }),
      ROOT,
    );
    expect(r.totalMs).toBe(350);
    expect(r.items).toEqual([
      expect.objectContaining({
        kind: "unit-file",
        file: "apps/web/src/a.test.ts",
        ms: 300,
      }),
      expect.objectContaining({
        kind: "unit-test",
        name: "묶음 하나",
        ms: 100,
      }),
      expect.objectContaining({ kind: "unit-test", name: "묶음 둘", ms: 200 }),
      expect.objectContaining({
        kind: "unit-file",
        file: "packages/x/src/b.test.ts",
        ms: 50,
      }),
      expect.objectContaining({ kind: "unit-test", title: "셋", ms: 50 }),
    ]);
  });

  it("다른 폴더에서 받은 vitest 결과도 apps·packages부터의 경로로 읽는다", () => {
    const r = readVitest(
      vitestReport({ "apps/web/src/a.test.ts": [["하나", 1]] }),
      "/somewhere/else",
    );
    expect(r.items[0].file).toBe("apps/web/src/a.test.ts");
  });

  it("playwright는 프로젝트·묶음 제목·줄을 붙여 읽고, 건너뛴 시험은 뺀다", () => {
    const r = readPlaywright(
      playwrightReport(
        [
          ["online.spec.ts", 56, "한 판", "desktop", 22_800],
          ["online.spec.ts", 56, "한 판", "phone-portrait", null],
        ],
        348_000,
      ),
      ROOT,
    );
    expect(r.totalMs).toBe(348_000);
    expect(r.items).toEqual([
      {
        kind: "e2e",
        name: "[desktop] 묶음 › 한 판",
        file: "apps/web/e2e/online.spec.ts",
        line: 56,
        project: "desktop",
        ms: 22_800,
      },
    ]);
  });
});

describe("기준 비교와 흔들림", () => {
  const slowFile = (ms) => ({ "apps/web/src/slow.test.ts": [["느림", ms]] });

  it("한 번만 기준을 넘은 것은 올리지 않는다(최근 3번 가운데 2번 이상만)", () => {
    const a = run(null, { unit: slowFile(6000) }, "2026-11-01");
    expect(a.slow).toEqual([]);
    const b = run(a.body, { unit: slowFile(1000) }, "2026-11-02");
    expect(b.slow).toEqual([]);
    const c = run(b.body, { unit: slowFile(1000) }, "2026-11-03");
    expect(c.slow).toEqual([]);
  });

  it("두 번 넘으면 올리고, 처음 본 날은 처음 넘은 실행의 날이며 다음 실행에도 이어진다", () => {
    const a = run(null, { unit: slowFile(6000) }, "2026-11-01");
    const b = run(a.body, { unit: slowFile(1000) }, "2026-11-02");
    const c = run(b.body, { unit: slowFile(7000) }, "2026-11-03");
    expect(c.slow.map((s) => [s.kind, s.firstSeen])).toEqual([
      ["unit-file", "2026-11-01"],
      ["unit-test", "2026-11-01"],
    ]);
    // 기준의 80% 아래인 실행은 기록에 없다
    expect(c.slow[0].times).toEqual([6000, null, 7000]);
    const d = run(c.body, { unit: slowFile(6500) }, "2026-11-04");
    expect(d.slow[0].firstSeen).toBe("2026-11-01");
  });

  it("기준 안으로 들어와 최근 3번 가운데 넘은 것이 1번만 남으면 빠진다", () => {
    let body = null;
    for (const [ms, at] of [
      [6000, "2026-11-01"],
      [6000, "2026-11-02"],
      [1000, "2026-11-03"],
    ]) {
      body = run(body, { unit: slowFile(ms) }, at).body;
    }
    expect(parseState(body).firstSeen).not.toEqual({});
    const r = run(body, { unit: slowFile(1000) }, "2026-11-04");
    expect(r.slow).toEqual([]);
    expect(r.state.firstSeen).toEqual({});
    expect(r.state.runs).toHaveLength(3);
  });

  it("기준과 같은 시간은 넘은 것이 아니다", () => {
    const e2e = [["a.spec.ts", 1, "딱 기준", "desktop", 15_000]];
    const a = run(null, { e2e }, "2026-11-01");
    expect(run(a.body, { e2e }, "2026-11-02").slow).toEqual([]);
  });
});

describe("이슈 본문", () => {
  const twice = (input) => {
    const a = run(null, input, "2026-11-02");
    return run(a.body, input, "2026-11-03");
  };

  it("넘은 시험 표·혼자 돌려 보기 명령·전체 시간을 쓰고, 숨긴 기록을 되읽을 수 있다", () => {
    const r = twice({
      unit: {
        "apps/web/src/net/room.test.ts": [
          ["방 (두 판) | 끝까지", 3000],
          ["빠름", 2500],
        ],
      },
      e2e: [["online.spec.ts", 56, "한 판", "desktop", 22_800]],
    });
    expect(r.slow.map((s) => s.kind)).toEqual([
      "unit-file",
      "unit-test",
      "e2e",
    ]);
    expect(issueTitle(r.slow)).toBe("느린 시험 3개: 기준을 넘는 시험 고치기");
    expect(r.body).toContain("### 기준을 넘는 시험 3개");
    expect(r.body).toContain(
      "| 단위 파일 | (파일 전체) | `apps/web/src/net/room.test.ts` | 5.5초 · 5.5초 | 5.0초 | 2026-11-02 |",
    );
    // 이름 안의 | 는 표 칸을 나누지 않게
    expect(r.body).toContain("묶음 방 (두 판) \\| 끝까지");
    expect(r.body).toContain(
      "| 화면 시험 | [desktop] 묶음 › 한 판 | `apps/web/e2e/online.spec.ts:56` | 22.8초 · 22.8초 | 15.0초 | 2026-11-02 |",
    );
    expect(r.body).toContain(
      "nice -n 15 pnpm vitest run apps/web/src/net/room.test.ts\n",
    );
    expect(r.body).toContain(
      "nice -n 15 pnpm --filter @game/web exec playwright test e2e/online.spec.ts:56 --project=desktop --workers=1",
    );
    expect(r.body).toContain("| 2026-11-03 `2026-11` | 5.5초 | 100.0초 |");
    expect(parseState(r.body)).toEqual(r.state);
  });

  it("단위 시험 하나는 제목을 정규식으로 이스케이프해 -t로 고른다", () => {
    expect(
      soloCommand({
        kind: "unit-test",
        file: "packages/engine/src/deck.test.ts",
        name: "덱 4마(♣3) it's $1",
        title: "4마(♣3) it's $1",
      }),
    ).toBe(
      "nice -n 15 pnpm vitest run packages/engine/src/deck.test.ts -t '4마\\(♣3\\) it'\\''s \\$1$'",
    );
  });

  it("넘은 것이 없으면 「지금은 없음」으로 쓴다", () => {
    const r = run(
      null,
      { unit: { "a/b.test.ts": [["빠름", 10]] } },
      "2026-11-03",
    );
    expect(issueTitle(r.slow)).toBe("느린 시험: 지금은 없음");
    expect(r.body).toContain("지금은 기준을 넘는 시험이 없다.");
    expect(r.body).not.toContain("혼자 돌려 보기");
  });

  it("이름에 --> 가 있어도 숨긴 기록이 깨지지 않는다", () => {
    const r = twice({ unit: { "apps/x.test.ts": [["a --> b <c>", 3000]] } });
    expect(parseState(r.body).items).toEqual(r.state.items);
    const block = r.body.slice(r.body.lastIndexOf("<!-- slow-tests-state"));
    expect(block.match(/-->/g)).toHaveLength(1);
    // 표 칸에서는 HTML로 읽히지 않게(명령 칸은 코드 블록이라 그대로)
    expect(r.body).toContain("묶음 a --&gt; b &lt;c&gt;");
  });

  it("기록이 없거나 깨진 본문은 빈 기록으로 읽는다", () => {
    const empty = { v: 1, items: {}, runs: [], firstSeen: {} };
    expect(parseState(null)).toEqual(empty);
    expect(parseState("사람이 쓴 글")).toEqual(empty);
    expect(parseState("<!-- slow-tests-state\n{깨짐\n-->")).toEqual(empty);
  });
});
