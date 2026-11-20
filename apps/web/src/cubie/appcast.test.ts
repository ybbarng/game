import { describe, expect, it } from "vitest";

import {
  appcastDeltas,
  appcastVersions,
  DELTA_BASE,
  deltaFileName,
  deltaFilesInUse,
  deltasXml,
  latestCubie,
  withDeltas,
} from "./appcast";

declare global {
  interface ImportMeta {
    glob<T>(
      pattern: string | string[],
      options: { query: "?raw"; import: "default"; eager: true },
    ): Record<string, T>;
  }
}

// 저장소의 appcast는 import.meta.glob(?raw)으로 읽는다. 모듈 그래프에 잡혀 appcast가 바뀌면 `vitest --changed`가
// 이 시험만 돌린다(예전처럼 forceRerunTriggers에 두면 새 판마다 단위 시험이 전부 돌았다, 2026-11-10)
const REPO_APPCAST = Object.values(
  import.meta.glob<string>("../../public/cubie/appcast.xml", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)[0] as string;

// 사이트에 두는 차이 파일(release.sh가 appcast PR에 함께 커밋한다). 이름만 쓰지만 eager로 읽어야 모듈 그래프에 잡혀
// 차이 파일이 더해지거나 지워지면 이 시험이 돈다(2026-11-17 규칙, docs/38 16절)
const REPO_DELTA_FILES = Object.keys(
  import.meta.glob<string>("../../public/cubie/deltas/*", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
).map((path) => path.slice(path.lastIndexOf("/") + 1));

const item = (v: string) => `
    <item>
      <title>Cubie ${v}</title>
      <sparkle:version>${v}</sparkle:version>
      <sparkle:shortVersionString>${v}</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>15.0</sparkle:minimumSystemVersion>
      <enclosure url="https://github.com/ybbarng/game/releases/download/cubie-v${v}/Cubie.zip" length="1" type="application/octet-stream" sparkle:edSignature="x"/>
    </item>`;

const feed = (...items: string[]) =>
  `<?xml version="1.0"?><rss><channel><title>Cubie</title>${items.join("")}</channel></rss>`;

describe("latestCubie", () => {
  it("맨 위 판을 고른다", () => {
    expect(latestCubie(feed(item("0.2.0"), item("0.1.1")))).toEqual({
      version: "0.2.0",
      url: "https://github.com/ybbarng/game/releases/download/cubie-v0.2.0/Cubie.zip",
      minimumSystem: "15.0",
    });
  });

  it("판이 없거나 다른 곳 주소면 빌드를 멈춘다", () => {
    expect(() => latestCubie(feed())).toThrow();
    expect(() =>
      latestCubie(
        feed(item("0.2.0").replace("github.com/ybbarng/game", "example.com")),
      ),
    ).toThrow();
  });

  it("저장소의 appcast를 읽는다(내려받기 페이지가 빌드 때 읽는 파일)", () => {
    expect(REPO_APPCAST).toContain("<rss");
    const latest = latestCubie(REPO_APPCAST);
    expect(latest.url).toBe(
      `https://github.com/ybbarng/game/releases/download/cubie-v${latest.version}/Cubie.zip`,
    );
  });

  it("차이 목록이 있어도 맨 위 판의 전체 zip을 고른다", () => {
    const xml = withDeltas(feed(item("0.2.0"), item("0.1.1")), "0.2.0", [
      { from: "0.1.1", length: 10, signature: "c2ln" },
    ]);
    expect(latestCubie(xml).url).toBe(
      "https://github.com/ybbarng/game/releases/download/cubie-v0.2.0/Cubie.zip",
    );
  });
});

const SIG_A =
  "vPAG/a7vep5g7jCo2CSxMYEkNetaMSC+XTqvHlppB/0BFHWdkrdY6kVL3hkQ/LGpWO31Koet3xd2hcIYTWpVBw==";
const SIG_B =
  "gi6xaXl3niPagEp2lukykt6EyfNf5Bv1b9rsxLZgktSHtX90lMDe9qh+FBryOC0uCJIf5GjcAQ9bHy895fQKDA==";

describe("차이 업데이트 조각(Sparkle 2 <sparkle:deltas>)", () => {
  it("옛 판마다 enclosure 한 줄: 사이트 주소, deltaFrom, 길이, 서명", () => {
    expect(
      deltasXml("0.11.3", [
        { from: "0.11.2", length: 275050, signature: SIG_A },
        { from: "0.11.1", length: 296646, signature: SIG_B },
      ]),
    ).toBe(
      "      <sparkle:deltas>\n" +
        `        <enclosure url="https://game.byb.kr/cubie/deltas/0.11.2-0.11.3.delta" sparkle:deltaFrom="0.11.2" length="275050" type="application/octet-stream" sparkle:edSignature="${SIG_A}"/>\n` +
        `        <enclosure url="https://game.byb.kr/cubie/deltas/0.11.1-0.11.3.delta" sparkle:deltaFrom="0.11.1" length="296646" type="application/octet-stream" sparkle:edSignature="${SIG_B}"/>\n` +
        "      </sparkle:deltas>\n",
    );
  });

  it("차이가 없으면 조각도 없다", () => {
    expect(deltasXml("0.11.3", [])).toBe("");
  });

  it("길이·서명·판 번호가 이상하면 appcast를 쓰지 않고 멈춘다", () => {
    expect(() =>
      deltasXml("0.11.3", [{ from: "0.11.2", length: 0, signature: SIG_A }]),
    ).toThrow("길이");
    expect(() =>
      deltasXml("0.11.3", [
        { from: "0.11.2", length: 1, signature: 'x"/><evil' },
      ]),
    ).toThrow("서명");
    expect(() => deltaFileName("0.11", "0.11.3")).toThrow("판 번호");
  });
});

describe("withDeltas: 새 판 항목에 차이 목록을 넣는다", () => {
  const three = feed(item("0.11.3"), item("0.11.2"), item("0.11.1"));

  it("맨 위 항목의 전체 zip enclosure 바로 뒤에 넣고, 다시 읽으면 같은 값이다", () => {
    const xml = withDeltas(three, "0.11.3", [
      { from: "0.11.2", length: 275050, signature: SIG_A },
    ]);
    expect(xml).toContain(
      `sparkle:edSignature="x"/>\n      <sparkle:deltas>\n        <enclosure url="${DELTA_BASE}0.11.2-0.11.3.delta"`,
    );
    expect(appcastDeltas(xml)).toEqual([
      {
        version: "0.11.3",
        deltas: [
          {
            url: `${DELTA_BASE}0.11.2-0.11.3.delta`,
            from: "0.11.2",
            length: 275050,
            signature: SIG_A,
          },
        ],
      },
      { version: "0.11.2", deltas: [] },
      { version: "0.11.1", deltas: [] },
    ]);
  });

  it("새 판을 더하면 아래 판 항목의 차이 목록은 지운다(가리키는 파일은 새 판 것만)", () => {
    const before = withDeltas(feed(item("0.11.2"), item("0.11.1")), "0.11.2", [
      { from: "0.11.1", length: 5, signature: SIG_B },
    ]);
    // release.sh처럼 맨 위에 새 판 항목을 더한 뒤 차이 목록을 넣는다
    const after = withDeltas(
      before.replace("<title>Cubie</title>", `$&${item("0.11.3")}`),
      "0.11.3",
      [{ from: "0.11.2", length: 7, signature: SIG_A }],
    );
    expect(appcastVersions(after)).toEqual(["0.11.3", "0.11.2", "0.11.1"]);
    expect(deltaFilesInUse(after)).toEqual(["0.11.2-0.11.3.delta"]);
    expect(after).not.toContain("0.11.1-0.11.2.delta");
  });

  it("두 번 넣어도 한 벌이고, 빈 목록이면 차이 목록이 없어진다", () => {
    const deltas = [{ from: "0.11.2", length: 3, signature: SIG_A }];
    const once = withDeltas(three, "0.11.3", deltas);
    expect(withDeltas(once, "0.11.3", deltas)).toBe(once);
    expect(withDeltas(once, "0.11.3", [])).toBe(three);
  });

  it("맨 위가 아닌 판, appcast에 없는 옛 판, 겹친 옛 판은 받지 않는다", () => {
    const d = (from: string) => ({ from, length: 1, signature: SIG_A });
    expect(() => withDeltas(three, "0.11.2", [d("0.11.1")])).toThrow(
      "맨 위 판",
    );
    expect(() => withDeltas(three, "0.11.3", [d("0.10.0")])).toThrow(
      "없는 옛 판",
    );
    expect(() => withDeltas(three, "0.11.3", [d("0.11.3")])).toThrow(
      "없는 옛 판",
    );
    expect(() =>
      withDeltas(three, "0.11.3", [d("0.11.2"), d("0.11.2")]),
    ).toThrow("둘");
  });
});

describe("저장소의 appcast와 차이 파일", () => {
  const items = appcastDeltas(REPO_APPCAST);

  it("차이 목록은 맨 위 판에만 있다", () => {
    expect(
      items
        .slice(1)
        .filter((i) => i.deltas.length > 0)
        .map((i) => i.version),
    ).toEqual([]);
  });

  it("차이 항목은 사이트 자리의 <옛 판>-<새 판>.delta이고, 옛 판은 appcast의 아래 판이며, 실제 서명이 있다", () => {
    const [top, ...older] = items;
    if (!top) throw new Error("appcast에 판이 없다");
    const olderVersions = older.map((i) => i.version);
    for (const d of top.deltas) {
      expect(d.url).toBe(DELTA_BASE + deltaFileName(d.from, top.version));
      expect(olderVersions).toContain(d.from);
      expect(d.length).toBeGreaterThan(0);
      // ed25519 서명 64바이트 = base64 88글자. --dry-run의 가짜 값이 들어가면 걸린다
      expect(d.signature).toMatch(/^[A-Za-z0-9+/]{86}==$/);
    }
  });

  it("appcast가 가리키는 차이 파일은 모두 있고, 가리키지 않는 파일은 없다(release.sh가 지운다)", () => {
    expect([...REPO_DELTA_FILES].sort()).toEqual(
      [...deltaFilesInUse(REPO_APPCAST)].sort(),
    );
  });
});
