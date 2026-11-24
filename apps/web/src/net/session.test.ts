// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const prepareGroup = vi.fn(async () => ({}));
vi.mock("@game/fair-play/group", () => ({ prepareGroup }));
vi.mock("@/stats/track", () => ({ track: vi.fn() }));
vi.mock("./transport", () => ({ joinBroadcast: vi.fn(() => ({})) }));

const { openTransport } = await import("./session");

const context = { role: "host", game: "omok" } as const;

describe("openTransport: 멘탈 포커 잠그기 군은 쓰는 방에서만 준비한다", () => {
  beforeEach(() => {
    prepareGroup.mockClear();
    window.history.replaceState(null, "", "/omok?net=local");
  });

  it("판 게임 방(멘탈 포커 판 없음)은 군을 준비하지 않는다", async () => {
    await openTransport("ROOM", context, { mentalPoker: false, pressedAt: 0 });
    expect(prepareGroup).not.toHaveBeenCalled();
  });

  it("카드 게임 방은 연결 전에 r255 군을 준비한다", async () => {
    await openTransport(
      "ROOM",
      { ...context, game: "mighty" },
      { mentalPoker: true, pressedAt: 0 },
    );
    expect(prepareGroup.mock.calls).toEqual([["r255"]]);
  });
});

/**
 * 판 게임 방 묶음에 멘탈 포커 기기·증명과 libsodium이 실리지 않게(docs/54 4절), 모든 방이 싣는 코드는
 * `@game/fair-play` 묶음(index)에서 형(type)만 부른다. 값(시계 등)은 작은 진입점(`/clock`)에서 부른다
 */
const ROOM_SOURCES = import.meta.glob(
  [
    "./session.ts",
    "./host-room.ts",
    "./guest-room.ts",
    "./p2p-transport.ts",
    "./protocol.ts",
    "./fair-table.ts",
    "./diag.ts",
    "../components/RoomScreen.tsx",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

/** `@game/fair-play`(index)에서 값으로 부르는 이름 목록 */
function valueImportsFromIndex(source: string): string[] {
  const names: string[] = [];
  for (const m of source.matchAll(
    /import\s+(type\s+)?\{([^}]*)\}\s*from\s*"@game\/fair-play"/g,
  )) {
    if (m[1]) continue;
    for (const part of (m[2] ?? "").split(",")) {
      const name = part.trim();
      if (name && !name.startsWith("type ")) names.push(name);
    }
  }
  return names;
}

describe("모든 방이 싣는 코드는 멘탈 포커 묶음에서 값을 부르지 않는다", () => {
  it("검사할 파일을 모두 읽었다", () => {
    expect(Object.keys(ROOM_SOURCES)).toHaveLength(8);
  });

  for (const [file, source] of Object.entries(ROOM_SOURCES))
    it(file, () => {
      expect(valueImportsFromIndex(source)).toEqual([]);
    });

  it("검사기는 값 import를 찾아낸다", () => {
    expect(
      valueImportsFromIndex(
        'import { type Clock, realClock } from "@game/fair-play";',
      ),
    ).toEqual(["realClock"]);
  });
});
