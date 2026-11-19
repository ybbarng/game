import AppKit
import CubieCore

/// 메뉴 막대 메뉴 맨 위 프로필 칸(docs/47 15-20): 왼쪽 동그란 사진, 가운데 이름과 티어 글, 오른쪽 지금 크기의 티어 엠블럼.
/// - 사진이 없으면(지금은 늘) 무채색 사람 모양. 나중에 로그인이 생기면 웹이 보낸 사진을 동그랗게 잘라 그린다.
/// - 엠블럼은 웹이 사이트와 같은 그림을 PNG로 그려 보낸 것(`Profile.emblem`). 티어가 없으면 비운다.
/// - 누르면 「기록 보기」. 메뉴 항목에 뷰를 달면 맥이 강조·누르기를 대신 해 주지 않아 직접 그리고 받는다.
/// - 색은 모두 시스템의 의미 색(글자·보조 글자·강조)이라 다크·라이트 메뉴를 따라간다.
/// - 엠블럼은 메뉴가 열린 동안 천천히 좌우로 흔든다(docs/52 5-11, 티어표 진열과 같은 9초 왕복). 앱에 묶은 13각 띠
///   (`Emblems/sway/<티어>-menu.webp`)에서 이웃한 두 장을 두 층에 겹쳐 둔다(`MenuEmblemView`, 칸을 다시 그리지 않고 층 그림과
///   투명도만 바꾼다). 메뉴가 닫히면(창에서 떨어지면) 멈추고, 동작 줄이기면 정면 그림 그대로다.
final class ProfileMenuView: NSView {
  private let profile: Profile
  private let onPick: () -> Void
  private var hovering = false
  /// 흔드는 엠블럼(앱에 묶은 띠가 있을 때)
  private let swayView: MenuEmblemView?
  private var sway = TierShowcase.Sway.from(0)
  private var timer: Timer?
  private var last: CFTimeInterval = 0
  /// 재기·시험: 지금 흔드는지
  var swaying: Bool { timer != nil }

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
    swayView = MainActor.assumeIsolated {
      guard let id = profile.emblemTier, let strip = EmblemArt.menuStrip(id).flatMap(EmblemArt.decode) else { return nil }
      return MenuEmblemView(strip: strip, gain: EmblemArt.hdrMenuGain(id).flatMap(EmblemArt.decode))
    }
    let textW = max(
      Self.text(profile.name, size: 13, weight: .semibold).size().width,
      profile.tierText.map { Self.text($0, size: 11, weight: .regular).size().width } ?? 0)
    let w = max(240, Self.side + Self.photo + 10 + ceil(textW) + 12 + Self.emblem + Self.side)
    super.init(frame: NSRect(x: 0, y: 0, width: w, height: Self.height))
    autoresizingMask = [.width]
    if let swayView {
      addSubview(swayView)
      swayView.frame = emblemRect
      swayView.autoresizingMask = [.minXMargin]
    }
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
    // 메뉴가 뜬 화면이 HDR이면 반짝임을 흰색보다 밝게(docs/52 5-16)
    if let swayView, let id = profile.emblemTier, window != nil {
      MainActor.assumeIsolated { swayView.useHdr(EmblemArt.hdrOn(tier: id, screen: window?.screen)) }
    }
    updateSway()
  }

  /// 메뉴가 열려 있고(창에 붙어 있고) 동작 줄이기가 아니면 흔든다. 메뉴는 따로 도는 고리(event tracking)라 .common에 둔다
  private func updateSway() {
    let move = MainActor.assumeIsolated { window != nil && swayView != nil && !ShowcaseMotion.reduce }
    if move, timer == nil {
      sway = .from(0)
      last = CACurrentMediaTime()
      let t = Timer(timeInterval: 1.0 / 20, repeats: true) { [weak self] _ in
        MainActor.assumeIsolated {
          guard let self else { return }
          // 메뉴가 닫혔는데 창에서 떨어지지 않았으면(맥이 메뉴 창을 숨겨 두는 때) 여기서 멈춘다
          guard self.window?.isVisible == true else {
            self.timer?.invalidate()
            self.timer = nil
            return
          }
          let now = CACurrentMediaTime()
          self.sway = self.sway.step(min(100, (now - self.last) * 1000))
          self.last = now
          self.swayView?.yaw = self.sway.yaw
        }
      }
      RunLoop.main.add(t, forMode: .common)
      timer = t
    } else if !move, let t = timer {
      t.invalidate()
      timer = nil
      sway = .from(0)
      swayView?.yaw = 0
    }
  }

  /// 스크린샷: 흔들기 각을 정해 둔다
  func showYaw(_ yaw: Double) {
    sway = .from(yaw)
    swayView?.yaw = sway.yaw
  }

  private var emblemRect: NSRect {
    NSRect(x: bounds.width - Self.side - Self.emblem, y: (bounds.height - Self.emblem) / 2, width: Self.emblem, height: Self.emblem)
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
    if swayView != nil {
      // 흔드는 엠블럼은 위에 얹은 층(`MenuEmblemView`)이 보인다
    } else if let data = profile.emblem, let image = NSImage(data: data), image.size.width > 0 {
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

/// 메뉴 프로필 칸의 흔드는 엠블럼(32pt): 13각 띠에서 이웃한 두 장을 두 층에 두고 위 층 투명도로 사이 각을 메운다
@MainActor
final class MenuEmblemView: NSView, ShotPicture {
  private let sdrFrames: [CGImage]
  /// HDR 배율 지도 띠(보석 티어만). HDR 화면이면 처음 쓸 때 색 띠에 곱해 둔다(docs/52 5-16)
  private let gain: CGImage?
  private lazy var hdrFrames: [CGImage]? = {
    guard let gain, let strip, let h = EmblemArt.hdr(strip, gain: gain) else { return nil }
    return Self.split(h)
  }()
  private var strip: CGImage?
  private var frames: [CGImage]
  private let lo = CALayer()
  private let hi = CALayer()
  private var shown: (Int, Int, Double) = (-1, -1, -1)
  /// 지금 HDR 그림을 쓰는지
  private(set) var hdr = false

  private static func split(_ strip: CGImage) -> [CGImage] {
    let n = TierShowcase.menuFrames
    let w = strip.width / n
    return (0..<n).compactMap { strip.cropping(to: CGRect(x: w * $0, y: 0, width: w, height: strip.height)) }
  }

  init(strip: CGImage, gain: CGImage? = nil) {
    sdrFrames = Self.split(strip)
    frames = sdrFrames
    self.gain = gain
    self.strip = gain == nil ? nil : strip
    super.init(frame: .zero)
    wantsLayer = true
    for l in [lo, hi] {
      l.contentsGravity = .resizeAspect
      l.actions = ["contents": NSNull(), "opacity": NSNull(), "bounds": NSNull(), "position": NSNull()]
      layer?.addSublayer(l)
    }
    yaw = 0
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  override func layout() {
    super.layout()
    lo.frame = bounds
    hi.frame = bounds
  }

  /// HDR 그림으로 바꾸거나 되돌린다(배율 지도가 없는 티어는 늘 SDR)
  func useHdr(_ on: Bool) {
    let next = on ? hdrFrames : nil
    guard (next != nil) != hdr else { return }
    hdr = next != nil
    frames = next ?? sdrFrames
    EmblemArt.setHdr(lo, hdr)
    EmblemArt.setHdr(hi, hdr)
    shown = (-1, -1, -1)
    let y = yaw
    yaw = y
  }

  /// 흔들기 각(라디안)
  var yaw: Double = 0 {
    didSet {
      let f = TierShowcase.frames(yaw: yaw, count: frames.count)
      if f.lo == shown.0, f.hi == shown.1, abs(f.frac - shown.2) < 0.01 { return }
      CATransaction.begin()
      CATransaction.setDisableActions(true)
      if f.lo != shown.0 { lo.contents = frames[f.lo] }
      if f.hi != shown.1 { hi.contents = frames[f.hi] }
      hi.opacity = Float(f.frac)
      CATransaction.commit()
      shown = f
    }
  }

  /// 스크린샷: 두 장을 겹친 그림(64px)
  var shotImage: CGImage? {
    guard shown.0 >= 0, let a = frames[safe: shown.0], let b = frames[safe: shown.1] else { return nil }
    let w = a.width
    guard
      let ctx = CGContext(
        data: nil, width: w, height: a.height, bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { return nil }
    let r = CGRect(x: 0, y: 0, width: w, height: a.height)
    ctx.setAlpha(1 - shown.2)
    ctx.draw(a, in: r)
    ctx.setBlendMode(.plusLighter)
    ctx.setAlpha(shown.2)
    ctx.draw(b, in: r)
    return ctx.makeImage()
  }
  var shotCorner: CGFloat { 0 }
}

extension Array {
  fileprivate subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
