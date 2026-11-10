import { describe, expect, it } from "vitest";

import { latestCubie } from "./appcast";

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
});
