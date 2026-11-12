import Foundation

/// 기록 한 판의 시간 칸(티어 계산에 넘기는 것). `ms`가 nil이면 DNF
public struct Timeable: Equatable, Sendable {
  public var ms: Double?
  public var penalty: Double
  public var hints: Int

  public init(ms: Double?, penalty: Double = 0, hints: Int = 0) {
    self.ms = ms
    self.penalty = penalty
    self.hints = hints
  }

  /// 기록 JSON 한 판에서(사이트 `SolveRecord` 꼴)
  public init(record r: [String: Any]) {
    ms = (r["ms"] as? NSNumber)?.doubleValue
    penalty = (r["penalty"] as? NSNumber)?.doubleValue ?? 0
    hints = (r["hints"] as? NSNumber)?.intValue ?? 0
  }

  /// 벌점을 더한 시간(사이트 `resultMs`). DNF면 nil
  public var result: Double? { ms.map { $0 + penalty } }
}

/// 내 티어(사이트 `MyTier`)
public struct TierInfo: Equatable, Sendable {
  public var ao5: Double
  /// 0 아이언 … 9 챌린저(사이트 `TIER_IDS` 차례)
  public var tier: Int
  public var division: Int?
  /// 「골드 II」
  public var name: String

  public init(ao5: Double, tier: Int, division: Int?, name: String) {
    self.ao5 = ao5
    self.tier = tier
    self.division = division
    self.name = name
  }

  public static let ids = [
    "iron", "bronze", "silver", "gold", "platinum", "emerald", "diamond", "master", "grandmaster", "challenger",
  ]
  public var id: String { Self.ids[min(max(tier, 0), Self.ids.count - 1)] }
}

/// 평균·티어 계산(앱은 Rust 코어 `tier.rs`를 C ABI로 부른다. 사이트와 공통 시험 자료로 어긋남 0)
public protocol TierMath {
  /// 최고 Ao5(힌트 판이 든 5판은 건너뜀)와 그 5판의 첫 번호
  func bestAo5(_ records: [Timeable]) -> (ms: Double, at: Int)?
  /// 5판의 Ao5(DNF면 nil)
  func ao5(_ five: [Timeable]) -> Double?
  /// 기록(새것이 앞)과 최고 5판으로 내 티어
  func myTier(n: Int, records: [Timeable], bestFive: [Timeable]) -> TierInfo?
}

/// 미니 모드 기록 책(사이트 `apps/web/src/cube/mini/store.ts`와 같은 규칙·같은 JSON 꼴, docs/47 15-6·15-13).
/// - 크기마다 최근 100판(새것이 앞), 번호(`no`)는 크기마다 1부터 이어진다.
/// - 더 좋은 Ao5가 나오면 그 5판을 `best5`에 남긴다(다시 보기 글째). 100판 상한에 밀려도 티어가 떨어지지 않게.
/// - 다시 보기 글은 크기마다 최근 30판에만(최고 5판은 따로 그대로). 저장이 실패하면(자리 모자람) 모든 크기를 5판까지 줄여 한 번 더.
/// 모르는 칸은 그대로 지닌다(사이트가 칸을 더해도 잃지 않게)
public final class MiniBook {
  public static let key = "cube.mini.v1"
  public static let maxRecords = 100
  public static let keepReplays = 30
  public static let sizes = 2...7
  public static let defaultSize = 3

  private let store: KeyValueStore
  private let math: TierMath

  public init(store: KeyValueStore, math: TierMath) {
    self.store = store
    self.math = math
  }

  private struct Book {
    var raw: [String: Any]
    var n: Int
    var mirror: Bool
    var records: [String: [[String: Any]]]
    var best5: [String: [[String: Any]]]
  }

  private static func isRecord(_ r: Any) -> [String: Any]? {
    guard let d = r as? [String: Any], d["at"] is NSNumber, d["n"] is NSNumber, d["moves"] is NSNumber else {
      return nil
    }
    // ms는 숫자 또는 null
    if let ms = d["ms"], !(ms is NSNumber), !(ms is NSNull) { return nil }
    if d["ms"] == nil { return nil }
    return d
  }

  private static func lists(_ v: Any?) -> [String: [[String: Any]]] {
    guard let d = v as? [String: Any] else { return [:] }
    var out: [String: [[String: Any]]] = [:]
    for (k, list) in d {
      if let arr = list as? [Any] { out[k] = arr.compactMap(isRecord) }
    }
    return out
  }

  private func read() -> Book {
    let empty = Book(raw: [:], n: Self.defaultSize, mirror: true, records: [:], best5: [:])
    guard let text = store.string(Self.key), let data = text.data(using: .utf8),
      let d = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    else { return empty }
    let n = (d["n"] as? NSNumber).map(\.intValue).flatMap { Self.sizes.contains($0) ? $0 : nil } ?? Self.defaultSize
    let mirror = (d["mirror"] as? NSNumber).flatMap { CFGetTypeID($0) == CFBooleanGetTypeID() ? $0.boolValue : nil }
    return Book(raw: d, n: n, mirror: mirror ?? true, records: Self.lists(d["records"]), best5: Self.lists(d["best5"]))
  }

  @discardableResult
  private func write(_ b: Book) -> Bool {
    var d = b.raw
    d["version"] = 1
    d["n"] = b.n
    d["mirror"] = b.mirror
    d["records"] = b.records
    d["best5"] = b.best5
    guard let data = try? JSONSerialization.data(withJSONObject: d, options: [.sortedKeys]),
      let text = String(data: data, encoding: .utf8)
    else { return false }
    return store.set(text, for: Self.key)
  }

  // MARK: 고른 크기·거울

  public var n: Int { read().n }
  public var mirror: Bool { read().mirror }

  public func savePrefs(n: Int, mirror: Bool) {
    var b = read()
    if Self.sizes.contains(n) { b.n = n }
    b.mirror = mirror
    write(b)
  }

  // MARK: 기록

  public func records(_ n: Int) -> [[String: Any]] { read().records[String(n)] ?? [] }
  public func bestFive(_ n: Int) -> [[String: Any]] { read().best5[String(n)] ?? [] }

  /// 다시 보기 글을 앞의 `keep`판에만 남긴다(사이트 `withoutOldReplays`)
  public static func withoutOldReplays(_ list: [[String: Any]], keep: Int) -> [[String: Any]] {
    list.enumerated().map { i, r in
      guard i >= keep, r["replay"] != nil else { return r }
      var c = r
      c.removeValue(forKey: "replay")
      return c
    }
  }

  /// 기록을 더하고 그 크기의 새 목록(다시 보기 글을 줄이기 전)을 돌려준다(사이트 `addMiniRecord`)
  @discardableResult
  public func add(_ record: [String: Any]) -> [[String: Any]] {
    var b = read()
    let size = (record["n"] as? NSNumber)?.intValue ?? b.n
    let key = String(size)
    let before = b.records[key] ?? []
    var first = record
    first["no"] = ((before.first?["no"] as? NSNumber)?.intValue ?? 0) + 1
    let list = Array(([first] + before).prefix(Self.maxRecords))
    let kept = b.best5[key]
    let keptMs: Double? =
      kept.flatMap { k in
        k.count == 5 && !k.contains(where: { Timeable(record: $0).hints > 0 }) ? math.ao5(k.map(Timeable.init)) : nil
      }
    if let found = math.bestAo5(list.map(Timeable.init)), keptMs == nil || found.ms < keptMs! {
      b.best5[key] = Array(list[found.at..<min(list.count, found.at + 5)])
    }
    b.records[key] = Self.withoutOldReplays(list, keep: Self.keepReplays)
    if !write(b) {
      for k in b.records.keys { b.records[k] = Self.withoutOldReplays(b.records[k] ?? [], keep: 5) }
      write(b)
    }
    return list
  }

  /// 그 크기의 Cubie 기록 티어(사이트 `miniTier`)
  public func tier(_ n: Int) -> TierInfo? {
    math.myTier(n: n, records: records(n).map(Timeable.init), bestFive: bestFive(n).map(Timeable.init))
  }

  /// 시간 글(사이트 `formatMs`): 1/100초 버림, 1분부터 「분:초」. nil이면 DNF
  public static func formatMs(_ ms: Double?) -> String {
    guard let ms else { return "DNF" }
    let cs = Int((ms / 10).rounded(.down))
    let s = cs / 100
    let frac = String(format: "%02d", cs % 100)
    if s < 60 { return "\(s).\(frac)" }
    return "\(s / 60):\(String(format: "%02d", s % 60)).\(frac)"
  }

  /// 그 크기의 가장 빠른 시간(사이트 `summarize().best`). 기록이 없으면 nil
  public func best(_ n: Int) -> Double? {
    records(n).compactMap { Timeable(record: $0).result }.min()
  }
}
