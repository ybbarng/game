import AppKit
import CubieCore
import CubieNativeC

/// 네이티브 단축키 표(F1, docs/47 15-25·docs/52 5-6): 사이트 `?view=keys&panel=1`(`KeysPanelPage` + `KeyboardMap` 「모두」)과
/// 같은 내용을 앱이 그린다. 웹 화면을 띄우지 않아 F1을 켜도 웹 프로세스(약 35MB)가 생기지 않는다.
/// - 위 줄: 섞기·되돌리기 키(지금 배치에서 읽음), 힌트 `\`, 닫기 F1·Esc, 오른쪽에 크기·배치 이름
/// - 키보드 그림: 실제 키보드 비례, 칸마다 맨 위 굵은 글은 그냥 칠 때, 그 아래 Shift, 맨 아래 Alt. 칸 글은 Rust 코어가
///   사이트와 같게 만든다(`cubie_game_key_table`, 3×3의 2L′ → M′, 못 쓰는 수는 흐리게). 칸 색도 사이트와 같다: 면 돌리기는
///   칸 바탕에 면 색을 옅게, 큐브 돌리기는 칸 아래 점선·가운데 층은 짧은 선에 빌린 면 색(코어 `keys::paint`, `keypaint.json`)
/// - 화살표: 사이트처럼 위 하나(처음 각도)·아래 셋(뒤 보기·아래 보기·뒤 보기)을 한 칸 높이에 두 줄로
/// - 아래 줄: 칸 읽는 법(「두 손」 3×3 이상이면 숫자·Shift 규칙)
/// - 큐브 창에서 누른 키는 0.5초 빛난다(`KEYS_PANEL_PRESS_MS`)
@MainActor
final class NativeKeysView: NSView {
  struct Binding {
    var code: String
    var mods: Int
    var action: String
  }

  /// 칸의 한 줄(코어 `keys::table::TableLine`)
  struct Line: Equatable {
    var mods: Int
    var usable: Bool
    var action: String
    var label: String
    /// 칠하기(코어 `keys::paint`): 「f」·「s」 + 면 번호 + 반대 + 넓게·큐브 돌리기, 수가 아니면 빈 글
    var paint = ""
  }

  /// 칸에 칠할 면 색(설정 `colors`·`colorScheme`·`keyColors`)
  struct Look {
    var colors: [UInt32] = CubeSettings.standard
    var scheme = "standard"
    var on = true
  }

  /// 표 하나를 그릴 자료: 배치 이름, 위 줄 키를 읽을 배치, 칸마다의 줄
  struct Source {
    var preset: String
    var bindings: [Binding]
    var cells: [String: [Line]]
    var look = Look()

    static let empty = Source(preset: "twoHand", bindings: [], cells: [:])

    /// 코어 게임의 지금 배치에서 크기 n의 표
    static func of(game: OpaquePointer, n: Int, preset: String, look: Look = Look()) -> Source {
      let bindings = NativeCore.string { cubie_game_key_bindings(game, UInt32(n), $0, $1) }.split(separator: "\n")
        .compactMap { line -> Binding? in
          let f = line.split(separator: "\t", omittingEmptySubsequences: false).map(String.init)
          guard f.count == 3, let m = Int(f[1]) else { return nil }
          return Binding(code: f[0], mods: m, action: f[2])
        }
      let table = NativeCore.string { cubie_game_key_table(game, UInt32(n), $0, $1) }
      return Source(preset: preset, bindings: bindings, cells: NativeKeysView.parseTable(table), look: look)
    }
  }

  /// `cubie_game_key_table` 글 → 키마다 줄(위에서부터)
  nonisolated static func parseTable(_ text: String) -> [String: [Line]] {
    var out: [String: [Line]] = [:]
    for line in text.split(separator: "\n") {
      let f = line.split(separator: "\t", omittingEmptySubsequences: false).map(String.init)
      guard f.count >= 5, let m = Int(f[1]) else { continue }
      out[f[0], default: []].append(
        Line(mods: m, usable: f[2] == "1", action: f[3], label: f[4], paint: f.count > 5 ? f[5] : ""))
    }
    return out
  }

  var n = 3 { didSet { needsDisplay = true } }
  var source = Source.empty { didSet { needsDisplay = true } }
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

  /// 화살표 묶음(위 하나, 아래 셋)을 한 칸으로 그린다(사이트 `ARROWS`)
  static let arrows = "Arrows"

  /// 사이트 `KEYBOARD_ROWS`(Esc 줄은 뺀다: 표의 닫기 키라 위 줄에 적는다)
  static let rows: [[(String, CGFloat)]] = [
    [("Backquote", 1)] + (1...9).map { ("Digit\($0)", 1) } + [("Digit0", 1), ("Minus", 1), ("Equal", 1), ("Backspace", 2)],
    [("Tab", 1.5)] + "QWERTYUIOP".map { ("Key\($0)", 1) } + [("BracketLeft", 1), ("BracketRight", 1), ("Backslash", 1.5)],
    [("CapsLock", 1.75)] + "ASDFGHJKL".map { ("Key\($0)", 1) } + [("Semicolon", 1), ("Quote", 1), ("Enter", 2.25)],
    [("ShiftLeft", 2.25)] + "ZXCVBNM".map { ("Key\($0)", 1) }
      + [("Comma", 1), ("Period", 1), ("Slash", 1), ("ShiftRight", 2.75)],
    [("ControlLeft", 1.25), ("MetaLeft", 1.25), ("AltLeft", 1.25), ("Space", 6.25), ("AltRight", 1.25), ("Gap", 0.75),
     (arrows, 3)],
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

  /// 칸에 키 글자를 따로 적을지(사이트 `capRepeats`): 칸 글이 키 글자와 같은 글자면(「표기」의 R 키 = R) 한 번만 적는다
  static func capRepeats(_ cap: String, _ label: String?) -> Bool {
    guard let label else { return false }
    let core = label.filter { !"'′2w".contains($0) }
    return core.count == 1 && core.uppercased() == cap.uppercased()
  }

  static let commands: Set<String> = ["undo", "reset", "scramble", "inspectionSkip", "peekBack", "peekDown", "viewHome"]

  /// 낱말(명령·깊이·층 수: 되돌리기·3번째 층)인가: 수보다 작게 적는다(사이트 `isWordy`)
  static func isWordy(_ l: Line) -> Bool {
    l.action.contains(":") || commands.contains(l.action)
  }

  /// 칸 하나의 칠하기(사이트 `KeyPaint.tsx` `useKeyLook`·`KeyMark`, 값은 코어 `keys::paint`)
  struct Paint: Equatable {
    /// 면 돌리기면 칸 바탕(면 색을 옅게), 아니면 nil
    var fill: UInt32?
    /// 면 돌리기 칸의 사선 무늬 색(색약 친화·높은 대비 배색의 주황)
    var stripe: UInt32?
    /// 큐브 돌리기(점선)·가운데 층(짧은 선)의 선 색과 모양, 반대 방향은 흐리게
    var line: UInt32?
    var dotted = false
    var prime = false
  }

  /// 그냥 칠 때 줄의 칠하기 글 → 칸 칠하기. 쓸 수 없는 줄·면 색을 끈 설정·수가 아닌 줄은 nil
  static func paint(_ line: Line?, look: Look) -> Paint? {
    guard look.on, let line, line.usable, line.paint.count == 4 else { return nil }
    let f = Array(line.paint)
    guard let color = Int(String(f[1])), color < look.colors.count else { return nil }
    let rgb = look.colors[color]
    let prime = f[2] == "1"
    if f[0] == "f" {
      let striped = look.scheme.withCString { cubie_key_striped($0, UInt8(color)) }
      return Paint(
        fill: cubie_key_tone(rgb, prime ? 1 : 0), stripe: striped ? cubie_key_tone(rgb, prime ? 4 : 3) : nil,
        prime: prime)
    }
    return Paint(line: cubie_key_tone(rgb, 2), dotted: f[3] == "1", prime: prime)
  }

  static func ns(_ hex: UInt32, _ alpha: CGFloat = 1) -> NSColor {
    NSColor(
      srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255,
      blue: CGFloat(hex & 0xff) / 255, alpha: alpha)
  }

  /// 글을 폭 `width` 안에 들게: 넘치면 글꼴을 줄인다(잘리지 않게)
  static func fitted(_ text: String, _ font: NSFont, _ color: NSColor, width: CGFloat) -> NSAttributedString {
    var f = font
    var s = NSAttributedString(string: text, attributes: [.font: f, .foregroundColor: color])
    let w = s.size().width
    if w > width, width > 0 {
      f = NSFont(descriptor: font.fontDescriptor, size: max(5, font.pointSize * width / w)) ?? font
      s = NSAttributedString(string: text, attributes: [.font: f, .foregroundColor: color])
    }
    return s
  }

  private func label(_ mods: Int) -> String {
    source.bindings.filter { $0.action == (mods == 0 ? "scramble" : "undo") }.map { b -> String in
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
    let presetName = ["twoHand": "두 손", "notation": "표기", "custom": "사용자"][source.preset] ?? source.preset
    let right = NSAttributedString(
      string: "\(n)×\(n) · 배치 「\(presetName)」", attributes: [.font: small, .foregroundColor: NSColor(white: 1, alpha: 0.5)])
    right.draw(at: NSPoint(x: bounds.width - pad - right.size().width, y: topY))

    // 키보드
    let gap: CGFloat = 3
    let unit = (bounds.width - pad * 2 - gap * 14) / 15
    let keyH: CGFloat = 38
    var y: CGFloat = 30
    for row in Self.rows {
      x = pad
      for (code, w) in row {
        let width = unit * w + gap * (w - 1)
        defer { x += width + gap }
        if code == "Gap" { continue }
        let r = NSRect(x: x, y: y, width: width, height: keyH)
        if code == Self.arrows {
          drawArrows(in: r, gap: 2)
        } else {
          drawKey(code, in: r)
        }
      }
      y += keyH + gap
    }
    // 아래 줄
    var note = "칸마다 맨 위 굵은 글은 그냥 칠 때, 그 아래는 Shift와 함께, 맨 아래는 Alt와 함께 칠 때예요."
    if source.preset == "twoHand" && n >= 3 {
      note += " 숫자 n 다음 면 키는 그 면의 n번째 층 하나, 숫자 n 다음 Shift + 면 키는 바깥 n층을 같이 돌려요(7×7 바깥 세 층은 3 → Shift+I)."
    }
    // 사이트 `break-keep`처럼 낱말 가운데서 줄을 바꾸지 않는다
    let para = NSMutableParagraphStyle()
    para.lineBreakStrategy = .hangulWordPriority
    NSAttributedString(
      string: note,
      attributes: [.font: NSFont.systemFont(ofSize: 10), .foregroundColor: NSColor(white: 1, alpha: 0.5), .paragraphStyle: para])
      .draw(with: NSRect(x: pad, y: y + 2, width: bounds.width - pad * 2, height: bounds.height - y - 4), options: [.usesLineFragmentOrigin])
  }

  /// 칸 바탕과 테두리(사이트 `KeyboardMap`): 테두리는 무채색 하나, 면 돌리기 칸은 바탕에 면 색을 옅게(+ 사선 무늬),
  /// 큐브 돌리기·가운데 층은 칸 아래 선. 누른 칸은 칠하기 대신 빛난다(사이트도 상태가 있으면 바탕 칠하기를 뺀다)
  private func fillKey(_ code: String, _ r: NSRect, modifier: Bool, idle: Bool, paint: Paint?) {
    let path = NSBezierPath(roundedRect: r.insetBy(dx: 0.5, dy: 0.5), xRadius: 4, yRadius: 4)
    let lit = pressed == code
    if lit {
      NSColor(srgbRed: 0.95, green: 0.8, blue: 0.3, alpha: 0.45).setFill()
    } else if let fill = paint?.fill {
      Self.ns(fill).setFill()
    } else {
      NSColor(white: 1, alpha: modifier || idle ? 0 : 0.04).setFill()
    }
    path.fill()
    if !lit, let stripe = paint?.stripe {
      // 135° 사선, 2px 선·5px 틈(사이트 `stripeImage`)
      NSGraphicsContext.saveGraphicsState()
      path.addClip()
      Self.ns(stripe).setStroke()
      let lines = NSBezierPath()
      lines.lineWidth = 2
      var x = r.minX - r.height
      while x < r.maxX + r.height {
        lines.move(to: NSPoint(x: x, y: r.minY))
        lines.line(to: NSPoint(x: x + r.height, y: r.maxY))
        x += 7 * 2.squareRoot()
      }
      lines.stroke()
      NSGraphicsContext.restoreGraphicsState()
    }
    NSColor(white: 1, alpha: modifier ? 0.06 : idle ? 0.05 : 0.10).setStroke()
    path.lineWidth = 1
    path.stroke()
    if !lit, let line = paint?.line { drawMark(in: r, color: line, dotted: paint?.dotted ?? false, prime: paint?.prime ?? false) }
  }

  /// 칸 아래 선(사이트 `KeyMark`): 큐브 돌리기는 칸 너비 56%의 점선(지름 3px, 5px마다 하나, 남는 길이를 고르게),
  /// 가운데 층은 20%의 짧은 선. 굵기 3px, 칸 아래에서 4px 위. 반대 방향은 불투명도 0.6
  private func drawMark(in r: NSRect, color: UInt32, dotted: Bool, prime: Bool) {
    let c = Self.ns(color, prime ? 0.6 : 1)
    c.setFill()
    let inset = r.width * (dotted ? 0.22 : 0.40)
    let box = NSRect(x: r.minX + inset, y: r.maxY - 4 - 3, width: r.width - inset * 2, height: 3)
    if !dotted {
      NSBezierPath(roundedRect: box, xRadius: 1.5, yRadius: 1.5).fill()
      return
    }
    let pitch: CGFloat = 5
    let count = max(1, Int(box.width / pitch))
    let space = (box.width - CGFloat(count) * 3) / CGFloat(count + 1)
    for i in 0..<count {
      let x = box.minX + space + CGFloat(i) * (3 + space)
      NSBezierPath(ovalIn: NSRect(x: x, y: box.minY, width: 3, height: 3)).fill()
    }
  }

  private func drawKey(_ code: String, in r: NSRect) {
    let lines = source.cells[code] ?? []
    let plain = lines.first { $0.mods == 0 }
    let modifier = Self.modifierCaps[code] != nil
    let cap = Self.cap(code)
    let idle = !modifier && !(plain?.usable ?? false)
    let plainPaint = modifier ? nil : Self.paint(plain, look: source.look)
    fillKey(code, r, modifier: modifier, idle: idle, paint: plainPaint)
    if modifier || !Self.capRepeats(cap, plain?.usable == true ? plain?.label : nil) {
      NSAttributedString(
        string: cap,
        attributes: [.font: NSFont.systemFont(ofSize: 7), .foregroundColor: NSColor(white: 1, alpha: idle ? 0.15 : 0.35)]
      ).draw(at: NSPoint(x: r.minX + 2, y: r.minY + 1))
    }
    guard !modifier, !lines.isEmpty else { return }
    // 칸 아래부터 쌓는다(사이트처럼 글은 칸 아래쪽). 줄이 많아 키 글자 자리까지 넘치면 글꼴을 함께 줄인다
    let styled: [(Line, NSFont, NSColor)] = lines.enumerated().map { i, l in
      let strong = i == 0 && l.mods == 0
      let font =
        strong
        ? NSFont.systemFont(ofSize: Self.isWordy(l) ? 8.5 : 10, weight: .semibold)
        : NSFont.systemFont(ofSize: 7.5)
      // 반대 방향 면 색 칸은 글자를 한 단계 흐리게(사이트 `labelTone`)
      let base = strong ? NSColor(white: 1, alpha: plainPaint?.prime == true ? 0.6 : 0.9) : NSColor(white: 1, alpha: 0.45)
      return (l, font, l.usable ? base : base.withAlphaComponent(base.alphaComponent * 0.35))
    }
    // 줄 간격은 글꼴 크기의 1.15배(글 상자 높이보다 촘촘히, 사이트 leading-[1.15])
    let room = r.height - 9 - 1
    let total = styled.reduce(CGFloat(0)) { $0 + $1.1.pointSize * 1.15 }
    let shrink = min(1, room / total)
    var base = r.maxY - 3
    for (l, font, color) in styled.reversed() {
      let f = shrink < 1 ? (NSFont(descriptor: font.fontDescriptor, size: font.pointSize * shrink) ?? font) : font
      let s = Self.fitted(l.label, f, color, width: r.width - 4)
      // 글 기준선을 줄 아래에 맞춘다(flipped 좌표에서 draw(at:)은 글 상자 위 왼쪽)
      s.draw(with: NSRect(x: r.minX + 2, y: base, width: r.width - 3, height: 0), options: [])
      base -= f.pointSize * 1.15
    }
  }

  /// 화살표 묶음: 위 줄 가운데 ↑, 아래 줄 ← ↓ →(사이트 `Arrows`). 칸마다 키 글자와 그 아래 동작 글을 가운데에
  private func drawArrows(in r: NSRect, gap: CGFloat) {
    let w = (r.width - gap * 2) / 3
    let h = (r.height - gap) / 2
    let spots: [(String, CGFloat, CGFloat)] = [
      ("ArrowUp", 1, 0), ("ArrowLeft", 0, 1), ("ArrowDown", 1, 1), ("ArrowRight", 2, 1),
    ]
    for (code, col, row) in spots {
      let cell = NSRect(x: r.minX + col * (w + gap), y: r.minY + row * (h + gap), width: w, height: h)
      let line = source.cells[code]?.first
      fillKey(code, cell, modifier: false, idle: false, paint: nil)
      let cap = NSAttributedString(
        string: Self.cap(code),
        attributes: [.font: NSFont.systemFont(ofSize: 6.5), .foregroundColor: NSColor(white: 1, alpha: 0.45)])
      guard let line else {
        cap.draw(at: NSPoint(x: cell.midX - cap.size().width / 2, y: cell.midY - cap.size().height / 2))
        continue
      }
      let text = Self.fitted(line.label, NSFont.systemFont(ofSize: 7), NSColor(white: 1, alpha: 0.8), width: cell.width - 3)
      let top = cell.midY - (cap.size().height + text.size().height) / 2
      cap.draw(at: NSPoint(x: cell.midX - cap.size().width / 2, y: top))
      text.draw(at: NSPoint(x: cell.midX - text.size().width / 2, y: top + cap.size().height))
    }
  }
}
