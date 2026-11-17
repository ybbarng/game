import Foundation

/// 티어 이력 그래프의 자리 셈(사이트 `apps/web/src/cube/tiers/history-chart.ts`와 같은 셈, 같은 시험 값 `TierHistoryLayoutTests`).
/// 가로는 판 차례와 날짜 눈금, 세로는 그 판까지의 최고 5판 평균(로그 눈금, 빠를수록 위), 뒤에 티어 띠, 계단 선, 티어가 바뀐 판에 점.
/// 앱 티어표 창(`TierHistoryView`)이 그린다
public enum TierHistoryLayout {
  public static let padLeft: Double = 8
  public static let padRight: Double = 76
  public static let padTop: Double = 8
  public static let padBottom: Double = 22
  public static let tickGap: Double = 40
  public static let bandLabelMin: Double = 11
  /// 그래프 높이(pt, 사이트 `CHART_HEIGHT`)
  public static let height: Double = 200

  public struct Band: Equatable, Sendable {
    /// 0 아이언 … 9 챌린저
    public var tier: Int
    public var y0: Double
    public var y1: Double
    public var label: Bool
  }

  public enum Anchor: String, Sendable { case start, middle, end }

  public struct Tick: Equatable, Sendable {
    public var x: Double
    public var label: String
    public var anchor: Anchor
  }

  public struct Layout: Equatable, Sendable {
    public var width: Double
    public var height: Double
    public var plot: (x: Double, y: Double, w: Double, h: Double)
    public var bands: [Band]
    public var line: [(Double, Double)]
    public var dots: [(Double, Double)]
    public var ticks: [Tick]

    public static func == (a: Layout, b: Layout) -> Bool {
      a.width == b.width && a.height == b.height && a.bands == b.bands && a.ticks == b.ticks
        && a.line.map { [$0.0, $0.1] } == b.line.map { [$0.0, $0.1] }
        && a.dots.map { [$0.0, $0.1] } == b.dots.map { [$0.0, $0.1] }
    }
  }

  /// 「11/15」(시간대는 이 기기)
  public static func monthDay(_ at: Double, timeZone: TimeZone = .current) -> String {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = timeZone
    let c = cal.dateComponents([.month, .day], from: Date(timeIntervalSince1970: at / 1000))
    return "\(c.month ?? 0)/\(c.day ?? 0)"
  }

  private static func round1(_ v: Double) -> Double { (v * 10).rounded() / 10 }

  /// 표에서 낮은 쪽부터 센 자리(사이트 `TierPlace.step`)
  static func step(table: TierSheet.Table, tier: Int, division: Int?) -> Int {
    table.rows.prefix(tier).reduce(0) { $0 + $1.cuts.count } + (division ?? 0)
  }

  /// 자리 `step`의 상한(ms, 사이트 `placeAt().cutMs`)
  static func cutMs(table: TierSheet.Table, step: Int) -> Double? {
    var s = 0
    for row in table.rows {
      for cut in row.cuts {
        if s == step { return (cut * 1000).rounded() }
        s += 1
      }
    }
    return nil
  }

  /// 판이 하나도 5판 평균을 갖지 않으면 nil(사이트 `chartLayout`)
  public static func layout(
    table: TierSheet.Table, history: TierProgress.History, width: Double, height: Double = height,
    dateOf: (Double) -> String = { monthDay($0) }
  ) -> Layout? {
    let points = history.points
    let vals = points.compactMap(\.ms)
    guard let last = vals.last else { return nil }
    let plot = (x: padLeft, y: padTop, w: width - padLeft - padRight, h: height - padTop - padBottom)
    let count = points.count
    func xOf(_ i: Int) -> Double {
      round1(plot.x + (count == 1 ? plot.w / 2 : Double(i) / Double(count - 1) * plot.w))
    }
    var goal: Double?
    if let c = history.changes.last {
      goal = cutMs(table: table, step: step(table: table, tier: c.to.tier, division: c.to.division) + 1)
    }
    let lo = min(vals.min() ?? last, goal ?? last) / 1.12
    let hi = (vals.max() ?? last) * 1.12
    let span = log(hi) - log(lo)
    func yOf(_ v: Double) -> Double { round1(plot.y + (log(v) - log(lo)) / span * plot.h) }
    var bands: [Band] = []
    for (i, row) in table.rows.enumerated() {
      let upper = (row.cuts.first ?? .infinity) * 1000
      let lower = i + 1 < table.rows.count ? (table.rows[i + 1].cuts.first ?? 0) * 1000 : 0
      let y0 = yOf(max(lower, lo))
      let y1 = yOf(min(upper, hi))
      if y1 - y0 <= 0 { continue }
      bands.append(Band(tier: row.tier, y0: y0, y1: y1, label: y1 - y0 >= bandLabelMin))
    }
    var line: [(Double, Double)] = []
    var prev: Double?
    for (i, p) in points.enumerated() {
      guard let ms = p.ms else { continue }
      if let pv = prev {
        if ms != pv {
          line.append((xOf(i), yOf(pv)))
          line.append((xOf(i), yOf(ms)))
        }
      } else {
        line.append((xOf(i), yOf(ms)))
      }
      prev = ms
    }
    line.append((xOf(count - 1), yOf(last)))
    let dots = history.changes.map { c -> (Double, Double) in
      let i = points.firstIndex { $0.no == c.no && $0.at == c.at } ?? 0
      return (xOf(i), yOf(c.ms))
    }
    var ticks: [Tick] = []
    var day = ""
    for (i, p) in points.enumerated() {
      let label = dateOf(p.at)
      if label == day { continue }
      day = label
      let x = xOf(i)
      if let before = ticks.last, x - before.x < tickGap { continue }
      let anchor: Anchor =
        x - plot.x < tickGap / 2 ? .start : plot.x + plot.w - x < tickGap / 2 ? .end : .middle
      ticks.append(Tick(x: x, label: label, anchor: anchor))
    }
    return Layout(width: width, height: height, plot: plot, bands: bands, line: line, dots: dots, ticks: ticks)
  }

  // MARK: 글(사이트 `history-chart.ts`와 같다)

  public static let title = "티어 이력"

  /// 「11/15 브론즈 III → 브론즈 II」, 첫 티어 「11/12 아이언 I」
  public static func changeLine(_ c: TierProgress.Change, dateOf: (Double) -> String = { monthDay($0) }) -> String {
    let to = TierProgress.placeName(tier: c.to.tier, division: c.to.division)
    guard let from = c.from else { return "\(dateOf(c.at)) \(to)" }
    return "\(dateOf(c.at)) \(TierProgress.placeName(tier: from.tier, division: from.division)) → \(to)"
  }

  /// 그림 설명(사이트 `chartLabel`)
  public static func label(n: Int, history: TierProgress.History) -> String {
    let head = "\(n)×\(n) 티어 이력, \(history.points.count)판."
    guard let first = history.changes.first, let last = history.changes.last else { return head }
    let a = TierProgress.placeName(tier: first.to.tier, division: first.to.division)
    let b = TierProgress.placeName(tier: last.to.tier, division: last.to.division)
    return history.changes.count == 1 ? "\(head) 지금 \(b)." : "\(head) \(a)에서 \(b)까지."
  }
}
