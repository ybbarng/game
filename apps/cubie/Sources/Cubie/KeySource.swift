import AppKit
import CoreGraphics
import CubieCore

/// 키 입력 하나의 출처(공정함 확인, docs/47 14절). 막지는 않고 웹에 알려 그 판 기록에 표시만 한다.
///
/// 맥은 키 이벤트마다 그 이벤트를 만든 곳을 적어 둔다(`CGEvent` 칸):
/// - `eventSourceStateID`: 1(`CGEventSourceStateID.hidSystemState`)은 하드웨어 입력 계층, 0은 앱 묶음 상태(`combinedSessionState`),
///   -1은 따로 둔 상태(`privateState`). 실제 키보드는 1이다.
/// - `eventSourceUnixProcessID`: 이벤트를 넣은 프로세스 번호. 실제 키보드는 0, 다른 프로그램이 넣으면 그 프로그램 번호.
///
/// 판정(`KeySourceRule`): 넣은 프로세스가 없고(0) 하드웨어 계층(1)이면 실제 키보드, 아니면 다른 프로그램 입력.
/// 못 가리는 것: osascript System Events keystroke(2026-11-09 실측, 실제 키보드와 같은 1·0으로 왔다), 가상 HID 장치
/// (Karabiner 같은 드라이버 수준 장치), 하드웨어 키보드를 흉내 내는 USB 장치, 드라이버·커널 수준에서 칸 값을 바꿔 넣기.
enum KeySource: String {
  case keyboard
  case synthetic

  struct Fields: CustomStringConvertible {
    let stateID: Int64
    let pid: Int64
    let userData: Int64
    let keyboardType: Int64
    var description: String {
      "stateID=\(stateID) pid=\(pid) userData=\(userData) keyboardType=\(keyboardType)"
    }
  }

  static func fields(_ event: NSEvent) -> Fields? {
    guard let cg = event.cgEvent else { return nil }
    return Fields(
      stateID: cg.getIntegerValueField(.eventSourceStateID),
      pid: cg.getIntegerValueField(.eventSourceUnixProcessID),
      userData: cg.getIntegerValueField(.eventSourceUserData),
      keyboardType: cg.getIntegerValueField(.keyboardEventKeyboardType))
  }

  static func of(_ event: NSEvent) -> KeySource {
    guard let f = fields(event) else { return .synthetic }
    return KeySourceRule.isKeyboard(stateID: f.stateID, pid: f.pid) ? .keyboard : .synthetic
  }
}
