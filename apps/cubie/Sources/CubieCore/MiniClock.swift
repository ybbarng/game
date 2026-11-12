import Foundation

/// 시계(사이트 `@game/fair-play` `Clock`과 같은 꼴). 제품은 `RealClock`, 시험은 `ManualClock`을 넣어 정확한 순간을 만든다
@MainActor
public protocol MiniClock: AnyObject {
  /// ms
  func now() -> Double
  /// `ms` 뒤에 한 번. 돌려준 것을 부르면 취소
  @discardableResult func after(_ ms: Double, _ fn: @escaping @MainActor () -> Void) -> () -> Void
}

/// 실제 시계(단조 시간, 주 스레드 타이머)
@MainActor
public final class RealClock: MiniClock {
  public init() {}
  public func now() -> Double { ProcessInfo.processInfo.systemUptime * 1000 }
  @discardableResult public func after(_ ms: Double, _ fn: @escaping @MainActor () -> Void) -> () -> Void {
    let work = DispatchWorkItem { MainActor.assumeIsolated { fn() } }
    DispatchQueue.main.asyncAfter(deadline: .now() + max(0, ms) / 1000, execute: work)
    return { work.cancel() }
  }
}

/// 시험용 시계: `advance`로 시간을 감으면 그 사이에 걸린 일을 시각 차례대로 부른다
@MainActor
public final class ManualClock: MiniClock {
  private var t: Double
  private var nextID = 0
  private var timers: [(id: Int, at: Double, fn: @MainActor () -> Void)] = []

  public init(_ start: Double = 0) { t = start }
  public func now() -> Double { t }

  @discardableResult public func after(_ ms: Double, _ fn: @escaping @MainActor () -> Void) -> () -> Void {
    nextID += 1
    let id = nextID
    timers.append((id, t + max(0, ms), fn))
    return { [weak self] in self?.timers.removeAll { $0.id == id } }
  }

  public func advance(_ ms: Double) {
    let end = t + ms
    while let next = timers.filter({ $0.at <= end }).min(by: { ($0.at, $0.id) < ($1.at, $1.id) }) {
      timers.removeAll { $0.id == next.id }
      t = next.at
      next.fn()
    }
    t = end
  }

  public var pending: Int { timers.count }
}

/// 포커스가 있는 동안만 흐르는 시계(사이트 `mini/focus-clock.ts`): 창이 포커스를 잃은 동안은 맞추는 시간이 늘지 않고,
/// 다시 받으면 이어 잰다. `after`는 바탕 시계 그대로
@MainActor
public final class FocusClock: MiniClock {
  private let base: MiniClock
  private var acc: Double = 0
  private var since: Double?

  public init(base: MiniClock, focused: Bool = false) {
    self.base = base
    since = focused ? base.now() : nil
  }

  public var focused: Bool { since != nil }

  public func now() -> Double { acc + (since.map { base.now() - $0 } ?? 0) }

  public func setFocused(_ on: Bool) {
    if on == focused { return }
    if on {
      since = base.now()
    } else {
      acc += base.now() - (since ?? base.now())
      since = nil
    }
  }

  @discardableResult public func after(_ ms: Double, _ fn: @escaping @MainActor () -> Void) -> () -> Void {
    base.after(ms, fn)
  }
}

/// 힌트 횟수와 시간 제한(사이트 `mini/hint.ts` `HintGate`·`HINT_RULES`, docs/47 15-15): 5초 보이고(그 전에 수를 두면
/// 바로 숨김), 한 번 보면 20초 동안 다시 못 보며, 한 판에 3번. 섞으면 처음으로
@MainActor
public final class HintGate {
  public static let showMs: Double = 5000
  public static let cooldownMs: Double = 20_000
  public static let perSolve = 3

  public enum Request: Equatable {
    case ok(used: Int)
    case cooldown(seconds: Int)
    case limit
  }

  private let clock: MiniClock
  private let onChange: () -> Void
  public private(set) var used = 0
  private var lastAt: Double?
  private var cancelHide: (() -> Void)?
  public private(set) var showing = false

  public init(clock: MiniClock, onChange: @escaping () -> Void = {}) {
    self.clock = clock
    self.onChange = onChange
  }

  public func reset() {
    hide()
    used = 0
    lastAt = nil
  }

  public func request() -> Request {
    if used >= Self.perSolve { return .limit }
    let now = clock.now()
    if let lastAt, now - lastAt < Self.cooldownMs {
      return .cooldown(seconds: Int(((Self.cooldownMs - (now - lastAt)) / 1000).rounded(.up)))
    }
    used += 1
    lastAt = now
    cancelHide?()
    showing = true
    cancelHide = clock.after(Self.showMs) { [weak self] in
      self?.cancelHide = nil
      self?.hide()
    }
    onChange()
    return .ok(used: used)
  }

  public func hide() {
    cancelHide?()
    cancelHide = nil
    guard showing else { return }
    showing = false
    onChange()
  }
}
