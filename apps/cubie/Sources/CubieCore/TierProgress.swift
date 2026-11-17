import Foundation

/// 티어를 정한 5판·다음 판 목표·티어 이력(docs/47 14-8, 사이트 `tiers/rank.ts` `bestFiveDetail`·`nextSolve`·`tierHistory`와
/// `tiers/progress-view.ts`). 계산은 Rust 코어(`tier.rs`, 사이트와 공통 시험 자료 `tier-progress.json`)가 하고, 여기서는 꼴과
/// 화면 글만 둔다. 화면 글은 사이트와 같아야 한다(웹 시험 `native-windows-text.test.ts`)
public enum TierProgress {
  // MARK: 꼴

  /// 티어를 정한 5판(사이트 `BestFiveDetail`)
  public struct BestFive: Equatable, Sendable {
    public var ms: Double
    /// 따로 남겨 둔 최고 5판이면 true(값이 같으면 목록)
    public var kept: Bool
    /// 목록이면 그 5판의 첫 자리(새것이 앞)
    public var at: Int
    /// 그 5판 안에서 빠진 가장 빠른·느린 판의 자리(0~4)
    public var fast: Int
    public var slow: Int
    public init(ms: Double, kept: Bool, at: Int, fast: Int, slow: Int) {
      self.ms = ms
      self.kept = kept
      self.at = at
      self.fast = fast
      self.slow = slow
    }
  }

  /// 기록 줄에서 그 판의 몫
  public enum Mark: String, Sendable { case inside = "in", fast, slow }

  /// 기록 줄에 짚을 5판(사이트 `BestFiveView`)
  public struct View: Equatable, Sendable {
    public var ms: Double
    public var first: Int
    public var last: Int
    public var marks: [Int: Mark]
  }

  /// 다음 판 목표(사이트 `NextSolve`)
  public enum Goal: Equatable, Sendable {
    /// 다음 판을 이 시간(ms) 안에
    case within(Double)
    /// 다음 판이 몇 초든
    case any
    /// 다음 판 하나로는 못 닿음. 지금 최고에서 줄일 시간(ms)
    case out(Double)
  }

  public struct NextSolve: Equatable, Sendable {
    /// 닿을 구간: 0 아이언 … 9 챌린저, 0 IV … 3 I(없으면 nil)
    public var tier: Int
    public var division: Int?
    public var cutMs: Double
    public var goal: Goal
    public init(tier: Int, division: Int?, cutMs: Double, goal: Goal) {
      self.tier = tier
      self.division = division
      self.cutMs = cutMs
      self.goal = goal
    }
  }

  /// 티어 이력의 한 판(그 판까지의 최고 5판 평균)
  public struct Point: Equatable, Sendable {
    public var no: Int
    public var at: Double
    public var ms: Double?
  }

  /// 구간이 바뀐 순간(전 구간은 첫 티어면 nil)
  public struct Change: Equatable, Sendable {
    public var no: Int
    public var at: Double
    public var from: (tier: Int, division: Int?)?
    public var to: (tier: Int, division: Int?)
    public var ms: Double

    public static func == (a: Change, b: Change) -> Bool {
      a.no == b.no && a.at == b.at && a.ms == b.ms && a.to.tier == b.to.tier && a.to.division == b.to.division
        && a.from?.tier == b.from?.tier && a.from?.division == b.from?.division
    }
  }

  public struct History: Equatable, Sendable {
    public var points: [Point]
    public var changes: [Change]
    public static let empty = History(points: [], changes: [])
  }

  /// 코어 `cubie_tier_history` 글 → 이력
  public static func parseHistory(_ text: String) -> History {
    var points: [Point] = []
    var changes: [Change] = []
    func div(_ s: Substring) -> Int? { Int(s).flatMap { $0 >= 0 ? $0 : nil } }
    for line in text.split(separator: "\n") {
      let f = line.split(separator: "\t", omittingEmptySubsequences: false)
      if f.first == "p", f.count == 4, let no = Int(f[1]), let at = Double(f[2]) {
        points.append(Point(no: no, at: at, ms: Double(f[3])))
      } else if f.first == "c", f.count == 8, let no = Int(f[1]), let at = Double(f[2]), let ft = Int(f[3]),
        let tt = Int(f[5]), let ms = Double(f[7])
      {
        changes.append(
          Change(no: no, at: at, from: ft >= 0 ? (ft, div(f[4])) : nil, to: (tt, div(f[6])), ms: ms))
      }
    }
    return History(points: points, changes: changes)
  }

  // MARK: 기록 줄 짚기

  /// 기록(새것이 앞)과 남겨 둔 최고 5판에서 짚을 5판(사이트 `bestFiveView`). 번호를 모르면 nil
  public static func view(_ d: BestFive?, records: [[String: Any]], bestFive: [[String: Any]]) -> View? {
    guard let d else { return nil }
    let five = d.kept ? Array(bestFive.prefix(5)) : Array(records.dropFirst(d.at).prefix(5))
    let nos = five.compactMap { ($0["no"] as? NSNumber)?.intValue }
    guard nos.count == 5 else { return nil }
    var marks: [Int: Mark] = [:]
    for (i, no) in nos.enumerated() { marks[no] = i == d.fast ? .fast : i == d.slow ? .slow : .inside }
    return View(ms: d.ms, first: nos.min() ?? 0, last: nos.max() ?? 0, marks: marks)
  }

  // MARK: 글(사이트 `progress-view.ts`와 같다)

  public static let recent5 = "최근 5판 평균"
  public static let recent12 = "최근 12판 평균"
  public static let best5 = "최고 5판 평균"

  /// 「7~11번」
  public static func rangeText(_ v: View) -> String { "\(v.first)~\(v.last)번" }

  /// 「브론즈 I」·「챌린저」
  public static func placeName(tier: Int, division: Int?) -> String {
    let label = TierSheet.labels[min(max(tier, 0), TierSheet.labels.count - 1)]
    return division.map { "\(label) \(TierSheet.divisions[$0])" } ?? label
  }

  /// 「다음 판 2:51.56 안이면 브론즈 I」, 「다음 판을 맞추면 브론즈 I」, 「다음 판 하나로는 브론즈 I에 못 닿아요. …」
  public static func nextSolveText(_ s: NextSolve) -> String {
    let to = placeName(tier: s.tier, division: s.division)
    switch s.goal {
    case .within(let ms): return "다음 판 \(MiniBook.formatMs(ms)) 안이면 \(to)"
    case .any: return "다음 판을 맞추면 \(to)"
    case .out(let gap): return "다음 판 하나로는 \(to)에 못 닿아요. 최고 5판 평균을 \(MiniBook.formatMs(gap))초 줄여야 해요."
    }
  }
}

/// 최고 5판·다음 판·이력 계산(앱은 Rust 코어). 기본은 없음(시험의 가짜 계산은 기록 책 규칙만 본다)
public protocol TierProgressMath {
  func bestFive(records: [Timeable], bestFive: [Timeable]) -> TierProgress.BestFive?
  func nextSolve(n: Int, records: [Timeable], bestFive: [Timeable]) -> TierProgress.NextSolve?
  /// 기록(새것이 앞)과 판마다 번호·시각
  func history(n: Int, records: [Timeable], nos: [Int], ats: [Double]) -> TierProgress.History
}

extension MiniBook {
  private var progress: TierProgressMath? { math as? TierProgressMath }

  /// 그 크기의 티어를 정한 5판(기록 줄에 짚는다)
  public func bestFiveView(_ n: Int) -> TierProgress.View? {
    let r = records(n)
    let b = bestFive(n)
    let d = progress?.bestFive(records: r.map(Timeable.init), bestFive: b.map(Timeable.init))
    return TierProgress.view(d, records: r, bestFive: b)
  }

  /// 그 크기의 다음 판 목표
  public func nextSolve(_ n: Int) -> TierProgress.NextSolve? {
    progress?.nextSolve(n: n, records: records(n).map(Timeable.init), bestFive: bestFive(n).map(Timeable.init))
  }

  /// 그 크기의 티어 이력(이미 있는 기록에서 다시 센다)
  public func history(_ n: Int) -> TierProgress.History {
    let r = records(n)
    return progress?.history(
      n: n, records: r.map(Timeable.init), nos: r.map { ($0["no"] as? NSNumber)?.intValue ?? 0 },
      ats: r.map { ($0["at"] as? NSNumber)?.doubleValue ?? 0 }) ?? .empty
  }
}
