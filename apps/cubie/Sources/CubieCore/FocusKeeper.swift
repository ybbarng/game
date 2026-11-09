/// 포커스 돌려주기의 판단(화면 없이 시험한다). 앱(`AppDelegate`)은 실제 `NSRunningApplication`을 감싸 넘긴다.
///
/// - 다른 앱이 앞으로 올 때마다 기억한다(창을 직접 눌러 큐브로 왔을 때도 Esc로 돌아갈 곳).
/// - 단축키로 큐브에 올 때는 그 순간 앞에 있던 앱을 기억한다(Cubie 자신이면 그대로).
/// - Esc: 기억한 앱이 아직 살아 있으면 그 앱, 없으면 nil(앱은 자기를 숨겨 앞 앱에 넘긴다).
/// - 단축키를 다시 누르면(큐브가 이미 키를 받는 중) 돌려준다.
public protocol FocusApp: AnyObject {
  var isSelf: Bool { get }
  var isTerminated: Bool { get }
}

public enum HotKeyAction: Equatable {
  case focusCube
  case returnFocus
}

public final class FocusKeeper<App: FocusApp> {
  public private(set) var previous: App?

  public init(front: App?) {
    if let front, !front.isSelf { previous = front }
  }

  /// 어떤 앱이 앞으로 왔다(작업 공간 알림)
  public func activated(_ app: App?) {
    if let app, !app.isSelf { previous = app }
  }

  /// 단축키: 큐브가 키를 받는 중이면 돌려주고, 아니면 지금 앞 앱을 기억하고 큐브로
  public func hotKey(cubeFocused: Bool, front: App?) -> HotKeyAction {
    if cubeFocused { return .returnFocus }
    activated(front)
    return .focusCube
  }

  /// Esc로 돌아갈 앱(끝난 앱이면 nil)
  public func returnTarget() -> App? {
    guard let p = previous, !p.isTerminated else { return nil }
    return p
  }
}

/// 키 하나의 출처 판정(docs/47 15절). 값은 `CGEvent` 칸에서 읽는다(`KeySource.swift`).
/// 하드웨어 입력 계층(stateID 1)이고 넣은 프로세스가 없으면(pid 0) 실제 키보드로 본다.
/// 2026-11-09 이 맥 실측: CGEventPost(HID 계층·앱 묶음)·CGEvent.postToPid는 pid가 남아 가려지지만,
/// osascript System Events keystroke는 stateID 1·pid 0으로 와서 실제 키보드와 구별되지 않았다.
public enum KeySourceRule {
  public static let hidSystemState: Int64 = 1

  public static func isKeyboard(stateID: Int64, pid: Int64) -> Bool {
    stateID == hidSystemState && pid == 0
  }
}
