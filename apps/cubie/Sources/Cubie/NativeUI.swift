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

  /// 여러 줄 글(낱말 단위로 끊는다, 사이트 `break-keep`. 숫자와 단위는 갈라 끊지 않는다)
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
    // 낱말 단위 줄바꿈도 숫자와 바로 붙은 한글(「5판」)은 끊을 수 있는 자리로 봐서 막는다(`TextWrap`)
    return NSAttributedString(
      string: TextWrap.keepNumberUnits(text),
      attributes: [.font: font(size, weight, mono: true), .foregroundColor: color, .paragraphStyle: p])
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

  /// 넓은 상자는 그리지 않고 층 속성(바탕·모서리·테두리)으로 둔다. 넓은 칸을 그리면 AppKit이 GPU 비동기 그리기로 돌려 앱에
  /// Metal 문맥과 드라이버 메모리 100MB 넘게가 붙었다(티어표 진열 큰 칸, docs/52 5-11). 화면 밖 스크린샷(`cacheDisplay`)은
  /// 그대로 `draw`를 부른다
  var layerDrawn = false {
    didSet {
      wantsLayer = true
      needsDisplay = true
    }
  }
  override var wantsUpdateLayer: Bool { layerDrawn }
  override func updateLayer() {
    guard let layer else { return }
    layer.backgroundColor = fill?.cgColor
    layer.cornerRadius = radius
    layer.borderColor = border?.cgColor
    layer.borderWidth = border == nil ? 0 : 1
  }
}

/// 문서 보기를 늘 내용 폭(스크롤 막대 몫을 뺀 `contentView` 폭)에 맞추는 스크롤 보기. 막대가 내용 폭을 차지하는 꼴(macOS
/// 「스크롤 막대 보기: 항상」·마우스를 이은 맥)에서 막대가 생기거나 사라지면(내용이 길어짐·설정이 바뀜·창 크기) AppKit이
/// `tile()`로 내용 칸을 다시 나누는데, 문서 보기는 폭만 바뀌고 다시 배치되지 않아 오른쪽 끝이 막대 밑에 가려졌다(2026-11-20
/// 기록 창 「다시 보기」, 티어표·설정 창 오른쪽 여백). 여기서 폭을 맞추고 폭이 바뀌면 다시 배치한다
@MainActor
final class ContentScrollView: NSScrollView {
  /// 문서 보기 폭을 여기서 맞추나(기록 창처럼 바깥이 줄 폭을 직접 셈하면 끄고 `onTile`로 다시 배치한다)
  var fitsDocumentWidth = true
  /// 내용 칸을 다시 나눈 뒤(막대가 생기거나 사라짐·막대 꼴이 바뀜·크기)
  var onTile: (() -> Void)?
  private var laidWidth: CGFloat = -1

  /// 지금 막대 꼴에서 세로 막대가 차지하는 폭(겹치는 막대는 0)
  var scrollerWidth: CGFloat {
    NSScroller.scrollerWidth(for: verticalScroller?.controlSize ?? .regular, scrollerStyle: scrollerStyle)
  }

  override func tile() {
    super.tile()
    if fitsDocumentWidth, let doc = documentView {
      let w = contentView.bounds.width
      if abs(doc.frame.width - w) > 0.5 { doc.setFrameSize(NSSize(width: w, height: doc.frame.height)) }
      if abs(w - laidWidth) > 0.5 {
        laidWidth = w
        doc.needsLayout = true
        // 문서 보기 자신의 `layout()` 안에서 막대가 생기면(높이를 정해 `tile()`) 위 표시가 그 `layout()`이 끝날 때 지워진다.
        // 다음 차례에 표시를 다시 걸고 배치한다
        DispatchQueue.main.async { [weak doc] in
          doc?.needsLayout = true
          doc?.layoutSubtreeIfNeeded()
        }
      }
    }
    onTile?()
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
    // 손쉬운 사용: 누를 수 있는 칩은 단추, 이름은 제목(사이트 `<button>`). 글 칸은 따로 읽히지 않게 칩 하나로 읽는다
    setAccessibilityElement(true)
    label.setAccessibilityElement(false)
    if !title.isEmpty { setAccessibilityLabel(title) }
  }

  override func draw(_ dirtyRect: NSRect) {
    NUI.drawBox(bounds, fill: look.fill, border: look.border, radius: look.radius)
  }

  /// 누를 수 있으면(동작이 있고 켜져 있으면) 단추, 아니면 글(배지)
  private var pressable: Bool { action != nil && enabled }
  override func accessibilityRole() -> NSAccessibility.Role? { action != nil ? .button : .staticText }
  override func isAccessibilityEnabled() -> Bool { enabled }
  override func accessibilityPerformPress() -> Bool {
    guard pressable else { return false }
    action?()
    return true
  }

  // 키보드: Tab으로 오고 Space·Return·숫자판 Enter로 누른다(티어 사다리 칸 `LadderCellView`와 같은 방식)
  override var acceptsFirstResponder: Bool { pressable && !isHiddenOrHasHiddenAncestor }
  override var canBecomeKeyView: Bool { pressable && !isHiddenOrHasHiddenAncestor }
  override func keyDown(with event: NSEvent) {
    if pressable, Self.pressKeys.contains(event.keyCode) { action?() } else { super.keyDown(with: event) }
  }
  /// Space(49)·Return(36)·숫자판 Enter(76)
  static let pressKeys: Set<UInt16> = [49, 36, 76]
  override var focusRingMaskBounds: NSRect { bounds }
  override func drawFocusRingMask() {
    NSBezierPath(roundedRect: bounds, xRadius: look.radius, yRadius: look.radius).fill()
  }

  required init?(coder: NSCoder) { fatalError("코드로만 만든다") }

  var title: String {
    get { label.stringValue }
    set {
      label.stringValue = newValue
      setAccessibilityLabel(newValue)
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

extension SheetSize {
  var initial: NSSize { NSSize(width: width, height: height) }
  var minimum: NSSize { NSSize(width: minWidth, height: minHeight) }
}

/// 네이티브 보통 창 하나(제목 막대 있는 창). 닫으면 놓아준다
@MainActor
class NativeSheetWindow: NSObject, NSWindowDelegate {
  let window: NSWindow
  var onClose: (() -> Void)?

  /// 크기는 처음 크기와 가장 작은 크기를 함께 받는다(`SheetSize`). 가장 작은 크기보다 줄이면 칸 글이 잘리거나 겹친다
  /// (docs/52 5-8 「창 최소 크기」)
  init(title: String, size: SheetSize, content: NSView) {
    window = NSWindow(
      contentRect: NSRect(origin: .zero, size: size.initial), styleMask: [.titled, .closable, .resizable, .miniaturizable],
      backing: .buffered, defer: false)
    super.init()
    window.contentMinSize = size.minimum
    window.title = title
    window.contentView = content
    window.isReleasedWhenClosed = false
    window.delegate = self
    window.appearance = NSAppearance(named: .darkAqua)
    // Tab 차례를 칸이 바뀔 때마다 다시 셈한다(칩·티어 칸을 창이 새로 만든다)
    window.autorecalculatesKeyViewLoop = true
    window.center()
  }

  func windowWillClose(_ notification: Notification) {
    NativeSheetWindow.releaseAutosave(window)
    onClose?()
  }

  /// 닫는 창의 크기·자리를 저장하고 이름을 놓는다(같은 이름은 살아 있는 창 하나만 가질 수 있어, 다시 연 창이 이어받게)
  static func releaseAutosave(_ w: NSWindow) {
    let name = w.frameAutosaveName
    guard !name.isEmpty else { return }
    w.saveFrame(usingName: name)
    w.setFrameAutosaveName("")
  }
  func windowDidBecomeKey(_ notification: Notification) { becameKey() }
  /// 창이 다시 앞에 왔다(사이트 화면의 `focus` 다시 읽기)
  func becameKey() {}
}
