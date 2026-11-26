import Foundation

/// 지난번에 켜다 꺼졌는지 알아보고 안전하게 켜기(docs/52 5-24).
/// - 켤 때 가장 먼저 「켜는 중」 표시(판 번호·시각·연달아 안전하게 켠 횟수)를 쓰고, 큐브 창·메뉴가 다 뜬 뒤 `clearDelay`가
///   지나거나 앱을 끌 때 지운다.
/// - 다음에 켤 때 표시가 남아 있으면 지난번에 켜다 꺼진 것이다: 저장된 큐브 창 자리·크기를 읽지 않고 기본 자리로 켜고,
///   웹 저장소 옮기기를 다음 켜기로 미루며, 가장 먼저 새 판을 확인해 있으면 Sparkle 창을 띄운다. 기록·키 배치 같은
///   사용자 자료는 지우지 않는다(창 자리 저장값도 지우지 않고 읽지만 않는다).
/// - 안전하게 켜도 `maxSafeRuns`번 연달아 꺼지면 새 판 창은 더 띄우지 않는다(켤 때마다 창이 뜨고 꺼지는 되풀이를 막는다).
///   창 자리는 계속 건너뛴다. 판이 바뀌면(손으로 새 판을 깔았으면) 처음부터 센다.
public enum LaunchGuard {
  /// UserDefaults 키
  public static let key = "CubieLaunching"
  /// 큐브 창을 앞에 놓고 이만큼 지나면 무사히 켜진 것으로 본다(첫 그리기·화면 자리 다시 놓기·첫 정해진 확인 시작이 지난 뒤)
  public static let clearDelay: TimeInterval = 8
  /// 안전하게 켜기를 새 판 창과 함께 되풀이하는 횟수
  public static let maxSafeRuns = 2

  public enum Mode: Equatable, Sendable {
    /// 보통 켜기
    case normal
    /// 지난번에 켜다 꺼졌다: 창 자리 없이, 먼저 새 판 확인(있으면 Sparkle 창)
    case safe
    /// 안전하게 켜도 연달아 꺼졌다: 창 자리 없이, 새 판 창은 띄우지 않는다
    case safeQuiet

    /// 저장된 창 자리·크기와 켤 때 미뤄도 되는 불러오기를 건너뛴다
    public var skipsSaved: Bool { self != .normal }
    /// 켜자마자 새 판을 확인하고 있으면 Sparkle 창을 띄운다
    public var promptsUpdate: Bool { self == .safe }
  }

  /// 「켜는 중」 표시
  public struct Marker: Equatable, Sendable {
    public let version: String
    public let at: Date
    /// 이 표시를 쓴 켜기까지 연달아 안전하게 켠 횟수(보통 켜기는 0)
    public let safeRuns: Int

    public init(version: String, at: Date, safeRuns: Int) {
      self.version = version
      self.at = at
      self.safeRuns = safeRuns
    }

    public var dictionary: [String: Any] {
      ["version": version, "at": at.timeIntervalSince1970, "safeRuns": safeRuns]
    }

    /// 저장값을 읽는다. 모양이 틀리면 표시가 있는 것만 본다(판 「?」, 안전하게 켠 횟수 0)
    public init?(stored: Any?) {
      guard let stored else { return nil }
      let d = stored as? [String: Any] ?? [:]
      version = d["version"] as? String ?? "?"
      at = Date(timeIntervalSince1970: (d["at"] as? NSNumber)?.doubleValue ?? 0)
      safeRuns = max(0, (d["safeRuns"] as? NSNumber)?.intValue ?? 0)
    }
  }

  /// 켤 때: 남은 표시(`left`)로 이번 켜기를 정하고, 지금 쓸 표시를 함께 돌려준다
  public static func begin(left: Marker?, version: String, now: Date) -> (mode: Mode, write: Marker) {
    guard let left else { return (.normal, Marker(version: version, at: now, safeRuns: 0)) }
    let before = left.version == version ? left.safeRuns : 0
    let runs = before + 1
    return (before < maxSafeRuns ? .safe : .safeQuiet, Marker(version: version, at: now, safeRuns: runs))
  }
}
