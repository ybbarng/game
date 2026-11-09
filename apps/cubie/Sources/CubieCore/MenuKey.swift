/// 메뉴 항목 오른쪽에 보일 단축키(`NSMenuItem.keyEquivalent`·`keyEquivalentModifierMask`로 옮긴다).
/// 웹 키 배치는 키를 `KeyboardEvent.code`(자판 위치, 예: "KeyR", "Enter")로 적으므로 그 값을 메뉴가 쓰는
/// 글자로 바꾼다(화면 없이 시험한다). 웹 배치의 수식 키는 Shift·Alt·Ctrl이고, ⌘는 앱 전역 단축키에만 쓴다.
public struct MenuKey: Equatable, Sendable {
  /// `keyEquivalent`에 넣을 글자(영문은 소문자, 특수 키는 AppKit 기능 키 글자)
  public let key: String
  public var shift = false
  public var option = false
  public var control = false
  public var command = false

  public init(
    key: String, shift: Bool = false, option: Bool = false, control: Bool = false, command: Bool = false
  ) {
    self.key = key
    self.shift = shift
    self.option = option
    self.control = control
    self.command = command
  }

  /// AppKit 기능 키 글자(`NSF1FunctionKey` 등. CubieCore는 AppKit을 들이지 않아 값으로 둔다)
  static func function(_ code: UInt32) -> String { String(Character(UnicodeScalar(code)!)) }
  public static let f1 = function(0xF704)

  /// 웹 키 코드(+ 수식) → 메뉴 단축키. 메뉴에 그릴 수 없는 키면 nil
  public static func fromWeb(code: String, shift: Bool = false, alt: Bool = false, ctrl: Bool = false)
    -> MenuKey?
  {
    guard let key = webKey(code) else { return nil }
    return MenuKey(key: key, shift: shift, option: alt, control: ctrl)
  }

  /// 앱이 먼저 가로채는 키는 웹에 닿지 않아 nil: Esc(「이전 앱으로」, 열린 메뉴도 닫는다)·F1(「공식 보기」)
  static func webKey(_ code: String) -> String? {
    if code.hasPrefix("Key"), code.count == 4 { return code.dropFirst(3).lowercased() }
    if code.hasPrefix("Digit"), code.count == 6 { return String(code.dropFirst(5)) }
    if code.hasPrefix("F"), let n = UInt32(code.dropFirst()), (2...12).contains(n) {
      return function(0xF704 + n - 1)
    }
    let named: [String: String] = [
      "Semicolon": ";", "Comma": ",", "Period": ".", "Slash": "/", "Quote": "'",
      "BracketLeft": "[", "BracketRight": "]", "Backquote": "`", "Minus": "-", "Equal": "=",
      "Backslash": "\\", "Space": " ", "Enter": "\r", "Tab": "\t",
      "Backspace": "\u{8}",
      "ArrowUp": function(0xF700), "ArrowDown": function(0xF701),
      "ArrowLeft": function(0xF702), "ArrowRight": function(0xF703),
    ]
    return named[code]
  }
}
