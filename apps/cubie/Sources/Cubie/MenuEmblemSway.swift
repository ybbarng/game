import AppKit
import CubieCore

/// 메뉴 프로필 칸 엠블럼 흔들기(docs/52 5-11, 티어표 진열과 같은 9초 왕복): 앱에 묶은 13각 띠(`Emblems/sway/<티어>-menu.webp`)
/// 에서 이웃한 두 장을 두 층에 겹쳐 둔다(`MenuEmblemView`, 칸을 다시 그리지 않고 층 그림과 투명도만 바꾼다). 메뉴가 열린
/// 동안만 흔들고, 닫히면(창에서 떨어지면) 멈춘다. 동작 줄이기면 정면 그림 그대로다. HDR 화면의 보석 티어는 반짝임을 흰색보다
/// 밝게(docs/52 5-16). `ProfileMenuView`는 이 파일을 모르고 `ProfileEmblemSway` 약속만 본다(README 그림은 흔들기 없이 그
/// 칸만 컴파일한다, `scripts/readme-shots.mjs`)
@MainActor
final class MenuEmblemSway: ProfileEmblemSway {
  private let emblem: MenuEmblemView
  private let tier: String
  private var sway = TierShowcase.Sway.from(0)
  private var timer: Timer?
  private var last: CFTimeInterval = 0
  private var stats = SwayStats(name: "menu")
  private weak var window: NSWindow?
  /// HDR을 정했는지와 그때의 화면(메뉴 창이 다른 화면에 놓이면 다시 정한다)
  private var hdrDecided = false
  private var hdrScreen: ObjectIdentifier?

  var view: NSView { emblem }
  var swaying: Bool { timer != nil }

  /// 그 티어의 띠가 앱에 있으면 흔들기, 없으면(티어 없음) nil
  static func make(_ profile: Profile) -> MenuEmblemSway? {
    guard let id = profile.emblemTier, let strip = EmblemArt.menuStrip(id).flatMap(EmblemArt.decode) else { return nil }
    return MenuEmblemSway(
      tier: id, emblem: MenuEmblemView(strip: strip, gain: EmblemArt.hdrMenuGain(id).flatMap(EmblemArt.decode)))
  }

  private init(tier: String, emblem: MenuEmblemView) {
    self.tier = tier
    self.emblem = emblem
  }

  func attached(to window: NSWindow?) {
    self.window = window
    hdrDecided = false
    refreshHdr()
    update()
  }

  func showYaw(_ yaw: Double) {
    sway = .from(yaw)
    emblem.yaw = sway.yaw
  }

  /// 메뉴가 뜬 화면이 HDR이면 반짝임을 흰색보다 밝게. 메뉴 창이 붙은 뒤에야 화면에 놓일 수 있어 흔드는 동안에도 화면이
  /// 바뀌었는지만 본다(바뀌지 않으면 아무것도 하지 않는다)
  private func refreshHdr() {
    guard let window else { return }
    let screen = window.screen.map(ObjectIdentifier.init)
    guard !hdrDecided || screen != hdrScreen else { return }
    hdrDecided = true
    hdrScreen = screen
    emblem.useHdr(EmblemArt.hdrOn(tier: tier, screen: window.screen))
  }

  /// 메뉴가 열려 있고(창에 붙어 있고) 동작 줄이기가 아니면 흔든다. 메뉴는 따로 도는 고리(event tracking)라 .common에 둔다
  private func update() {
    let move = window != nil && !ShowcaseMotion.reduce
    if move, timer == nil {
      sway = .from(0)
      last = CACurrentMediaTime()
      let t = Timer(timeInterval: 1.0 / 20, repeats: true) { [weak self] _ in
        MainActor.assumeIsolated { self?.tick() }
      }
      RunLoop.main.add(t, forMode: .common)
      timer = t
    } else if !move, let t = timer {
      t.invalidate()
      timer = nil
      sway = .from(0)
      emblem.yaw = 0
    }
  }

  private func tick() {
    // 메뉴가 닫혔는데 창에서 떨어지지 않았으면(맥이 메뉴 창을 숨겨 두는 때) 여기서 멈춘다
    guard window?.isVisible == true else {
      timer?.invalidate()
      timer = nil
      return
    }
    refreshHdr()
    let now = CACurrentMediaTime()
    sway = sway.step(min(100, (now - last) * 1000))
    last = now
    let t0 = CACurrentMediaTime()
    emblem.yaw = sway.yaw
    stats.add((CACurrentMediaTime() - t0) * 1000, hdr: emblem.hdr)
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
