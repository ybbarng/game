import AppKit
import CubieCore

/// 네이티브 보통 창(기록 창·티어표·설정 창, docs/52 5-8)이 함께 쓰는 작은 그리기 도구. 사이트 화면(Tailwind)의 색·글자 크기를
/// 그대로 옮겨 같은 모양으로 보이게 한다. 창 안 배치는 창마다 `layout()`에서 틀을 직접 셈한다(자동 배치보다 사이트와 맞추기 쉽다)
@MainActor
enum NUI {
  /// Tailwind 4 색(sRGB 근사)
  enum Hex {
    static let neutral950: UInt32 = 0x0a0a0a
    static let neutral900: UInt32 = 0x171717
    static let neutral800: UInt32 = 0x262626
    static let sky200: UInt32 = 0xb8e6fe
    static let sky300: UInt32 = 0x74d4ff
    static let sky400: UInt32 = 0x00bcff
    static let sky500: UInt32 = 0x00a6f4
    static let amber100: UInt32 = 0xfef3c6
    static let amber200: UInt32 = 0xfee685
    static let amber300: UInt32 = 0xffd230
    static let amber400: UInt32 = 0xffb900
    static let amber500: UInt32 = 0xfe9a00
    static let rose200: UInt32 = 0xffccd3
    static let rose500: UInt32 = 0xff2056
    static let red300: UInt32 = 0xffa2a2
    static let red500: UInt32 = 0xfb2c36
  }

  /// 티어마다 이름 색(사이트 `TIER_TONE`, 아이언부터)
  static let tierTone: [UInt32] = [
    0xa6a09b, 0xffb86a, 0xe2e8f0, 0xffdf20, 0x46ecd5, 0x00d492, 0x74d4ff, 0xf4a8ff, 0xff637e, 0xfee685,
  ]

  static func color(_ hex: UInt32, _ alpha: CGFloat = 1) -> NSColor {
    NSColor(
      srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255,
      blue: CGFloat(hex & 0xff) / 255, alpha: alpha)
  }

  static func white(_ alpha: CGFloat) -> NSColor { NSColor(white: 1, alpha: alpha) }

  static func font(_ size: CGFloat, _ weight: NSFont.Weight = .regular, mono: Bool = false) -> NSFont {
    mono ? .monospacedDigitSystemFont(ofSize: size, weight: weight) : .systemFont(ofSize: size, weight: weight)
  }

  /// 글 한 덩이(줄 바꿈은 `width`를 주면). 숫자는 고른 폭(사이트 `tabular-nums`)
  static func label(
    _ text: String, size: CGFloat = 12, weight: NSFont.Weight = .regular, color: NSColor = .white, mono: Bool = true
  ) -> NSTextField {
    let l = NSTextField(labelWithString: text)
    l.font = font(size, weight, mono: mono)
    l.textColor = color
    l.lineBreakMode = .byTruncatingTail
    l.drawsBackground = false
    l.isSelectable = false
    return l
  }

  /// 여러 줄 글(낱말 단위로 끊는다, 사이트 `break-keep`)
  static func paragraph(_ text: String, size: CGFloat = 12, color: NSColor, lineHeight: CGFloat? = nil) -> NSTextField {
    let l = NSTextField(wrappingLabelWithString: text)
    l.isSelectable = false
    l.drawsBackground = false
    l.attributedStringValue = attributed(text, size: size, color: color, lineHeight: lineHeight)
    return l
  }

  static func attributed(_ text: String, size: CGFloat, color: NSColor, lineHeight: CGFloat? = nil, weight: NSFont.Weight = .regular)
    -> NSAttributedString
  {
    let p = NSMutableParagraphStyle()
    p.lineBreakMode = .byWordWrapping
    p.lineBreakStrategy = .hangulWordPriority
    if let lineHeight {
      p.minimumLineHeight = lineHeight
      p.maximumLineHeight = lineHeight
    }
    return NSAttributedString(
      string: text, attributes: [.font: font(size, weight, mono: true), .foregroundColor: color, .paragraphStyle: p])
  }

  /// 줄 바꿈 글의 높이(너비 `w`)
  static func height(_ l: NSTextField, width w: CGFloat) -> CGFloat {
    l.preferredMaxLayoutWidth = w
    return ceil(l.attributedStringValue.boundingRect(
      with: NSSize(width: w, height: 10_000), options: [.usesLineFragmentOrigin, .usesFontLeading]
    ).height) + 2
  }

  /// 글과 색을 함께 바꾼다(글만 바꾸면 처음 색을 잃을 때가 있어 글 꼴째 넣는다)
  static func set(_ l: NSTextField, _ text: String, size: CGFloat = 12, weight: NSFont.Weight = .regular, color: NSColor) {
    l.attributedStringValue = NSAttributedString(
      string: text, attributes: [.font: font(size, weight, mono: true), .foregroundColor: color])
  }

  /// 한 줄 글의 폭(글 칸의 좌우 여백 2pt씩 포함)
  static func width(_ l: NSTextField) -> CGFloat { ceil(l.attributedStringValue.size().width) + 5 }

  /// 티어 엠블럼(앱에 묶은 PNG, `Resources/Emblems`). `big`이면 64pt용
  static func emblem(_ id: String, big: Bool = false) -> NSImage? {
    guard let url = Bundle.main.url(forResource: id, withExtension: "png", subdirectory: big ? "Emblems/big" : "Emblems")
    else { return nil }
    return NSImage(contentsOf: url)
  }

  /// 사이트 다른 화면을 기본 브라우저로(창 안에서 사이트로 가지 않는다)
  static func openSite(_ path: String) { NSWorkspace.shared.open(Config.site(path)) }
}

/// 위가 0인 보기(사이트처럼 위에서 아래로 쌓는다). 바탕·테두리는 층 속성 대신 직접 그린다: 층 바탕 위에 놓인 글 칸은
/// 반투명 글 색(사이트 `text-white/60` 등)이 불투명하게 칠해졌다
class FlippedView: NSView {
  override var isFlipped: Bool { true }
  var fill: NSColor? { didSet { needsDisplay = true } }
  var radius: CGFloat = 0 { didSet { needsDisplay = true } }
  var border: NSColor? { didSet { needsDisplay = true } }

  override func draw(_ dirtyRect: NSRect) {
    NUI.drawBox(bounds, fill: fill, border: border, radius: radius)
  }
}

extension NUI {
  /// 둥근 상자 바탕·1pt 테두리
  static func drawBox(_ r: NSRect, fill: NSColor?, border: NSColor?, radius: CGFloat) {
    if let fill, fill.alphaComponent > 0 {
      fill.setFill()
      NSBezierPath(roundedRect: r, xRadius: radius, yRadius: radius).fill()
    }
    if let border {
      border.setStroke()
      let p = NSBezierPath(roundedRect: r.insetBy(dx: 0.5, dy: 0.5), xRadius: max(0, radius - 0.5), yRadius: max(0, radius - 0.5))
      p.lineWidth = 1
      p.stroke()
    }
  }
}

/// 누를 수 있는 글 칸(사이트의 단추·칩·링크). 바탕·테두리·글 색을 상태마다 준다
@MainActor
final class Chip: NSView {
  struct Look {
    var fill: NSColor = .clear
    var text: NSColor = .white
    var border: NSColor? = nil
    var radius: CGFloat = 4
    var size: CGFloat = 12
    var weight: NSFont.Weight = .regular
    var padX: CGFloat = 4
    var padY: CGFloat = 0
    var underline = false
  }

  let label: NSTextField
  var look: Look { didSet { apply() } }
  var action: (() -> Void)?
  var enabled = true { didSet { apply() } }
  /// 사이트 `aria-pressed`(시험·스크린샷에서 고른 것을 알아보기)
  var pressed = false
  /// 이름표(시험용, 사이트 `data-*` 대신)
  var tag2 = ""

  init(_ title: String, look: Look = Look(), action: (() -> Void)? = nil) {
    label = NUI.label(title, size: look.size, weight: look.weight, color: look.text)
    self.look = look
    self.action = action
    super.init(frame: .zero)
    addSubview(label)
    apply()
  }

  override func draw(_ dirtyRect: NSRect) {
    NUI.drawBox(bounds, fill: look.fill, border: look.border, radius: look.radius)
  }

  required init?(coder: NSCoder) { fatalError("코드로만 만든다") }

  var title: String {
    get { label.stringValue }
    set {
      label.stringValue = newValue
      apply()
    }
  }

  private func apply() {
    needsDisplay = true
    label.font = NUI.font(look.size, look.weight)
    let attrs: [NSAttributedString.Key: Any] = [
      .font: NUI.font(look.size, look.weight), .foregroundColor: look.text,
      .underlineStyle: look.underline ? NSUnderlineStyle.single.rawValue : 0,
    ]
    label.attributedStringValue = NSAttributedString(string: label.stringValue, attributes: attrs)
    alphaValue = enabled ? 1 : 0.4
    needsLayout = true
  }

  /// 글에 맞는 크기(안쪽 여백 포함)
  var fit: NSSize {
    // 글 칸의 좌우 여백(2pt씩)은 안쪽 여백 안에 넣는다
    NSSize(width: NUI.width(label) - 4 + look.padX * 2, height: ceil(look.size * 1.34) + look.padY * 2)
  }

  override func layout() {
    super.layout()
    let w = NUI.width(label)
    let h = ceil(label.intrinsicContentSize.height)
    label.frame = NSRect(x: (bounds.width - w) / 2, y: (bounds.height - h) / 2, width: w, height: h)
  }

  override var isFlipped: Bool { true }
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  override func mouseDown(with event: NSEvent) {}
  override func mouseUp(with event: NSEvent) {
    guard enabled, bounds.contains(convert(event.locationInWindow, from: nil)) else { return }
    action?()
  }
  override func resetCursorRects() {
    if enabled, action != nil { addCursorRect(bounds, cursor: .pointingHand) }
  }
}

/// 네이티브 보통 창 하나(제목 막대 있는 창). 닫으면 놓아준다
@MainActor
class NativeSheetWindow: NSObject, NSWindowDelegate {
  let window: NSWindow
  var onClose: (() -> Void)?

  init(title: String, size: NSSize, content: NSView) {
    window = NSWindow(
      contentRect: NSRect(origin: .zero, size: size), styleMask: [.titled, .closable, .resizable, .miniaturizable],
      backing: .buffered, defer: false)
    super.init()
    window.title = title
    window.contentView = content
    window.isReleasedWhenClosed = false
    window.delegate = self
    window.appearance = NSAppearance(named: .darkAqua)
    window.center()
  }

  func windowWillClose(_ notification: Notification) { onClose?() }
  func windowDidBecomeKey(_ notification: Notification) { becameKey() }
  /// 창이 다시 앞에 왔다(사이트 화면의 `focus` 다시 읽기)
  func becameKey() {}
}
