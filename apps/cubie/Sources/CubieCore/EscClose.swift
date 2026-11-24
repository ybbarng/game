import Foundation

/// 보통 창에서 Esc를 누르면 창을 닫는지(docs/52 5-8 「세 창 모두 Esc로 닫는다」).
/// 글 칸에 글을 쓰는 중(키 배치 가져오기 칸 등)이면 Esc는 글 칸 몫이라 창을 닫지 않는다. 쓰던 글을 잃지 않는다
public enum EscClose {
  public enum Window: Sendable {
    /// 앱이 그린 기록·티어표·설정 창
    case native
    /// 사이트 창(`settings`면 설정 화면: 웹 화면의 Esc를 그대로 둔다)
    case site(settings: Bool)
    /// 큐브 창·다른 창
    case other
  }

  public static func closes(_ window: Window, editingText: Bool) -> Bool {
    if editingText { return false }
    switch window {
    case .native: return true
    case .site(let settings): return !settings
    case .other: return false
    }
  }
}
