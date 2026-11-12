import Foundation

/// 떠 있을 때 움직임(사이트 `mini/idle.ts`·`mini/replay.ts`, docs/47 15-5·15-13·15-21).
/// - 처음 움직임은 포커스를 잃고 1분 뒤. 맞춘 큐브면 내 판 다시 보기(최고·최근 번갈아), 다시 볼 판이 없으면 조금 섞기
///   (사이트는 이 자리에 홈 시연이 오고, 시연이 없는 크기면 조금 섞기). 섞인 큐브는 바깥 면 4수를 돌렸다 거꾸로 4수.
/// - 끝나면 맞춘 큐브는 6분, 섞인 큐브는 2분 뒤 다시. 포커스를 받거나 크기를 바꾸면 바로 멈추고 장면을 되돌린다.
@MainActor
public final class IdleShow {
  public struct Timing: Sendable {
    public var firstMs: Double = 60_000
    public var heroEveryMs: Double = 6 * 60_000
    public var jiggleEveryMs: Double = 2 * 60_000
    public var jiggleStepMs: Double = 500
    public var jiggleMoves = 4
    public init() {}
  }

  public enum Kind: String, Sendable { case replay, hero, jiggle }

  public struct Hooks {
    public var solved: () -> Bool
    /// 시작했으면 멈추는 함수를 돌려준다(못 하면 nil). 끝나면 받은 `done`을 부른다
    public var replay: (_ done: @escaping @MainActor () -> Void) -> (() -> Void)?
    public var hero: (_ done: @escaping @MainActor () -> Void) -> (() -> Void)?
    public var jiggle: (_ done: @escaping @MainActor () -> Void) -> () -> Void
    /// 장면을 엔진 상태로 되돌린다
    public var restore: () -> Void
    public var started: (Kind) -> Void

    public init(
      solved: @escaping () -> Bool,
      replay: @escaping (_ done: @escaping @MainActor () -> Void) -> (() -> Void)?,
      hero: @escaping (_ done: @escaping @MainActor () -> Void) -> (() -> Void)?,
      jiggle: @escaping (_ done: @escaping @MainActor () -> Void) -> () -> Void,
      restore: @escaping () -> Void, started: @escaping (Kind) -> Void = { _ in }
    ) {
      self.solved = solved
      self.replay = replay
      self.hero = hero
      self.jiggle = jiggle
      self.restore = restore
      self.started = started
    }
  }

  private let clock: MiniClock
  private let hooks: Hooks
  public let timing: Timing
  private var active = false
  private var timer: (() -> Void)?
  private var stopShow: (() -> Void)?
  public private(set) var showing: Kind?

  public init(clock: MiniClock, hooks: Hooks, timing: Timing = Timing()) {
    self.clock = clock
    self.hooks = hooks
    self.timing = timing
  }

  public var armed: Bool { timer != nil }

  public func setActive(_ on: Bool) {
    if on == active { return }
    active = on
    if on {
      arm(timing.firstMs)
      return
    }
    clearTimer()
    cancelShow()
  }

  /// 크기가 바뀌거나 섞었을 때: 하던 것을 멈추고 간격을 처음부터
  public func reset() {
    cancelShow()
    clearTimer()
    if active { arm(timing.firstMs) }
  }

  private func cancelShow() {
    guard let stop = stopShow else { return }
    stop()
    stopShow = nil
    showing = nil
    hooks.restore()
  }

  private func clearTimer() {
    timer?()
    timer = nil
  }

  private func arm(_ ms: Double) {
    clearTimer()
    timer = clock.after(ms) { [weak self] in
      self?.timer = nil
      self?.fire()
    }
  }

  private func fire() {
    guard active else { return }
    let finished: @MainActor () -> Void = { [weak self] in
      guard let self, self.stopShow != nil else { return }
      self.stopShow = nil
      self.showing = nil
      self.hooks.restore()
      if self.active { self.arm(self.hooks.solved() ? self.timing.heroEveryMs : self.timing.jiggleEveryMs) }
    }
    if hooks.solved() {
      if begin(.replay, hooks.replay, finished) { return }
      if begin(.hero, hooks.hero, finished) { return }
    }
    _ = begin(.jiggle, { self.hooks.jiggle($0) }, finished)
  }

  private func begin(
    _ kind: Kind, _ start: (_ done: @escaping @MainActor () -> Void) -> (() -> Void)?,
    _ finished: @escaping @MainActor () -> Void
  ) -> Bool {
    showing = kind
    stopShow = {}
    guard let stop = start(finished) else {
      showing = nil
      stopShow = nil
      return false
    }
    // 시작하자마자 끝났으면(`finished`가 이미 불림) 멈출 것이 없다
    if stopShow != nil { stopShow = stop }
    hooks.started(kind)
    return true
  }

  // MARK: 고르기·걸음

  /// 다시 볼 수 있는 판: 다시 보기 글·섞기 글이 있고 맞춘 판(사이트 `hasReplay`)
  public static func hasReplay(_ r: [String: Any]) -> Bool {
    guard r["ms"] is NSNumber, let replay = r["replay"] as? String, !replay.isEmpty,
      let scramble = r["scramble"] as? String, !scramble.isEmpty
    else { return false }
    return true
  }

  /// 떠 있을 때 돌릴 판(사이트 `pickIdleReplay`): `turn`이 짝수면 최고 기록 판(최근 목록과 최고 5판에서 가장 빠른 것),
  /// 홀수면 가장 최근 판을 먼저, 없으면 다른 쪽. 길이와 상관없이 고른다
  public static func pickReplay(records: [[String: Any]], best5: [[String: Any]], turn: Int) -> [String: Any]? {
    let recent = records.first(where: hasReplay)
    var best: [String: Any]?
    for r in records + best5 where hasReplay(r) {
      let ms = (r["ms"] as? NSNumber)?.doubleValue ?? .infinity
      if best == nil || ms < ((best?["ms"] as? NSNumber)?.doubleValue ?? .infinity) { best = r }
    }
    return turn % 2 == 0 ? (best ?? recent) : (recent ?? best)
  }

  /// 섞기 한 수의 간격·섞기 뒤 쉬는 시간(사이트 `IDLE_REPLAY_TIMING`)과 섞기 걸음의 회전 시간(`SCRAMBLE_MOVE_MS`)
  public static let scrambleStepMs: Double = 150
  public static let gapMs: Double = 800
  public static let scrambleMoveMs: Double = 110
  /// 다시 보기 멈춤 상한(사이트 `REPLAY_MAX_PAUSE_MS`)
  public static let maxPauseMs: Double = 1000
  /// 다 맞춘 모습을 보이는 시간
  public static let endHoldMs: Double = 1500

  /// 걸음 하나: 시각, 수(표기), 섞기 걸음인가
  public struct Step: Equatable, Sendable {
    public var at: Double
    public var moves: String
    public var scramble: Bool
    public init(at: Double, moves: String, scramble: Bool) {
      self.at = at
      self.moves = moves
      self.scramble = scramble
    }
  }

  /// 맞춘 큐브에서 시작하는 걸음(사이트 `idleReplaySteps`): 섞기 수를 150ms마다, 0.8초 쉬고, 맞춘 과정을 그때 시각대로.
  /// `solveSteps`는 다시 보기 글 → (시각, 표기)(코어 `replay_steps`, 첫 수가 `offset`)
  public static func replaySteps(
    record: [String: Any], scrambleMoves: [String],
    solveSteps: (_ text: String, _ offset: Double) -> [(at: Double, moves: String)]
  ) -> [Step] {
    guard let replay = record["replay"] as? String else { return [] }
    let scramble = scrambleMoves.enumerated().map { Step(at: Double($0.offset) * scrambleStepMs, moves: $0.element, scramble: true) }
    let solveAt = scramble.last.map { $0.at + gapMs } ?? 0
    return scramble + solveSteps(replay, solveAt).map { Step(at: $0.at, moves: $0.moves, scramble: false) }
  }

  /// 다시 보기 `i`번째 걸음의 회전 시간(사이트 `replayMoveMs`): 설정 시간으로, 다음 걸음이 더 빨리 오면 그 간격의 0.9배(40ms 아래로는 안 줄임)
  public static func replayMoveMs(_ steps: [Step], _ i: Int, base: Double) -> Double {
    guard i < steps.count else { return base }
    let gap = (i + 1 < steps.count ? steps[i + 1].at : steps[i].at + 1e9) - steps[i].at
    return max(40, min(base, (gap * 0.9 + 0.5).rounded(.down)))
  }

  /// 조금 섞기 수(사이트 `jigglePlan`): 바깥 면 `count`수(이웃한 두 수가 같은 축이 아니게) 뒤 거꾸로
  public static func jigglePlan(count: Int, random: () -> Double) -> [String] {
    let faces = ["U", "D", "R", "L", "F", "B"]
    let axis = ["U": 0, "D": 0, "R": 1, "L": 1, "F": 2, "B": 2]
    let suffixes = ["", "'", "2"]
    var tokens: [String] = []
    var lastAxis = -1
    while tokens.count < count {
      let face = faces[min(faces.count - 1, Int(random() * Double(faces.count)))]
      if axis[face] == lastAxis { continue }
      lastAxis = axis[face]!
      tokens.append(face + suffixes[min(suffixes.count - 1, Int(random() * Double(suffixes.count)))])
    }
    let back = tokens.reversed().map { t -> String in
      if t.hasSuffix("2") { return t }
      return t.hasSuffix("'") ? String(t.dropLast()) : t + "'"
    }
    return tokens + back
  }
}
