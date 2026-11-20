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

/*
 * 차이 업데이트(Sparkle 2 delta, docs/47 15-12 「차이 업데이트」).
 * 새 판 항목에 옛 판 몇 개에서 새 판으로 가는 차이 파일을 `<sparkle:deltas>`로 적는다. 차이 파일은 사이트
 * `public/cubie/deltas/<옛 판>-<새 판>.delta`에 둔다. Sparkle은 깔린 판(`sparkle:deltaFrom`)에 맞는 차이 파일이
 * 있으면 그것만 받고, 없거나 적용이 실패하면 전체 zip을 받는다.
 * 앱은 늘 맨 위(가장 새) 판으로만 가므로 차이 파일은 맨 위 항목에만 둔다. 새 판을 더하면 아래 항목의 차이
 * 목록은 지우고, 더는 가리키지 않는 차이 파일도 저장소에서 지운다(release.sh, 저장소가 판마다 커지지 않게).
 * release.sh는 이 파일을 `apps/cubie/scripts/appcast-deltas.mjs`로 부른다(node가 타입을 걷어 내고 바로 돈다).
 * 그래서 이 파일은 타입 주석 말고 TypeScript 문법(enum 등)을 쓰지 않고, 다른 모듈을 불러오지 않는다.
 */

/** 차이 파일을 내려주는 사이트 자리 */
export const DELTA_BASE = "https://game.byb.kr/cubie/deltas/";

/** 차이 파일 하나(`<sparkle:deltas>` 안의 enclosure) */
export interface CubieDelta {
  /** 이 차이를 적용할 옛 판(`sparkle:deltaFrom`, 앱의 CFBundleVersion) */
  from: string;
  /** 바이트 수(`length`) */
  length: number;
  /** EdDSA 서명 base64(`sparkle:edSignature`) */
  signature: string;
}

/** appcast의 한 판과 그 판의 차이 파일 */
export interface CubieDeltaItem {
  version: string;
  deltas: (CubieDelta & { url: string })[];
}

const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/;

/** 차이 파일 이름(`0.11.2-0.11.3.delta`) */
export function deltaFileName(from: string, to: string): string {
  if (!VERSION_RE.test(from) || !VERSION_RE.test(to))
    throw new Error(`판 번호가 이상하다: ${from} → ${to}`);
  return `${from}-${to}.delta`;
}

/** 새 판 항목에 넣을 `<sparkle:deltas>` 조각(항목 안 들여쓰기 6칸). 차이가 없으면 빈 글 */
export function deltasXml(version: string, deltas: CubieDelta[]): string {
  if (deltas.length === 0) return "";
  const lines = deltas.map((d) => {
    if (!Number.isInteger(d.length) || d.length <= 0)
      throw new Error(`차이 파일 길이가 이상하다: ${d.from} ${d.length}`);
    if (!/^[A-Za-z0-9+/=_-]+$/.test(d.signature))
      throw new Error(`차이 파일 서명이 이상하다: ${d.from}`);
    const url = DELTA_BASE + deltaFileName(d.from, version);
    return `        <enclosure url="${url}" sparkle:deltaFrom="${d.from}" length="${d.length}" type="application/octet-stream" sparkle:edSignature="${d.signature}"/>`;
  });
  return `      <sparkle:deltas>\n${lines.join("\n")}\n      </sparkle:deltas>\n`;
}

const ITEM_RE = /<item>[\s\S]*?<\/item>/g;
const DELTAS_RE = /[ \t]*<sparkle:deltas>[\s\S]*?<\/sparkle:deltas>[ \t]*\n?/g;

function itemVersion(item: string): string | undefined {
  return /<sparkle:version>([^<]+)</.exec(item)?.[1]?.trim();
}

/** appcast의 판(`sparkle:version`)을 위(새 판)에서 아래로 */
export function appcastVersions(xml: string): string[] {
  return (xml.match(ITEM_RE) ?? []).map((item) => {
    const v = itemVersion(item);
    if (!v) throw new Error("appcast 항목에 sparkle:version이 없다");
    return v;
  });
}

/**
 * `version` 항목의 차이 목록을 `deltas`로 바꾸고 다른 항목의 차이 목록은 지운다.
 * `version`은 맨 위 항목이어야 한다(앱은 맨 위 판으로만 간다).
 */
export function withDeltas(
  xml: string,
  version: string,
  deltas: CubieDelta[],
): string {
  const versions = appcastVersions(xml);
  if (versions[0] !== version)
    throw new Error(
      `차이 파일은 맨 위 판에만 둔다: 맨 위 ${versions[0] ?? "없음"}, 받은 판 ${version}`,
    );
  const older = new Set(versions.slice(1));
  for (const d of deltas) {
    if (!older.has(d.from))
      throw new Error(`appcast의 ${version} 아래에 없는 옛 판: ${d.from}`);
  }
  if (new Set(deltas.map((d) => d.from)).size !== deltas.length)
    throw new Error("같은 옛 판의 차이 파일이 둘이다");
  const block = deltasXml(version, deltas);
  return xml.replace(ITEM_RE, (item) => {
    const bare = item.replace(DELTAS_RE, "");
    if (itemVersion(bare) !== version || !block) return bare;
    return bare.replace(/([ \t]*)<\/item>$/, `${block}$1</item>`);
  });
}

/** 판마다 적힌 차이 파일(시험·release.sh 정리용) */
export function appcastDeltas(xml: string): CubieDeltaItem[] {
  return (xml.match(ITEM_RE) ?? []).map((item) => {
    const version = itemVersion(item) ?? "";
    const block = /<sparkle:deltas>([\s\S]*?)<\/sparkle:deltas>/.exec(
      item,
    )?.[1];
    const deltas = (block?.match(/<enclosure\b[^>]*\/>/g) ?? []).map((e) => {
      const attr = (name: string) =>
        new RegExp(`\\b${name}="([^"]*)"`).exec(e)?.[1] ?? "";
      return {
        url: attr("url"),
        from: attr("sparkle:deltaFrom"),
        length: Number(attr("length")),
        signature: attr("sparkle:edSignature"),
      };
    });
    return { version, deltas };
  });
}

/** appcast가 가리키는 차이 파일 이름(사이트 자리 아래만) */
export function deltaFilesInUse(xml: string): string[] {
  return appcastDeltas(xml).flatMap((item) =>
    item.deltas
      .filter((d) => d.url.startsWith(DELTA_BASE))
      .map((d) => d.url.slice(DELTA_BASE.length)),
  );
}
