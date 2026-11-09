import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { latestCubie } from "./appcast";

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
    const xml = readFileSync(
      new URL("../../public/cubie/appcast.xml", import.meta.url),
      "utf8",
    );
    const latest = latestCubie(xml);
    expect(latest.url).toBe(
      `https://github.com/ybbarng/game/releases/download/cubie-v${latest.version}/Cubie.zip`,
    );
  });
});
