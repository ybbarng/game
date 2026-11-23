import Foundation

/// 앱이 Dock과 ⌘Tab(앱 전환기)에 나오는지(활성화 정책, docs/52 5-18).
/// Cubie는 평소 메뉴 막대 아이콘과 떠 있는 큐브 창만 있는 앱이라 Dock·⌘Tab에 나오지 않는다(`.accessory`).
/// 그런데 보통 창(기록·티어표·설정, 그 창이 여는 사이트 창)이 다른 앱 창 뒤로 가면 ⌘Tab으로 고를 수 없어 찾지 못했다.
/// 그래서 보통 창이 하나라도 열려 있는 동안만 보통 앱(`.regular`)처럼 Dock·⌘Tab·메뉴 막대 앱 메뉴에 나온다.
/// 떠 있는 큐브 창·단축키 표·말풍선은 세지 않는다(늘 떠 있어 앞으로 가져올 일이 없다)
public enum AppPresence: Equatable, Sendable {
  /// 메뉴 막대 아이콘만(`.accessory`)
  case menuBarOnly
  /// Dock·⌘Tab·앱 메뉴에도(`.regular`)
  case dockAndSwitcher

  /// 열린 보통 창 수(최소화한 창도 센다: Dock에서 다시 꺼낼 수 있어야 한다) → 정책.
  /// 메모리 재기 모드(`measuring`)는 앞으로 나올 수조차 없게 둔 정책(`.prohibited`)을 바꾸지 않는다(nil)
  public static func forOpenWindows(_ count: Int, measuring: Bool) -> AppPresence? {
    if measuring { return nil }
    return count > 0 ? .dockAndSwitcher : .menuBarOnly
  }
}
