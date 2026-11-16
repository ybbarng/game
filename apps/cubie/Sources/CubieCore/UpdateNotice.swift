import Foundation

/// 새 판 말풍선(docs/47 15-12): 메뉴 막대 아이콘이 가려져 메뉴 첫 줄의 「새 판 … 설치…」를 못 보는 사람에게도
/// 새 판을 알린다. 사용자가 큐브로 온 순간(⌃⌥⌘C·메뉴 「큐브로 가기」·큐브 누르기)에만 큐브 옆 말풍선으로 보이고,
/// 포커스를 빼앗지 않는다. 시각은 부르는 쪽이 넣는다(시험은 정한 시각으로 본다).
public enum UpdateNotice {
  /// 같은 판을 다시 알리기까지(하루)
  public static let repeatInterval: TimeInterval = 24 * 60 * 60
  /// 마지막으로 알린 판과 때(UserDefaults)
  public static let versionKey = "CubieUpdateNoticeVersion"
  public static let atKey = "CubieUpdateNoticeAt"

  /// 마지막으로 알린 것
  public struct Shown: Equatable, Sendable {
    public let version: String
    public let at: Date
    public init(version: String, at: Date) {
      self.version = version
      self.at = at
    }
  }

  /// 지금 말풍선을 보일까.
  /// - `pending`: Sparkle이 찾아 두고 아직 보이지 않은 새 판(없으면 알리지 않는다)
  /// - `last`: 마지막으로 알린 판과 때. 다른 판이면 바로, 같은 판이면 하루가 지난 뒤에만
  /// - `solving`: 맞추는 중(시간이 도는 판·공식 연습)이면 기록을 방해하지 않게 미룬다
  public static func shouldShow(pending: String?, last: Shown?, now: Date, solving: Bool) -> Bool {
    guard let pending, !pending.isEmpty, !solving else { return false }
    guard let last, last.version == pending else { return true }
    // 시계를 뒤로 돌렸으면(지난 때가 앞날) 다시 알린다
    let gap = now.timeIntervalSince(last.at)
    return gap >= repeatInterval || gap < 0
  }

  /// 말풍선 글: 판 번호와 「설치」만
  public static func text(version: String) -> String { "새 판 \(version) 설치" }
}
