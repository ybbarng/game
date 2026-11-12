// Cubie 네이티브 보통 창(기록 창·티어표·설정 창, docs/52 5-7)이 사이트 화면과 같은 글을 쓰는지 본다. 사이트 화면 글을 고치면
// 이 시험이 깨져 앱의 같은 글(`apps/cubie/Sources/CubieCore/*Sheet.swift`)도 고치라고 알린다. 앱 글은 Cubie 새 판을 내야
// 사용자에게 간다(고정 규칙 5절).
import { describe, expect, it } from "vitest";

declare global {
  interface ImportMeta {
    glob<T>(
      pattern: string | string[],
      options: { query: "?raw"; import: "default"; eager: true },
    ): Record<string, T>;
  }
}

const FILES = import.meta.glob<string>(
  [
    "../../../../cubie/Sources/CubieCore/RecordsSheet.swift",
    "../../../../cubie/Sources/CubieCore/TierSheet.swift",
    "../../../../cubie/Sources/CubieCore/SettingsSheet.swift",
    "../mini/MiniCubeApp.tsx",
    "../tiers/TiersApp.tsx",
    "../tiers/TierTable.tsx",
    "../components/CubeSettingsApp.tsx",
  ],
  { query: "?raw", import: "default", eager: true },
);

/** 줄 바꿈·들여쓰기·JSX 빈칸 `{" "}`을 빈칸 하나로(긴 JSX 글은 서식기가 여러 줄로 나눈다) */
const flat = (s: string) =>
  s
    .replaceAll('{" "}', " ")
    .replace(/\s+/g, " ")
    .replaceAll("> ", ">")
    .replaceAll(" <", "<");

function source(name: string): string {
  const key = Object.keys(FILES).find((k) => k.endsWith(name));
  expect(key, `${name}을 못 읽음`).toBeDefined();
  return flat(FILES[key as string] as string);
}

function sameText(site: string, app: string, texts: readonly string[]) {
  const s = source(site);
  const a = source(app);
  for (const t of texts) {
    expect(s, `사이트 ${site}에 「${t}」가 없다`).toContain(t);
    expect(
      a,
      `앱 ${app}에 「${t}」가 없다(사이트 글이 바뀌었으면 앱도 고친다)`,
    ).toContain(t);
  }
}

describe("Cubie 네이티브 창 글 = 사이트 화면 글", () => {
  it("기록 창(MiniCubeApp RecordsPage)", () =>
    sameText("MiniCubeApp.tsx", "RecordsSheet.swift", [
      "Cubie 기록 기준 · 최고 Ao5",
      "티어표",
      "5판 뒤에",
      "Cubie는 살펴보기 없이, 큐브에 키 입력이 있는 동안만 재요. 사이트 혼자 맞추기 기록과는 따로 매겨요. 힌트를 쓴 판이 든 5판은 티어에 넣지 않아요.",
      "5번 평균",
      "12번 평균",
      "아직 기록이 없어요.",
      "다른 프로그램 입력",
      "마우스·화면",
      "힌트를 본 판이 든 5판은 티어에 넣지 않아요",
      "다시 보기",
      "이어 보기",
      "멈추기",
      "처음부터",
    ]));

  it("티어표(TiersApp)", () =>
    sameText("TiersApp.tsx", "TierSheet.swift", [
      "← 큐브",
      "같은 크기 혼자 맞추기에서 낸 가장 좋은 Ao5로 티어를 매깁니다. Ao5는 연달아 맞춘 5번 가운데 가장 빠른 판과 가장 느린 판을 빼고 남은 3번의 평균입니다.",
      "골드부터 위는 세계 큐브 협회(WCA) 대회 기록의 분포로 정했고, 아이언·브론즈·실버는 대회에 나가지 않는 사람까지 담도록 넓혔습니다. 큰 큐브는 3×3 기록이 같은 사람이 그 크기에서 내는 기록에 맞춰, 크기가 달라도 같은 티어면 비슷한 실력입니다.",
      "내 최고 Ao5",
      "이 크기는 아직 Ao5가 없습니다.",
      "혼자 맞추기",
      "에서 5번 맞추면 생깁니다.",
      "기록은 이 기기에만 저장됩니다.",
      "칸의 시간은 그 구간에 드는 최고 Ao5의 상한입니다. 「WCA 경기자 중」은 그 티어에 드는 시간 이하인 대회 경기자의 비율입니다(",
      "평균 기록이 있는 약",
      "그랜드마스터·챌린저 경계는 그때의 세계 약 1,000위·300위 기록이라 해마다 빨라질 수 있습니다.",
    ]));

  it("티어 기준표(TierTable)", () =>
    sameText("TierTable.tsx", "TierSheet.swift", [
      "WCA 경기자 중",
      "대회 밖",
      "다 맞춤",
      " 이하",
    ]));
});
