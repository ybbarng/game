import Foundation

/// Cubie 기록 창의 글과 줄(사이트 `apps/web/src/cube/mini/MiniCubeApp.tsx` `RecordsPage`·`MiniTiers`·`RecordsPanel`·`ReplayBox`).
/// 네이티브 기록 창(`NativeRecordsWindow`)이 그리고, 화면 글은 사이트와 같아야 한다(웹 시험 `native-windows-text.test.ts`가 본다).
/// 계산(요약 평균·티어)은 Rust 코어가 하고, 여기서는 기록 JSON → 줄 글만 만든다(화면 없이 시험한다)
public enum RecordsSheet {
  /// 크기 단추(사이트 `MINI_SIZES`)
  public static let sizes = [2, 3, 4, 5, 6, 7]

  // MARK: 글(사이트와 같다)

  public static let tiersTitle = "티어"
  public static let tiersBasis = "Cubie 기록 기준 · 최고 Ao5"
  public static let tiersLink = "티어표"
  public static let tierPending = "5판 뒤에"
  public static let tiersNote =
    "Cubie는 살펴보기 없이, 큐브에 키 입력이 있는 동안만 재요. 사이트 혼자 맞추기 기록과는 따로 매겨요. 힌트를 쓴 판이 든 5판은 티어에 넣지 않아요."
  public static let title = "기록"
  public static let summaryLabels = ["최고", "평균", "5번 평균", "12번 평균"]
  public static let empty = "아직 기록이 없어요."
  public static let synthetic = "다른 프로그램 입력"
  public static let swipe = "마우스·화면"
  public static let hintsTip = "힌트를 본 판이 든 5판은 티어에 넣지 않아요"
  public static let replay = "다시 보기"
  public static let pause = "멈추기"
  public static let resume = "이어 보기"
  public static let restart = "처음부터"
  public static let close = "닫기"

  public static func hints(_ n: Int) -> String { "힌트 \(n)번" }
  public static func moves(_ n: Int) -> String { "\(n)수" }
  /// 다시 보기 상자 머리(「12번 · 23.45」)
  public static func replayHead(no: Int, ms: Double?) -> String { "\(no)번 · \(MiniBook.formatMs(ms))" }

  /// 요약 값 글(사이트 `formatMs`): 없음(NaN) 「-」, DNF(무한대) 「DNF」
  public static func summaryText(_ v: Double) -> String {
    if v.isNaN { return "-" }
    if v.isInfinite { return "DNF" }
    return MiniBook.formatMs(v)
  }

  // MARK: 줄

  /// 기록 한 줄
  public struct Row: Equatable, Sendable {
    public var no: Int
    public var at: Double
    /// 「11/12 09:05」
    public var when: String
    /// 「23.45」·「DNF」
    public var time: String
    public var moves: Int
    /// 실제 키보드가 아닌 입력이 섞인 판(막지 않고 표시만)
    public var synthetic: Bool
    public var swipe: Bool
    public var hints: Int
    public var canReplay: Bool
  }

  /// 「월/일 시:분」(사이트 `shortTime`, 이 기기 시간대)
  public static func shortTime(_ at: Double, timeZone: TimeZone = .current) -> String {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = timeZone
    let c = cal.dateComponents([.month, .day, .hour, .minute], from: Date(timeIntervalSince1970: at / 1000))
    return "\(c.month ?? 0)/\(c.day ?? 0) \(String(format: "%02d", c.hour ?? 0)):\(String(format: "%02d", c.minute ?? 0))"
  }

  public static func row(_ r: [String: Any], timeZone: TimeZone = .current) -> Row {
    let at = (r["at"] as? NSNumber)?.doubleValue ?? 0
    return Row(
      no: (r["no"] as? NSNumber)?.intValue ?? 0,
      at: at,
      when: shortTime(at, timeZone: timeZone),
      time: MiniBook.formatMs((r["ms"] as? NSNumber)?.doubleValue),
      moves: (r["moves"] as? NSNumber)?.intValue ?? 0,
      synthetic: r["keyOrigin"] as? String == "synthetic",
      swipe: (r["inputs"] as? [String])?.contains("swipe") ?? false,
      hints: (r["hints"] as? NSNumber)?.intValue ?? 0,
      canReplay: canReplay(r))
  }

  /// 다시 볼 수 있는 판: 다시 보기 글·섞기 글이 있고 맞춘 판(사이트 `hasReplay`, `IdleShow.hasReplay`와 같다)
  public static func canReplay(_ r: [String: Any]) -> Bool {
    guard r["ms"] is NSNumber, let replay = r["replay"] as? String, !replay.isEmpty,
      let scramble = r["scramble"] as? String, !scramble.isEmpty
    else { return false }
    return true
  }

  /// 다시 보기 거울: 메뉴 「거울」이 켜져 있고 칸이 거울을 담을 만큼 클 때(짧은 변 ≥ 크기 × 10, 사이트 `MINI_MIRROR_PER_N`)
  public static func replayMirror(wanted: Bool, n: Int, short: CGFloat) -> Bool {
    wanted && short >= CGFloat(10 * n)
  }
}
