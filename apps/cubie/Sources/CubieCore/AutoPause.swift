import Foundation

/// 공식 연습 0.1초 시계를 돌릴지: 연습 중이고 큐브에 포커스가 있을 때만(연습 시간은 포커스가 있을 때만 흐른다)
public enum PracticeTick {
  public static func runs(practicing: Bool, focused: Bool) -> Bool { practicing && focused }
}

/// 창이 안 보이는 동안 저절로 멈췄다가 다시 보이면 이어 가기(기록 창 다시 보기). 사람이 멈춘 것은 다시 보여도 그대로 둔다
public struct AutoPause: Equatable, Sendable {
  public enum Action: Equatable, Sendable { case none, pause, resume }
  /// 안 보여서 저절로 멈췄다
  public private(set) var paused = false

  public init() {}

  /// 창이 보이는지(`visible`)와 지금 재생 중인지(`playing`)를 받아 할 일을 돌려준다
  public mutating func update(visible: Bool, playing: Bool) -> Action {
    if !visible {
      guard playing else { return .none }
      paused = true
      return .pause
    }
    guard paused else { return .none }
    paused = false
    return playing ? .none : .resume
  }

  /// 사람이 멈추기·처음부터를 눌렀다(저절로 멈춘 것을 잊는다)
  public mutating func forget() { paused = false }
}
