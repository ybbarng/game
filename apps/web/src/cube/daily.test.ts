import { scramble } from "@game/cube-scramble";
import { describe, expect, it } from "vitest";
import {
  beginDaily,
  DAILY_KEY,
  type DailyEntry,
  dailyEntry,
  dailySeed,
  dailyStreak,
  entryMs,
  finishDaily,
  kstDate,
  loadDaily,
  markString,
  segmentAverages,
  shareText,
} from "./daily";
import { parseSplits } from "./records";

function memoryStorage(init?: Record<string, string>) {
  const map = new Map<string, string>(Object.entries(init ?? {}));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const at = (iso: string) => Date.parse(iso);

describe("날짜와 씨앗", () => {
  it("한국 시각 자정(UTC 15:00)에 날짜가 바뀐다", () => {
    expect(kstDate(at("2026-11-04T14:59:59.999Z"))).toBe("2026-11-04");
    expect(kstDate(at("2026-11-04T15:00:00.000Z"))).toBe("2026-11-05");
    // 한국 오후·저녁은 UTC로는 같은 날 아침
    expect(kstDate(at("2026-11-05T00:30:00Z"))).toBe("2026-11-05");
    // 해가 바뀌는 때
    expect(kstDate(at("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
  });

  it("같은 날짜·크기면 같은 씨앗과 같은 섞기, 날짜나 크기가 다르면 다르다", () => {
    const before = kstDate(at("2026-11-04T14:59:00Z"));
    const morning = kstDate(at("2026-11-04T15:01:00Z"));
    const night = kstDate(at("2026-11-05T14:58:00Z"));
    expect(dailySeed(morning, 3)).toBe(dailySeed(night, 3));
    expect(dailySeed(before, 3)).not.toBe(dailySeed(morning, 3));
    expect(dailySeed(morning, 2)).not.toBe(dailySeed(morning, 3));
    // 섞기는 씨앗에서 결정적으로 나온다(대결·복기와 같은 섞기 함수). 3×3은 표를 만드는 데 오래 걸려 2×2·4×4로 본다
    for (const n of [2, 4] as const) {
      const event = n === 2 ? "222" : "444";
      expect(scramble(event, dailySeed(morning, n)).text).toBe(
        scramble(event, dailySeed(night, n)).text,
      );
      expect(scramble(event, dailySeed(before, n)).text).not.toBe(
        scramble(event, dailySeed(morning, n)).text,
      );
    }
    // 씨앗은 32비트 양의 정수(워커 일에 그대로 넘긴다)
    const s = dailySeed("2026-11-05", 3);
    expect(Number.isInteger(s) && s >= 0 && s < 2 ** 32).toBe(true);
  });
});

const start = (date: string, n = 3) => ({
  date,
  n,
  seed: dailySeed(date, n),
  scramble: "R U F",
  now: at(`${date}T01:00:00Z`),
});

const solved = (n: number, ms: number | null, splits?: string) => ({
  n,
  at: 1,
  ms,
  penalty: 0,
  moves: 40,
  ...(splits ? { splits } : {}),
});

describe("하루 한 번 기록", () => {
  it("첫 시도만 기록되고, 같은 날 다시 받으면 연습이다", () => {
    const store = memoryStorage();
    expect(beginDaily(start("2026-11-05"), store).kind).toBe("official");
    finishDaily("2026-11-05", solved(3, 30_000), store);
    // 다시 받으면 연습: 기록은 그대로, 연습 결과로 덮지 않는다
    expect(beginDaily(start("2026-11-05"), store).kind).toBe("practice");
    finishDaily("2026-11-05", solved(3, 10_000), store);
    const e = dailyEntry(loadDaily(store), "2026-11-05", 3) as DailyEntry;
    expect(e.status).toBe("done");
    expect(entryMs(e)).toBe(30_000);
    // 크기가 다르면 따로, 다음 날은 다시 기록
    expect(beginDaily(start("2026-11-05", 2), store).kind).toBe("official");
    expect(beginDaily(start("2026-11-06"), store).kind).toBe("official");
    expect(loadDaily(store).map((x) => `${x.date}/${x.n}`)).toEqual([
      "2026-11-06/3",
      "2026-11-05/2",
      "2026-11-05/3",
    ]);
  });

  it("섞기를 받고 끝내지 않고 떠나면 DNF로 남고, 다시 받으면 연습이다", () => {
    const store = memoryStorage();
    beginDaily(start("2026-11-05"), store);
    // 새로 고침: 화면은 기록을 다시 읽는다
    const e = dailyEntry(loadDaily(store), "2026-11-05", 3) as DailyEntry;
    expect(e.status).toBe("started");
    expect(entryMs(e)).toBeNull();
    expect(beginDaily(start("2026-11-05"), store).kind).toBe("practice");
  });

  it("DNF도 하루의 시도로 남는다", () => {
    const store = memoryStorage();
    beginDaily(start("2026-11-05"), store);
    finishDaily(
      "2026-11-05",
      { ...solved(3, null), dnfReason: "inspection" },
      store,
    );
    const e = dailyEntry(loadDaily(store), "2026-11-05", 3) as DailyEntry;
    expect(e.status).toBe("done");
    expect(e.dnfReason).toBe("inspection");
    expect(beginDaily(start("2026-11-05"), store).kind).toBe("practice");
  });

  it("깨진 저장·모르는 칸·옛 꼴과 섞여도 읽힌다", () => {
    const good = {
      date: "2026-11-04",
      n: 3,
      seed: 1,
      scramble: "R",
      startedAt: 1,
      status: "done",
      ms: 1000,
      penalty: 0,
      moves: 1,
      future: "새 칸",
    };
    const store = memoryStorage({
      [DAILY_KEY]: JSON.stringify({
        version: 1,
        entries: [good, { date: "어제" }, null, 3, { ...good, ms: 5 }],
      }),
    });
    const list = loadDaily(store);
    expect(list).toHaveLength(1);
    expect(list[0]?.ms).toBe(1000);
    expect(loadDaily(memoryStorage({ [DAILY_KEY]: "{깨짐" }))).toEqual([]);
    expect(loadDaily(memoryStorage({ [DAILY_KEY]: "[1,2]" }))).toEqual([]);
    expect(loadDaily(null)).toEqual([]);
    // 깨진 저장 위에도 새 기록을 쓸 수 있다
    const broken = memoryStorage({ [DAILY_KEY]: "{깨짐" });
    expect(beginDaily(start("2026-11-05"), broken).kind).toBe("official");
  });
});

describe("연속 일수", () => {
  const day = (date: string, ms: number | null, n = 3): DailyEntry => ({
    date,
    n,
    seed: 0,
    scramble: "",
    startedAt: 0,
    status: "done",
    ms,
    penalty: 0,
    moves: 0,
  });

  it("맞춘 날이 이어진 수, 오늘 아직이면 어제까지", () => {
    const list = [
      day("2026-11-05", 1),
      day("2026-11-04", 1, 2),
      day("2026-11-03", 1),
      day("2026-11-01", 1),
    ];
    expect(dailyStreak(list, "2026-11-05")).toBe(3);
    // 오늘(11-06) 아직: 어제까지 이어진 3일
    expect(dailyStreak(list, "2026-11-06")).toBe(3);
    // 하루 빠지면 끊긴다
    expect(dailyStreak(list, "2026-11-07")).toBe(0);
    expect(dailyStreak([], "2026-11-05")).toBe(0);
  });

  it("DNF·끝내지 않은 날은 이어지지 않고, 크기가 여럿이어도 하루로 센다", () => {
    const list = [
      day("2026-11-05", 1),
      day("2026-11-05", 2, 2),
      day("2026-11-04", null),
      day("2026-11-03", 1),
    ];
    expect(dailyStreak(list, "2026-11-05")).toBe(1);
    const left = { ...day("2026-11-04", null), status: "started" as const };
    expect(dailyStreak([day("2026-11-05", 1), left], "2026-11-05")).toBe(1);
    // 달·해가 바뀌어도 이어진다
    expect(
      dailyStreak(
        [day("2027-01-01", 1), day("2026-12-31", 1), day("2026-12-30", 1)],
        "2027-01-01",
      ),
    ).toBe(3);
  });
});

describe("공유 글", () => {
  const entry: DailyEntry = {
    date: "2026-11-05",
    n: 3,
    seed: 123,
    scramble: "R2 U' F2 D B' L2 U2 R' F",
    startedAt: 0,
    status: "done",
    ms: 42_100,
    penalty: 0,
    moves: 55,
    splits: "cross@5000 layer1@20000 layer2@30000 oll@36000 ll@42100",
  };

  it("구간마다 내 평균과 견준다(빠름 🟩·비슷 🟨·느림 🟥·처음 ⬜)", () => {
    // 평균: 십자 6초(이번 5초, 빠름), 첫 층 15초(이번 15초, 비슷), 둘째 층 5초(이번 10초, 느림), 나머지는 처음
    const avg = segmentAverages([
      { splits: "cross@5000 layer1@21000 layer2@26000" },
      { splits: "cross@7000 layer1@21000 layer2@26000" },
      {},
    ]);
    expect(markString(parseSplits(entry.splits), avg)).toBe("🟩🟨🟥⬜⬜");
    expect(markString(parseSplits(entry.splits), new Map())).toBe("⬜⬜⬜⬜⬜");
  });

  it("날짜·크기·시간·구간 칩 모양을 담고 섞기는 넣지 않는다", () => {
    const text = shareText({ ...entry, marks: "🟩🟨🟥⬜⬜" });
    expect(text).toBe(
      [
        "큐브 맞추기 오늘의 섞기 11/05 3×3",
        "42.10초 🟩🟨🟥⬜⬜",
        "십자 · 첫 층 · 둘째 층 · 윗면 · 윗층",
        "https://game.byb.kr/cube/daily",
      ].join("\n"),
    );
    expect(text).not.toContain(entry.scramble);
    for (const token of entry.scramble.split(" "))
      expect(text.split(/\s+/)).not.toContain(token);
  });

  it("벌점·DNF", () => {
    expect(shareText({ ...entry, penalty: 2000 })).toContain("44.10초(+2)\n");
    const dnf = shareText({ ...entry, ms: null, marks: "🟩" }).split("\n");
    expect(dnf).toEqual([
      "큐브 맞추기 오늘의 섞기 11/05 3×3",
      "DNF",
      "https://game.byb.kr/cube/daily",
    ]);
  });

  it("끝날 때의 표시를 남긴다(DNF는 남기지 않는다)", () => {
    const store = memoryStorage();
    beginDaily(start("2026-11-05"), store);
    finishDaily(
      "2026-11-05",
      { ...solved(3, 1000, "ll@1000"), marks: "🟩" },
      store,
    );
    expect(loadDaily(store)[0]?.marks).toBe("🟩");
    beginDaily(start("2026-11-06"), store);
    finishDaily("2026-11-06", { ...solved(3, null), marks: "🟩" }, store);
    expect(loadDaily(store)[0]?.marks).toBeUndefined();
  });
});
