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
}

/// 평균·티어(코어 `tier.rs`)
struct RustTierMath: TierMath {
  static let labels = ["아이언", "브론즈", "실버", "골드", "플래티넘", "에메랄드", "다이아몬드", "마스터", "그랜드마스터", "챌린저"]
  static let divisions = ["IV", "III", "II", "I"]

  private func c(_ list: [Timeable]) -> [CubieTimeable] {
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
