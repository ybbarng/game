/**
 * 맥 앱 Cubie의 업데이트 목록(Sparkle appcast, `public/cubie/appcast.xml`)에서 가장 새 판을 읽는다.
 * 내려받기 주소 `/cubie/download`(app/cubie/download)가 빌드할 때 이 값으로 그 판의 zip을 가리킨다.
 * 그래서 새 판을 내도 README·사이트의 내려받기 링크를 고치지 않는다. GitHub의 「최신 릴리스」는 이 저장소의
 * 다른 릴리스(사이트 화면 코드)가 차지해 쓰지 않는다(docs/47 15-12).
 */

export interface CubieRelease {
  /** 보이는 판(`sparkle:shortVersionString`) */
  version: string;
  /** zip 주소(`enclosure url`) */
  url: string;
  /** 이 판이 도는 가장 낮은 macOS(`sparkle:minimumSystemVersion`), 없으면 null */
  minimumSystem: string | null;
}

/** release.sh가 새 판을 맨 위에 더하므로 첫 `<item>`이 가장 새 판이다 */
export function latestCubie(xml: string): CubieRelease {
  const item = /<item>([\s\S]*?)<\/item>/.exec(xml)?.[1];
  if (!item) throw new Error("appcast에 판이 없다");
  const version = /<sparkle:shortVersionString>([^<]+)</.exec(item)?.[1];
  const url = /<enclosure\b[^>]*\burl="([^"]+)"/.exec(item)?.[1];
  if (!version || !url)
    throw new Error("appcast 첫 판에 판 번호나 주소가 없다");
  if (!url.startsWith("https://github.com/ybbarng/game/releases/download/"))
    throw new Error(`appcast 주소가 이 저장소 릴리스가 아니다: ${url}`);
  const minimumSystem =
    /<sparkle:minimumSystemVersion>([^<]+)</.exec(item)?.[1] ?? null;
  return { version: version.trim(), url, minimumSystem };
}
