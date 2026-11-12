import AppKit

/// 큐브 소리(docs/52 5-6): 사이트 소리(`apps/web/src/game/sound.ts`의 `cubeTurn`·`cubeSolved`·`invalid`)와 같은 모양을
/// 처음 쓸 때 한 번 PCM으로 만들어 두고 `NSSound`로 낸다. 소리 엔진(실시간 오디오 그래프)을 열지 않아 가만히 있을 때
/// 메모리·CPU가 들지 않는다(웹은 소리 엔진이 13~16MB였다, 2-2절). 방 울림은 넣지 않는다(돌리기 소리는 사이트도 울림 없음).
@MainActor
final class CubieSound {
  enum Cue { case turn, solved, invalid }

  nonisolated static let rate = 44_100.0
  /// 설정 「소리」
  var enabled = true
  private var turns: [NSSound] = []
  private var nextTurn = 0
  private var solved: NSSound?
  private var invalid: NSSound?

  func play(_ cue: Cue) {
    guard enabled else { return }
    switch cue {
    case .turn:
      if turns.isEmpty {
        // 수마다 높이·길이·알갱이 자리를 조금씩 달리한 여섯 벌(사이트는 수마다 새로 고른다)
        var rng = SystemRandomNumberGenerator()
        turns = (0..<6).compactMap { _ in Self.sound(Self.turnSamples(&rng)) }
      }
      guard !turns.isEmpty else { return }
      let s = turns[nextTurn % turns.count]
      nextTurn += 1
      s.stop()
      s.play()
    case .solved:
      if solved == nil { solved = Self.sound(Self.solvedSamples()) }
      solved?.stop()
      solved?.play()
    case .invalid:
      if invalid == nil { invalid = Self.sound(Self.invalidSamples()) }
      invalid?.stop()
      invalid?.play()
    }
  }

  // MARK: 만들기

  /// 사이트 `tone`: 사인·삼각파, 지수로 올렸다 내리는 덮개
  static func tone(
    _ buf: inout [Float], freq: Double, at: Double, duration: Double, gain: Double, attack: Double,
    triangle: Bool = false
  ) {
    let start = Int(at * rate)
    let count = Int((duration + 0.05) * rate)
    if buf.count < start + count { buf += [Float](repeating: 0, count: start + count - buf.count) }
    var phase = 0.0
    for i in 0..<count {
      let t = Double(i) / rate
      let env = envelope(t: t, attack: attack, duration: duration, gain: gain)
      phase += freq / rate
      let p = phase - floor(phase)
      let wave = triangle ? (p < 0.5 ? 4 * p - 1 : 3 - 4 * p) : sin(2 * .pi * p)
      buf[start + i] += Float(wave * env)
    }
  }

  static func envelope(t: Double, attack: Double, duration: Double, gain: Double) -> Double {
    let floorV = 0.0001
    if t < attack { return floorV * pow(gain / floorV, t / attack) }
    if t < duration { return gain * pow(floorV / gain, (t - attack) / max(1e-6, duration - attack)) }
    return 0
  }

  /// 사이트 `noise`: 띠 통과(쌍2차) + 낮은 쪽 통과로 거른 잡음, 지수 덮개
  static func noise(
    _ buf: inout [Float], at: Double, duration: Double, freq: Double, sweepTo: Double?, q: Double, gain: Double,
    attack: Double, cut: Double, rng: inout SystemRandomNumberGenerator
  ) {
    let start = Int(at * rate)
    let count = Int((duration + 0.03) * rate)
    if buf.count < start + count { buf += [Float](repeating: 0, count: start + count - buf.count) }
    var bp = Biquad()
    var lp = Biquad()
    lp.lowpass(freq: cut, q: 0.707)
    for i in 0..<count {
      let t = Double(i) / rate
      let f = sweepTo.map { freq * pow($0 / freq, min(1, t / duration)) } ?? freq
      if i % 32 == 0 { bp.bandpass(freq: f, q: q) }
      let x = Double.random(in: -1...1, using: &rng)
      let y = lp.run(bp.run(x))
      buf[start + i] += Float(y * envelope(t: t, attack: attack, duration: duration, gain: gain))
    }
  }

  static func turnSamples(_ rng: inout SystemRandomNumberGenerator) -> [Float] {
    var b: [Float] = []
    let pitch = 0.88 + Double.random(in: 0..<0.24, using: &rng)
    let len = 0.85 + Double.random(in: 0..<0.3, using: &rng)
    noise(
      &b, at: 0, duration: 0.08 * len, freq: 1300 * pitch, sweepTo: 950 * pitch, q: 0.6, gain: 0.22, attack: 0.02,
      cut: 3200, rng: &rng)
    let grains = 3 + Int.random(in: 0...1, using: &rng)
    for _ in 0..<grains {
      noise(
        &b, at: (0.008 + Double.random(in: 0..<0.05, using: &rng)) * len, duration: 0.012,
        freq: (1700 + Double.random(in: 0..<500, using: &rng)) * pitch, sweepTo: nil, q: 1, gain: 0.05, attack: 0.004,
        cut: 3600, rng: &rng)
    }
    return b
  }

  static func solvedSamples() -> [Float] {
    var b: [Float] = []
    let e5 = 659.25
    let b5 = 987.77
    // 다 맞춘 「띠리링」(위로 올라가는 세 음): pluck + bell 둘
    tone(&b, freq: e5, at: 0, duration: 0.25, gain: 0.12, attack: 0.004, triangle: true)
    tone(&b, freq: e5 * 4, at: 0, duration: 0.25 * 0.25, gain: 0.12 * 0.25, attack: 0.002)
    for (f, at, d, g) in [(b5, 0.08, 0.6, 0.07), (e5 * 2, 0.16, 0.9, 0.06)] {
      tone(&b, freq: f, at: at, duration: d, gain: g, attack: 0.004)
      tone(&b, freq: f * 2.76, at: at, duration: d * 0.45, gain: g * 0.35, attack: 0.003)
      tone(&b, freq: f * 5.4, at: at, duration: d * 0.2, gain: g * 0.15, attack: 0.002)
    }
    return b
  }

  static func invalidSamples() -> [Float] {
    var b: [Float] = []
    tone(&b, freq: 196, at: 0, duration: 0.09, gain: 0.14, attack: 0.008, triangle: true)
    tone(&b, freq: 165, at: 0.1, duration: 0.12, gain: 0.14, attack: 0.008, triangle: true)
    return b
  }

  /// 16비트 모노 WAV로 묶어 `NSSound`
  static func sound(_ samples: [Float]) -> NSSound? {
    var data = Data()
    func u32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { data.append(contentsOf: $0) } }
    func u16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { data.append(contentsOf: $0) } }
    let bytes = UInt32(samples.count * 2)
    data.append(contentsOf: Array("RIFF".utf8))
    u32(36 + bytes)
    data.append(contentsOf: Array("WAVEfmt ".utf8))
    u32(16)
    u16(1)
    u16(1)
    u32(UInt32(rate))
    u32(UInt32(rate) * 2)
    u16(2)
    u16(16)
    data.append(contentsOf: Array("data".utf8))
    u32(bytes)
    for s in samples {
      let v = Int16(max(-1, min(1, s)) * 32767)
      u16(UInt16(bitPattern: v))
    }
    return NSSound(data: data)
  }
}

/// 쌍2차 거르개(Web Audio `BiquadFilterNode`와 같은 식)
struct Biquad {
  private var b0 = 1.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0
  private var x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0

  mutating func bandpass(freq: Double, q: Double) {
    let w = 2 * .pi * freq / CubieSound.rate
    let alpha = sin(w) / (2 * q)
    let a0 = 1 + alpha
    b0 = alpha / a0
    b1 = 0
    b2 = -alpha / a0
    a1 = -2 * cos(w) / a0
    a2 = (1 - alpha) / a0
  }

  mutating func lowpass(freq: Double, q: Double) {
    let w = 2 * .pi * freq / CubieSound.rate
    let alpha = sin(w) / (2 * q)
    let a0 = 1 + alpha
    b0 = (1 - cos(w)) / 2 / a0
    b1 = (1 - cos(w)) / a0
    b2 = b0
    a1 = -2 * cos(w) / a0
    a2 = (1 - alpha) / a0
  }

  mutating func run(_ x: Double) -> Double {
    let y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    return y
  }
}
