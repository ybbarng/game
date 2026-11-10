import AppKit
import CubieCore

/// 메뉴 막대 메뉴 맨 위 프로필 칸(docs/47 15-20): 왼쪽 동그란 사진, 가운데 이름과 티어 글, 오른쪽 지금 크기의 티어 엠블럼.
/// - 사진이 없으면(지금은 늘) 무채색 사람 모양. 나중에 로그인이 생기면 웹이 보낸 사진을 동그랗게 잘라 그린다.
/// - 엠블럼은 웹이 사이트와 같은 그림을 PNG로 그려 보낸 것(`Profile.emblem`). 티어가 없으면 비운다.
/// - 누르면 「기록 보기」. 메뉴 항목에 뷰를 달면 맥이 강조·누르기를 대신 해 주지 않아 직접 그리고 받는다.
/// - 색은 모두 시스템의 의미 색(글자·보조 글자·강조)이라 다크·라이트 메뉴를 따라간다.
final class ProfileMenuView: NSView {
  private let profile: Profile
  private let onPick: () -> Void
  private var hovering = false

  static let height: CGFloat = 52
  private static let side: CGFloat = 14
  private static let photo: CGFloat = 34
  /// 웹 `PROFILE_EMBLEM_PT`와 같은 너비
  private static let emblem: CGFloat = 32

  private var nameText: NSAttributedString { Self.text(profile.name, size: 13, weight: .semibold, highlighted: hovering) }
  private var tierText: NSAttributedString? {
    profile.tierText.map { Self.text($0, size: 11, weight: .regular, secondary: true, highlighted: hovering) }
  }

  init(profile: Profile, onPick: @escaping () -> Void) {
    self.profile = profile
    self.onPick = onPick
    let textW = max(
      Self.text(profile.name, size: 13, weight: .semibold).size().width,
      profile.tierText.map { Self.text($0, size: 11, weight: .regular).size().width } ?? 0)
    let w = max(240, Self.side + Self.photo + 10 + ceil(textW) + 12 + Self.emblem + Self.side)
    super.init(frame: NSRect(x: 0, y: 0, width: w, height: Self.height))
    autoresizingMask = [.width]
    setAccessibilityElement(true)
    setAccessibilityRole(.menuItem)
    setAccessibilityLabel([profile.name, profile.tierText].compactMap { $0 }.joined(separator: ", "))
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  private static func text(
    _ s: String, size: CGFloat, weight: NSFont.Weight, secondary: Bool = false, highlighted: Bool = false
  ) -> NSAttributedString {
    let color: NSColor =
      highlighted ? .selectedMenuItemTextColor : secondary ? .secondaryLabelColor : .labelColor
    let style = NSMutableParagraphStyle()
    style.lineBreakMode = .byTruncatingTail
    return NSAttributedString(
      string: s,
      attributes: [.font: NSFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color, .paragraphStyle: style])
  }

  override func updateTrackingAreas() {
    super.updateTrackingAreas()
    for a in trackingAreas { removeTrackingArea(a) }
    addTrackingArea(
      NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self))
  }

  override func mouseEntered(with event: NSEvent) { setHover(true) }
  override func mouseExited(with event: NSEvent) { setHover(false) }
  override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()
    // 메뉴를 다시 열면 강조 없이 시작한다
    if window == nil { hovering = false }
  }

  private func setHover(_ on: Bool) {
    guard hovering != on else { return }
    hovering = on
    needsDisplay = true
  }

  override func mouseUp(with event: NSEvent) {
    guard bounds.contains(convert(event.locationInWindow, from: nil)) else { return }
    enclosingMenuItem?.menu?.cancelTracking()
    // 메뉴가 닫힌 뒤에 창을 연다(닫히는 중에 연 창은 앞으로 오지 않을 때가 있다)
    DispatchQueue.main.async { [onPick] in onPick() }
  }

  override func draw(_ dirtyRect: NSRect) {
    let b = bounds
    if hovering {
      // 맥 메뉴의 강조와 같은 모양(양옆 5pt 들인 둥근 사각형)
      NSColor.selectedContentBackgroundColor.setFill()
      NSBezierPath(roundedRect: b.insetBy(dx: 5, dy: 1), xRadius: 4, yRadius: 4).fill()
    }

    // 사진
    let p = NSRect(x: Self.side, y: (b.height - Self.photo) / 2, width: Self.photo, height: Self.photo)
    if let data = profile.photo, let image = NSImage(data: data) {
      NSGraphicsContext.saveGraphicsState()
      NSBezierPath(ovalIn: p).addClip()
      image.draw(in: p)
      NSGraphicsContext.restoreGraphicsState()
    } else {
      drawPlaceholderPhoto(in: p)
    }

    // 엠블럼(오른쪽)
    let ex = b.width - Self.side - Self.emblem
    if let data = profile.emblem, let image = NSImage(data: data), image.size.width > 0 {
      let h = Self.emblem * image.size.height / image.size.width
      image.draw(
        in: NSRect(x: ex, y: (b.height - h) / 2, width: Self.emblem, height: h), from: .zero, operation: .sourceOver,
        fraction: 1, respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
    }

    // 이름과 티어 글
    let tx = p.maxX + 10
    let tw = ex - 12 - tx
    let name = nameText
    let tier = tierText
    let nh = name.size().height
    let th = tier?.size().height ?? 0
    let gap: CGFloat = tier == nil ? 0 : 1
    let top = (b.height + nh + gap + th) / 2
    name.draw(with: NSRect(x: tx, y: top - nh, width: tw, height: nh), options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine])
    tier?.draw(
      with: NSRect(x: tx, y: top - nh - gap - th, width: tw, height: th),
      options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine])
  }

  /// 무채색 동그라미 안 사람 모양(머리와 어깨)
  private func drawPlaceholderPhoto(in r: NSRect) {
    let base: NSColor = hovering ? .selectedMenuItemTextColor : .secondaryLabelColor
    base.withAlphaComponent(hovering ? 0.35 : 0.25).setFill()
    NSBezierPath(ovalIn: r).fill()
    NSGraphicsContext.saveGraphicsState()
    NSBezierPath(ovalIn: r).addClip()
    base.withAlphaComponent(hovering ? 0.9 : 0.7).setFill()
    let head = r.width * 0.36
    NSBezierPath(ovalIn: NSRect(x: r.midX - head / 2, y: r.minY + r.height * 0.5, width: head, height: head)).fill()
    let body = r.width * 0.72
    NSBezierPath(ovalIn: NSRect(x: r.midX - body / 2, y: r.minY - body * 0.42, width: body, height: body * 0.85))
      .fill()
    NSGraphicsContext.restoreGraphicsState()
  }
}
