import Foundation
import Testing

@testable import CubieCore

/// 티어 이력 그래프 자리(사이트 `history-chart.test.ts`와 같은 예·같은 값)
struct TierHistoryLayoutTests {
  /// 3×3 기준표(사이트 `table.ts`, 초)
  private let table = TierSheet.Table(
    n: 3, people: 0, date: "", credit: "", url: "",
    rows: [
      [Double.infinity, 900, 630, 435], [300, 240, 190, 150], [120, 100, 85, 70], [60, 52, 46, 40],
      [35, 31, 28, 25], [22, 20, 18, 16], [14, 13, 12, 11], [10, 9.3, 8.7, 8.1], [7.5], [6.5],
    ].enumerated().map { TierSheet.Row(tier: $0.offset, cuts: $0.element, people: nil, percent: nil) })

  /// 사용자 Cubie 3×3 11판의 이력(코어가 내는 값, 사이트 `rank.test.ts` 「티어 이력」): 1번 11/10 … 11번 11/15
  private var history: TierProgress.History {
    let at = { (no: Int) in day(no) }
    let ms: [Double?] = [nil, nil, nil, nil, 415_000, 371_670, 330_000, 289_900, 242_180, 192_110, 155_090]
    let points = ms.enumerated().map { TierProgress.Point(no: $0.offset + 1, at: at($0.offset + 1), ms: $0.element) }
    let changes = [
      TierProgress.Change(no: 5, at: at(5), from: nil, to: (0, 3), ms: 415_000),
      TierProgress.Change(no: 8, at: at(8), from: (0, 3), to: (1, 0), ms: 289_900),
      TierProgress.Change(no: 10, at: at(10), from: (1, 0), to: (1, 1), ms: 192_110),
      TierProgress.Change(no: 11, at: at(11), from: (1, 1), to: (1, 2), ms: 155_090),
    ]
    return TierProgress.History(points: points, changes: changes)
  }

  /// 2026-11-(10 + (번호-1)/2) 03:00 UTC(ms)
  private func day(_ no: Int) -> Double {
    var c = DateComponents()
    (c.year, c.month, c.day, c.hour) = (2026, 11, 10 + (no - 1) / 2, 3)
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(identifier: "UTC")!
    return cal.date(from: c)!.timeIntervalSince1970 * 1000
  }

  private let utc = { (at: Double) in TierHistoryLayout.monthDay(at, timeZone: TimeZone(identifier: "UTC")!) }

  @Test func sameNumbersAsTheSite() throws {
    let c = try #require(TierHistoryLayout.layout(table: table, history: history, width: 600, height: 220, dateOf: utc))
    #expect(c.line.first! == (214.4, 180.7))
    #expect(c.line.last! == (524, 30.4))
    let ys = c.line.map(\.1)
    #expect(zip(ys, ys.dropFirst()).allSatisfy { $1 <= $0 })
    #expect(c.dots.map(\.0) == [214.4, 369.2, 472.4, 524])
    #expect(c.bands.map(\.tier) == [0, 1])
    #expect(c.bands[1].y0 == 8 && c.bands[1].y1 == 131.1 && c.bands[0].y0 == 131.1 && c.bands[0].y1 == 198)
    #expect(c.ticks.map(\.label) == ["11/10", "11/11", "11/12", "11/13", "11/14", "11/15"])
    #expect(c.ticks.map(\.anchor) == [.start, .middle, .middle, .middle, .middle, .end])
  }

  @Test func textsLikeTheSite() {
    #expect(
      history.changes.map { TierHistoryLayout.changeLine($0, dateOf: utc) } == [
        "11/12 아이언 I", "11/13 아이언 I → 브론즈 IV", "11/14 브론즈 IV → 브론즈 III", "11/15 브론즈 III → 브론즈 II",
      ])
    #expect(TierHistoryLayout.label(n: 3, history: history) == "3×3 티어 이력, 11판. 아이언 I에서 브론즈 II까지.")
  }

  @Test func nothingBeforeTheFirstAverage() {
    let h = TierProgress.History(points: [.init(no: 1, at: 0, ms: nil)], changes: [])
    #expect(TierHistoryLayout.layout(table: table, history: h, width: 600) == nil)
  }
}
