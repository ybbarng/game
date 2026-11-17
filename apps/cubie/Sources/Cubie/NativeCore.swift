import CubieCore
import CubieNativeC
import Foundation

/// Rust 코어(C ABI)를 Swift에서 쓰기 좋게 감싼 것(docs/52 5-6). 계산은 모두 코어가 하고(사이트와 공통 시험 자료로 어긋남 0),
/// 여기서는 꼴만 바꾼다
enum NativeCore {
  /// 글을 돌려주는 C 함수(`out`·`len`에 쓰고 글 전체 바이트 수를 돌려준다)를 부른다
  static func string(_ call: (UnsafeMutablePointer<UInt8>?, UInt32) -> UInt32) -> String {
    var cap = 256
    while true {
      var buf = [UInt8](repeating: 0, count: cap)
      let need = Int(buf.withUnsafeMutableBufferPointer { call($0.baseAddress, UInt32(cap)) })
      if need <= cap { return String(decoding: buf[..<need], as: UTF8.self) }
      cap = need
    }
  }

  /// 다시 보기 글 → 걸음(시각 ms, 표기)
  static func replaySteps(n: Int, text: String, maxPauseMs: Double, offset: Double = 0) -> [(at: Double, moves: String)] {
    let s = text.withCString { t in string { cubie_replay_steps(UInt32(n), t, maxPauseMs, offset, $0, $1) } }
    return s.split(separator: "\n").compactMap { line in
      guard let sp = line.firstIndex(of: " "), let at = Double(line[..<sp]) else { return nil }
      return (at, String(line[line.index(after: sp)...]))
    }
  }

  /// 홈 시연이 코어에 있는 해법(사이트 `HERO_METHODS` 전부, docs/52 5-6·5-10)
  static let heroMethods: Set<String> = Set(CubeSettings.heroMethods.values.joined())

  typealias HeroShow = (steps: [(at: Double, move: String, moveMs: Double)], end: Double)

  /// 홈 시연 한 판(코어 `hero_show`): 걸음(시각 ms, 표기, 회전 ms)과 「맞춤」 멈춤이 시작하는 시각. 모르는 해법이면 nil.
  /// 큰 큐브는 풀이에 수백 ms가 든다(7×7 약 0.6초): 화면 스레드 밖에서 부른다
  static func heroSteps(method: String, seed: UInt32) -> HeroShow? {
    heroLines(method.withCString { m in string { cubie_hero_steps(m, seed, $0, $1) } })
  }

  /// 같은 판의 섞기만(바로 끝난다): `heroSteps`의 앞 걸음과 같고, `end`는 섞은 뒤 멈춤이 끝나 풀기 시작하는 시각
  static func heroScramble(method: String, seed: UInt32) -> HeroShow? {
    heroLines(method.withCString { m in string { cubie_hero_scramble(m, seed, $0, $1) } })
  }

  private static func heroLines(_ s: String) -> HeroShow? {
    var steps: [(at: Double, move: String, moveMs: Double)] = []
    var end: Double?
    for line in s.split(separator: "\n") {
      let parts = line.split(separator: " ")
      if parts.count == 2, parts[0] == "end" {
        end = Double(parts[1])
      } else if parts.count == 3, let at = Double(parts[0]), let ms = Double(parts[2]) {
        steps.append((at, String(parts[1]), ms))
      }
    }
    guard let end, !steps.isEmpty else { return nil }
    return (steps, end)
  }
}

/// 평균·티어(코어 `tier.rs`)
struct RustTierMath: TierMath {
  static let labels = ["아이언", "브론즈", "실버", "골드", "플래티넘", "에메랄드", "다이아몬드", "마스터", "그랜드마스터", "챌린저"]
  static let divisions = ["IV", "III", "II", "I"]

  fileprivate func c(_ list: [Timeable]) -> [CubieTimeable] {
    list.map { CubieTimeable(ms: $0.ms ?? -1, penalty: $0.penalty, hints: UInt32(max(0, $0.hints))) }
  }

  func bestAo5(_ records: [Timeable]) -> (ms: Double, at: Int)? {
    var ms = 0.0
    var at: UInt32 = 0
    let ok = c(records).withUnsafeBufferPointer { cubie_best_ao5($0.baseAddress, UInt32($0.count), &ms, &at) }
    return ok ? (ms, Int(at)) : nil
  }

  func ao5(_ five: [Timeable]) -> Double? {
    let v = c(five).withUnsafeBufferPointer { cubie_ao5($0.baseAddress, UInt32($0.count)) }
    return v.isNaN ? nil : v
  }

  func myTier(n: Int, records: [Timeable], bestFive: [Timeable]) -> TierInfo? {
    var out = CubieTier()
    let r = c(records)
    let b = c(bestFive)
    let ok = r.withUnsafeBufferPointer { rp in
      b.withUnsafeBufferPointer { bp in
        cubie_my_tier(UInt32(n), rp.baseAddress, UInt32(rp.count), bp.baseAddress, UInt32(bp.count), &out)
      }
    }
    guard ok else { return nil }
    let tier = Int(out.tier)
    let division = out.division >= 0 ? Int(out.division) : nil
    let name = Self.labels[min(tier, Self.labels.count - 1)] + (division.map { " " + Self.divisions[$0] } ?? "")
    return TierInfo(ao5: out.ao5, tier: tier, division: division, name: name)
  }
}

/// 최고 5판·다음 판·이력(코어 `tier.rs` `best_five_detail`·`next_solve`·`tier_history`, docs/47 14-8)
extension RustTierMath: TierProgressMath {
  func bestFive(records: [Timeable], bestFive: [Timeable]) -> TierProgress.BestFive? {
    var out = CubieBestFive()
    let r = c(records)
    let b = c(bestFive)
    let ok = r.withUnsafeBufferPointer { rp in
      b.withUnsafeBufferPointer { bp in
        cubie_best_five(rp.baseAddress, UInt32(rp.count), bp.baseAddress, UInt32(bp.count), &out)
      }
    }
    guard ok else { return nil }
    return TierProgress.BestFive(ms: out.ms, kept: out.kept != 0, at: Int(out.at), fast: Int(out.fast), slow: Int(out.slow))
  }

  func nextSolve(n: Int, records: [Timeable], bestFive: [Timeable]) -> TierProgress.NextSolve? {
    var out = CubieNextSolve()
    let r = c(records)
    let b = c(bestFive)
    let ok = r.withUnsafeBufferPointer { rp in
      b.withUnsafeBufferPointer { bp in
        cubie_next_solve(UInt32(n), rp.baseAddress, UInt32(rp.count), bp.baseAddress, UInt32(bp.count), &out)
      }
    }
    guard ok else { return nil }
    let goal: TierProgress.Goal =
      switch out.kind {
      case 0: .within(out.value)
      case 1: .any
      default: .out(out.value)
      }
    return TierProgress.NextSolve(
      tier: Int(out.tier), division: out.division >= 0 ? Int(out.division) : nil, cutMs: out.cut_ms, goal: goal)
  }

  func history(n: Int, records: [Timeable], nos: [Int], ats: [Double]) -> TierProgress.History {
    let r = c(records)
    let no = nos.map { UInt32(max(0, $0)) }
    let text = r.withUnsafeBufferPointer { rp in
      no.withUnsafeBufferPointer { np in
        ats.withUnsafeBufferPointer { ap in
          NativeCore.string {
            cubie_tier_history(UInt32(n), rp.baseAddress, np.baseAddress, ap.baseAddress, UInt32(rp.count), $0, $1)
          }
        }
      }
    }
    return TierProgress.parseHistory(text)
  }
}
