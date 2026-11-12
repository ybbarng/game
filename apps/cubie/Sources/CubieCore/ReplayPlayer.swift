import Foundation

/// 기록 다시 보기 재생기(사이트 `apps/web/src/cube/replay-player.ts` `ReplayPlayer`, docs/47 15-13). 걸음을 시각대로 내보내고
/// 멈추기·이어 보기·처음부터를 한다. 걸어 둔 타이머는 늘 하나(다음 걸음)라 멈추면 바로 선다. 화면을 모르니 시계를 넣어 시험한다
@MainActor
public final class ReplayPlayer {
  public enum Status: String, Sendable { case playing, paused, done }

  public struct Step: Equatable, Sendable {
    /// 다시 보기 시작부터 ms
    public var at: Double
    /// 그 걸음의 수(WCA 표기, 여럿이면 빈칸으로 이음)
    public var moves: String
    public init(at: Double, moves: String) {
      self.at = at
      self.moves = moves
    }
  }

  public struct Hooks {
    public var onStep: @MainActor (Step, Int) -> Void
    public var onReset: @MainActor () -> Void
    public var onStatus: @MainActor (Status) -> Void
    public init(
      onStep: @escaping @MainActor (Step, Int) -> Void, onReset: @escaping @MainActor () -> Void = {},
      onStatus: @escaping @MainActor (Status) -> Void = { _ in }
    ) {
      self.onStep = onStep
      self.onReset = onReset
      self.onStatus = onStatus
    }
  }

  public let steps: [Step]
  private let clock: MiniClock
  private let hooks: Hooks
  private let endMs: Double
  private var index = 0
  private var pos: Double = 0
  private var startedAt: Double?
  private var timer: (() -> Void)?
  private var finished = false

  public init(clock: MiniClock, steps: [Step], hooks: Hooks, endMs: Double = 600) {
    self.clock = clock
    self.steps = steps
    self.hooks = hooks
    self.endMs = endMs
  }

  public var status: Status { finished ? .done : (startedAt == nil ? .paused : .playing) }
  /// 내보낸 걸음 수
  public var played: Int { index }
  public var position: Double { pos + (startedAt.map { clock.now() - $0 } ?? 0) }
  /// 끝까지 걸리는 시간(끝 멈춤 포함)
  public var length: Double { (steps.last?.at ?? 0) + endMs }

  public func play() {
    if finished {
      restart()
      return
    }
    guard startedAt == nil else { return }
    startedAt = clock.now()
    schedule()
    hooks.onStatus(.playing)
  }

  public func pause() {
    guard startedAt != nil else { return }
    pos = position
    startedAt = nil
    clear()
    hooks.onStatus(.paused)
  }

  public func toggle() {
    if status == .playing { pause() } else { play() }
  }

  public func restart() {
    clear()
    startedAt = nil
    index = 0
    pos = 0
    finished = false
    hooks.onReset()
    play()
  }

  /// 버린다(창·상자를 닫을 때). 그 뒤로는 아무것도 내보내지 않는다
  public func stop() {
    clear()
    startedAt = nil
  }

  private func clear() {
    timer?()
    timer = nil
  }

  private func schedule() {
    clear()
    let next = index < steps.count ? steps[index] : nil
    let due = next?.at ?? length
    timer = clock.after(max(0, due - position)) { [weak self] in
      guard let self else { return }
      self.timer = nil
      if let next {
        self.index += 1
        self.hooks.onStep(next, self.index - 1)
        if self.startedAt != nil { self.schedule() }
        return
      }
      self.pos = self.length
      self.startedAt = nil
      self.finished = true
      self.hooks.onStatus(.done)
    }
  }

  /// 다시 보기에서 `i`번째 걸음을 돌리는 한 수의 시간(사이트 `replayMoveMs`): 설정 시간으로 돌리되, 다음 걸음이 더 빨리 오면
  /// 그 간격의 0.9배로 줄인다(40ms 아래로는 줄이지 않는다)
  public static func moveMs(_ steps: [Step], _ i: Int, base: Double) -> Double {
    guard i < steps.count else { return base }
    let gap = (i + 1 < steps.count ? steps[i + 1].at : steps[i].at + 1e9) - steps[i].at
    return max(40, min(base, (gap * 0.9 + 0.5).rounded(.down)))
  }
}
