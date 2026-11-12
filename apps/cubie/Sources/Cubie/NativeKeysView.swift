import AppKit

/// 네이티브 단축키 표(F1, docs/47 15-25·docs/52 5-6): 사이트 `?view=keys&panel=1`(`KeysPanelPage` + `KeyboardMap` 「모두」)과
/// 같은 내용을 앱이 그린다. 웹 화면을 띄우지 않아 F1을 켜도 웹 프로세스(약 35MB)가 생기지 않는다.
/// - 위 줄: 섞기·되돌리기 키(지금 배치에서 읽음), 힌트 `\`, 닫기 F1·Esc, 오른쪽에 크기·배치 이름
/// - 키보드 그림: 실제 키보드 비례, 칸마다 맨 위 굵은 글은 그냥 칠 때, 그 아래 Shift, 맨 아래 Alt. 테두리는 그냥 칠 때 면 색
/// - 아래 줄: 칸 읽는 법(「두 손」 3×3 이상이면 숫자·Shift 규칙)
/// - 큐브 창에서 누른 키는 0.5초 빛난다(`KEYS_PANEL_PRESS_MS`)
@MainActor
final class NativeKeysView: NSView {
  struct Binding {
    var code: String
    var mods: Int
    var action: String
  }

  var n = 3 { didSet { needsDisplay = true } }
  var preset = "twoHand" { didSet { needsDisplay = true } }
  var bindings: [Binding] = [] { didSet { needsDisplay = true } }
  private var pressed: String?
  private var pressCancel: DispatchWorkItem?

  override var isFlipped: Bool { true }

  func press(_ code: String) {
    pressed = code
    pressCancel?.cancel()
    let w = DispatchWorkItem { [weak self] in
      MainActor.assumeIsolated {
        self?.pressed = nil
        self?.needsDisplay = true
      }
    }
    pressCancel = w
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: w)
    needsDisplay = true
  }

  /// 사이트 `KEYBOARD_ROWS`(Esc 줄은 뺀다: 표의 닫기 키라 위 줄에 적는다)
  static let rows: [[(String, CGFloat)]] = [
    [("Backquote", 1)] + (1...9).map { ("Digit\($0)", 1) } + [("Digit0", 1), ("Minus", 1), ("Equal", 1), ("Backspace", 2)],
    [("Tab", 1.5)] + "QWERTYUIOP".map { ("Key\($0)", 1) } + [("BracketLeft", 1), ("BracketRight", 1), ("Backslash", 1.5)],
    [("CapsLock", 1.75)] + "ASDFGHJKL".map { ("Key\($0)", 1) } + [("Semicolon", 1), ("Quote", 1), ("Enter", 2.25)],
    [("ShiftLeft", 2.25)] + "ZXCVBNM".map { ("Key\($0)", 1) }
      + [("Comma", 1), ("Period", 1), ("Slash", 1), ("ShiftRight", 2.75)],
    [("ControlLeft", 1.25), ("MetaLeft", 1.25), ("AltLeft", 1.25), ("Space", 6.25), ("AltRight", 1.25), ("Gap", 0.75),
     ("ArrowLeft", 1), ("ArrowDown", 1), ("ArrowRight", 1)],
  ]

  static let modifierCaps: [String: String] = [
    "Tab": "Tab", "CapsLock": "Caps", "ShiftLeft": "Shift", "ShiftRight": "Shift", "ControlLeft": "Ctrl",
    "MetaLeft": "⌘", "AltLeft": "Alt", "AltRight": "Alt",
  ]

  static func cap(_ code: String) -> String {
    if code.hasPrefix("Key") { return String(code.dropFirst(3)) }
    if code.hasPrefix("Digit") { return String(code.dropFirst(5)) }
    let named = [
      "Semicolon": ";", "Comma": ",", "Period": ".", "Slash": "/", "Quote": "'", "BracketLeft": "[",
      "BracketRight": "]", "Backquote": "`", "Minus": "-", "Equal": "=", "Backslash": "\\", "Space": "Space",
      "Backspace": "⌫", "Enter": "Enter", "ArrowLeft": "←", "ArrowRight": "→", "ArrowUp": "↑", "ArrowDown": "↓",
    ]
    return named[code] ?? modifierCaps[code] ?? code
  }

  /// 칸에 적을 짧은 글(사이트 `shortLabel`)
  static func short(_ action: String) -> String {
    let commands = [
      "undo": "되돌리기", "scramble": "섞기", "peekBack": "뒤 보기", "peekDown": "아래 보기", "viewHome": "처음 각도",
    ]
    if let c = commands[action] { return c }
    if action.hasPrefix("depth:") { return "\(action.dropFirst(6))번째 층" }
    if action.hasPrefix("layers:") {
      let side = action.dropFirst(7).first == "L" ? "왼손" : "오른손"
      return "\(side) 층 \(action.hasSuffix("+") ? "+1" : "−1")"
    }
    return action
  }

  /// 테두리 색: 그냥 칠 때 면 돌리기면 그 면 색
  static func tone(_ action: String) -> NSColor? {
    // 명령(되돌리기·섞기 등)과 깊이·층 수 키는 면 색이 없다
    if action.contains(":") || ["undo", "scramble", "peekBack", "peekDown", "viewHome"].contains(action) { return nil }
    guard let f = action.first else { return nil }
    let faces: [Character: UInt32] = [
      "U": 0xffffff, "R": 0xc8102e, "F": 0x009b48, "D": 0xffd500, "L": 0xff5800, "B": 0x0046ad,
      "u": 0xffffff, "r": 0xc8102e, "f": 0x009b48, "d": 0xffd500, "l": 0xff5800, "b": 0x0046ad,
    ]
    let letter = action.first(where: { $0.isLetter }) ?? f
    guard let hex = faces[letter] else { return nil }
    return NSColor(
      srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255,
      blue: CGFloat(hex & 0xff) / 255, alpha: 1)
  }

  private func label(_ mods: Int) -> String {
    bindings.filter { $0.action == (mods == 0 ? "scramble" : "undo") }.map { b -> String in
      (b.mods & 4 != 0 ? "Ctrl+" : "") + (b.mods & 2 != 0 ? "Alt+" : "") + (b.mods & 1 != 0 ? "Shift+" : "")
        + Self.cap(b.code)
    }.joined(separator: ", ")
  }

  override func draw(_ dirtyRect: NSRect) {
    NSColor(calibratedRed: 0.04, green: 0.04, blue: 0.04, alpha: 1).setFill()
    bounds.fill()
    let pad: CGFloat = 12
    let small = NSFont.systemFont(ofSize: 11)
    let bold = NSFont.systemFont(ofSize: 11, weight: .semibold)
    let dim = NSColor(white: 1, alpha: 0.6)
    // 위 줄
    var x = pad
    let topY: CGFloat = 8
    for (keys, what) in [(label(0), "섞기"), (label(1), "되돌리기"), ("\\", "힌트"), ("F1, Esc", "닫기")] where !keys.isEmpty {
      let k = NSAttributedString(string: keys + " ", attributes: [.font: bold, .foregroundColor: NSColor.white])
      let w = NSAttributedString(string: what, attributes: [.font: small, .foregroundColor: dim])
      k.draw(at: NSPoint(x: x, y: topY))
      w.draw(at: NSPoint(x: x + k.size().width, y: topY))
      x += k.size().width + w.size().width + 12
    }
    let presetName = ["twoHand": "두 손", "notation": "표기", "custom": "사용자"][preset] ?? preset
    let right = NSAttributedString(
      string: "\(n)×\(n) · 배치 「\(presetName)」", attributes: [.font: small, .foregroundColor: NSColor(white: 1, alpha: 0.5)])
    right.draw(at: NSPoint(x: bounds.width - pad - right.size().width, y: topY))

    // 키보드
    let gap: CGFloat = 3
    let unit = (bounds.width - pad * 2 - gap * 14) / 15
    let keyH: CGFloat = 38
    var y: CGFloat = 30
    var layers: [String: [Int: String]] = [:]
    for b in bindings where b.mods == 0 || b.mods == 1 || b.mods == 2 { layers[b.code, default: [:]][b.mods] = b.action }
    for row in Self.rows {
      x = pad
      for (code, w) in row {
        let width = unit * w + gap * (w - 1)
        defer { x += width + gap }
        if code == "Gap" { continue }
        let r = NSRect(x: x, y: y, width: width, height: keyH)
        let path = NSBezierPath(roundedRect: r, xRadius: 4, yRadius: 4)
        let modifier = Self.modifierCaps[code] != nil
        (pressed == code ? NSColor(srgbRed: 0.95, green: 0.8, blue: 0.3, alpha: 0.45) : NSColor(white: 1, alpha: modifier ? 0.03 : 0.07))
          .setFill()
        path.fill()
        let l = layers[code] ?? [:]
        (l[0].flatMap(Self.tone)?.withAlphaComponent(0.85) ?? NSColor(white: 1, alpha: 0.15)).setStroke()
        path.lineWidth = l[0].flatMap(Self.tone) == nil ? 1 : 1.5
        path.stroke()
        NSAttributedString(
          string: Self.cap(code), attributes: [.font: NSFont.systemFont(ofSize: 7), .foregroundColor: NSColor(white: 1, alpha: 0.35)]
        ).draw(at: NSPoint(x: r.minX + 2, y: r.minY + 1))
        var ly = r.minY + 9
        for (m, font, color) in [(0, NSFont.systemFont(ofSize: 9, weight: .bold), NSColor.white),
          (1, NSFont.systemFont(ofSize: 8), NSColor(white: 1, alpha: 0.7)), (2, NSFont.systemFont(ofSize: 8), NSColor(white: 1, alpha: 0.5))]
        {
          guard let a = l[m] else { continue }
          // 「두 손」 숫자 + Shift는 바깥 n층(사이트 키 그림 `keyTextFor`)
          let text = m == 1 && a.hasPrefix("depth:") ? "바깥 \(a.dropFirst(6))층" : Self.short(a)
          let s = NSAttributedString(string: text, attributes: [.font: font, .foregroundColor: color])
          s.draw(in: NSRect(x: r.minX + 2, y: ly, width: r.width - 3, height: 11))
          ly += 9.5
        }
      }
      y += keyH + gap
    }
    // 아래 줄
    var note = "칸마다 맨 위 굵은 글은 그냥 칠 때, 그 아래는 Shift와 함께, 맨 아래는 Alt와 함께 칠 때예요."
    if preset == "twoHand" && n >= 3 {
      note += " 숫자 n 다음 면 키는 그 면의 n번째 층 하나, 숫자 n 다음 Shift + 면 키는 바깥 n층을 같이 돌려요(7×7 바깥 세 층은 3 → Shift+I)."
    }
    NSAttributedString(string: note, attributes: [.font: NSFont.systemFont(ofSize: 10), .foregroundColor: NSColor(white: 1, alpha: 0.5)])
      .draw(with: NSRect(x: pad, y: y + 2, width: bounds.width - pad * 2, height: bounds.height - y - 4), options: [.usesLineFragmentOrigin])
  }
}
