import Carbon.HIToolbox

/// 전역 단축키(Carbon `RegisterEventHotKey`). 손쉬운 사용 권한이 필요 없다.
/// 다른 앱이 같은 조합을 이미 잡았으면 등록에 실패하고 `register`가 false를 돌려준다.
@MainActor
final class HotKey {
  private var ref: EventHotKeyRef?
  private var handler: EventHandlerRef?
  private let action: @MainActor () -> Void

  /// C 콜백이 부를 곳(단축키는 하나뿐이다)
  nonisolated(unsafe) private static var current: HotKey?

  init(action: @escaping @MainActor () -> Void) {
    self.action = action
  }

  func register(keyCode: UInt32, modifiers: UInt32) -> Bool {
    HotKey.current = self
    var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
    let installed = InstallEventHandler(
      GetApplicationEventTarget(),
      { _, _, _ -> OSStatus in
        MainActor.assumeIsolated { HotKey.current?.action() }
        return noErr
      },
      1, &spec, nil, &handler)
    guard installed == noErr else { return false }
    let id = EventHotKeyID(signature: OSType(0x4355_4249), id: 1)  // 'CUBI'
    let status = RegisterEventHotKey(keyCode, modifiers, id, GetApplicationEventTarget(), 0, &ref)
    return status == noErr && ref != nil
  }

  func unregister() {
    if let ref { UnregisterEventHotKey(ref) }
    if let handler { RemoveEventHandler(handler) }
    ref = nil
    handler = nil
  }
}
