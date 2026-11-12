import Foundation

/// 미니 모드 한 판(사이트 `solve-session.ts` `SolveSession`의 mode "solo"·살펴보기 없음, docs/47 15-6).
/// 큐브 상태와 키 해석은 Rust 코어 한 판이 들고, 여기서는 시간·수 세기·다시 보기 글만 같은 규칙으로 쌓는다.
/// - 섞으면 `ready`, 첫 면 돌리기(큐브 돌리기 x·y·z가 아닌 수)에 맞추기 시작(`solving`), 다 맞추면 `done`과 기록 한 판.
/// - 수 세기는 면 돌린 수(되돌리기도 한 수, 큐브 돌리기는 빼고). 시간은 넣어 준 시계(포커스 시계)로 잰다.
/// - 다시 보기 글은 맞추기 시작부터 ms(시작 전의 큐브 돌리기는 음수), 사이트 `formatReplay`처럼 반올림.
/// 구간 기록(`splits`)·흐름 콤보(`combo`)는 코어가 다시 보기 글로 셈해 기록에 더한다
public final class MiniSolve {
  public enum Phase: Equatable { case free, ready, solving, done }

  public let n: Int
  public private(set) var phase: Phase = .free
  public private(set) var scramble = ""
  public private(set) var seed: UInt32?
  public private(set) var history: [(notation: String, t: Double)] = []
  public private(set) var moveCount = 0
  /// 맞추기 시작 시각(사이트처럼 판이 바뀌어도 남는다. 시작 전 큐브 돌리기의 시각은 시작할 때 다시 맞춘다)
  private var solveStart: Double = 0

  public init(n: Int) { self.n = n }

  /// 섞기 글을 받아 새 판(사이트 `start`)
  public func start(scramble: String, seed: UInt32?) {
    self.scramble = scramble
    self.seed = seed
    history = []
    moveCount = 0
    phase = .ready
  }

  /// 맞춘 상태로(판을 버린다)
  public func reset() {
    phase = .free
    scramble = ""
    seed = nil
    history = []
    moveCount = 0
  }

  /// 맞추는 중인가(섞은 뒤 첫 수 전 포함, 힌트를 볼 수 있는 때)
  public var solving: Bool { phase == .ready || phase == .solving }

  /// 수 하나(되돌리기면 거꾸로 돌린 수). `solvedAfter`는 이 수를 둔 뒤 큐브가 맞았는가.
  /// 이 수로 판이 끝나면 기록 한 판(사이트 `SolveRecord` 꼴의 칸 가운데 세션이 아는 것)을 돌려준다
  public func input(notation: String, rotation: Bool, solvedAfter: Bool, now: Double) -> [String: Any]? {
    if !rotation && phase == .ready {
      // 시작 전 큐브 돌리기의 시각을 새 시작 기준으로
      history = history.map { ($0.notation, $0.t - (now - solveStart)) }
      solveStart = now
      phase = .solving
    }
    if phase == .solving || phase == .ready {
      history.append((notation, now - solveStart))
    }
    if !rotation { moveCount += 1 }
    guard phase == .solving, solvedAfter else { return nil }
    phase = .done
    var r: [String: Any] = [
      "mode": "solo", "ms": now - solveStart, "penalty": 0, "moves": moveCount, "scramble": scramble,
      "replay": Self.formatReplay(history),
    ]
    if let seed { r["seed"] = seed }
    return r
  }

  /// 사이트 `formatReplay`: "R@120 U'@380"(시각은 JS `Math.round`)
  public static func formatReplay(_ events: [(notation: String, t: Double)]) -> String {
    events.map { "\($0.notation)@\(Int((($0.t + 0.5).rounded(.down))))" }.joined(separator: " ")
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
}
