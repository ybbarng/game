import Accelerate
import AppKit
import CubieCore
import ImageIO
import QuartzCore

/// 티어표 창 진열(docs/52 5-11, 사이트 `TierShowcase.tsx`·docs/47 14-7 「진열」): 위쪽 큰 칸(내 티어 엠블럼을 천천히 좌우로 흔들고
/// 다음 티어까지 줄일 시간)과 열 티어 사다리. 무엇을 보일지는 `CubieCore.TierShowcase`가 정한다.
///
/// 앱은 3D를 띄우지 않는다. 사이트 3D가 그리는 장을 좌우 각마다 미리 찍은 그림을 넘긴다.
/// - 큰 칸: 21장(±0.5 라디안) 가운데 이웃한 두 장을 겹쳐 사이 각을 메운다. 지금 보이는 장만 풀어 둔다(작은 기억 4장).
///   흔들기는 초당 20번 각을 셈해 층 그림·투명도만 바꾸고, 그 사이 투명도는 합성기가 잇는다.
/// - 사다리: 사이트 진열 칸 그림(17각 띠)을 그대로 묶는다. 쉬는 칸은 정면 한 장만 두고, 흔드는 칸 하나만 띠를 풀어
///   `contentsRect`를 3초 동안 넘긴다(합성기가 넘긴다, 앱은 3초에 한 번 칸을 바꾼다).
/// - 창이 보이지 않거나(가려짐·내림·닫힘) 동작 줄이기 설정이면 모두 멈춘다.
@MainActor
enum EmblemArt {
  /// 그림 파일 → 다 푼 그림(그릴 때 다시 풀지 않게)
  static func decode(_ url: URL) -> CGImage? {
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(src, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary)
  }

  static func swayFrame(_ id: String, _ i: Int) -> URL? {
    Bundle.main.url(
      forResource: String(format: "%02d", i), withExtension: "webp", subdirectory: "Emblems/sway/\(id)")
  }

  static func menuStrip(_ id: String) -> URL? {
    Bundle.main.url(forResource: "\(id)-menu", withExtension: "webp", subdirectory: "Emblems/sway")
  }

  static func ladderStrip(_ id: String) -> URL? {
    Bundle.main.url(forResource: id, withExtension: "webp", subdirectory: "Emblems/ladder")
  }

  // MARK: HDR(docs/52 5-16)

  /// 큰 칸 그림 `i`번과 같은 각의 HDR 배율 지도(보석 티어만)
  static func hdrGain(_ id: String, _ i: Int) -> URL? {
    Bundle.main.url(forResource: String(format: "%02d", i), withExtension: "webp", subdirectory: "Emblems/hdr/\(id)")
  }

  /// 메뉴 띠와 같은 각들의 HDR 배율 지도 띠(보석 티어만)
  static func hdrMenuGain(_ id: String) -> URL? {
    Bundle.main.url(forResource: "\(id)-menu", withExtension: "webp", subdirectory: "Emblems/hdr")
  }

  /// 숨은 강제 설정: 환경 변수 `CUBIE_EMBLEM_HDR`, 없으면 `defaults write kr.byb.cubie emblemHdr off|on`
  static var hdrForce: Bool? {
    EmblemHdr.force(
      ProcessInfo.processInfo.environment["CUBIE_EMBLEM_HDR"] ?? UserDefaults.standard.string(forKey: "emblemHdr"))
  }

  /// 이 티어를 이 화면에서 HDR로 그리는지(화면이 흰색보다 밝게 낼 수 있을 때, `EmblemHdr.use`)
  static func hdrOn(tier: String, screen: NSScreen?) -> Bool {
    let room = (screen ?? NSScreen.main)?.maximumPotentialExtendedDynamicRangeColorComponentValue ?? 1
    return EmblemHdr.use(tier: tier, screenHeadroom: Double(room), force: hdrForce)
  }

  /// 색 그림(SDR)에 같은 크기 배율 지도를 곱한 HDR 그림: 선형 sRGB 확장 범위, 반 정밀도 실수, 흰색의 `EmblemHdr.headroom`배까지
  /// (`CGImageCreateWithContentHeadroom`). 크기가 다르거나 만들지 못하면 nil(그때는 SDR 그대로 쓴다)
  static func hdr(_ color: CGImage, gain: CGImage) -> CGImage? { EmblemHdr.image(color: color, gain: gain) }

  /// 층이 흰색보다 밝은 그림을 그대로 내보내게(꺼면 SDR로 자른다). macOS 26부터 `preferredDynamicRange`, 그 앞은
  /// `wantsExtendedDynamicRangeContent`
  static func setHdr(_ layer: CALayer, _ on: Bool) {
    if #available(macOS 26.0, *) {
      layer.preferredDynamicRange = on ? .high : .standard
    } else {
      layer.wantsExtendedDynamicRangeContent = on
    }
  }

  private static let space = CGColorSpace(name: CGColorSpace.sRGB)!
  private static let bitmap = CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue

  /// 그림의 한 부분을 따로 떼어 낸 새 그림(원래 그림을 붙잡지 않는다). `dim`이면 CSS `filter`처럼 밝기·채도를 바꾼다
  static func copy(_ img: CGImage, rect: CGRect? = nil, dim: TierShowcase.Dim? = nil) -> CGImage? {
    let r = rect ?? CGRect(x: 0, y: 0, width: img.width, height: img.height)
    let w = Int(r.width)
    let h = Int(r.height)
    guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: space, bitmapInfo: bitmap)
    else { return nil }
    // CGContext는 아래가 0: 띠의 r 부분이 이 칸에 오게 옮긴다
    ctx.draw(img, in: CGRect(x: -r.minX, y: -(CGFloat(img.height) - r.maxY), width: CGFloat(img.width), height: CGFloat(img.height)))
    if let dim, let data = ctx.data {
      // 메모리 차례는 B G R A(알파 곱한 값, 선형 변환이라 그대로 곱한다). vImage는 화소를 행 벡터로 보고 행렬을 오른쪽에서
      // 곱한다: 나오는 채널 j = Σ 들어온 채널 i × m[i·4 + j] / 256
      let M = dim.matrix  // 행: 나오는 R·G·B, 열: 들어온 R·G·B
      let mem = [2, 1, 0]  // R·G·B의 메모리 자리
      var m = [Int16](repeating: 0, count: 16)
      for out in 0..<3 {
        for inp in 0..<3 { m[mem[inp] * 4 + mem[out]] = Int16((M[out][inp] * 256).rounded()) }
      }
      m[3 * 4 + 3] = 256
      var buf = vImage_Buffer(data: data, height: vImagePixelCount(h), width: vImagePixelCount(w), rowBytes: w * 4)
      vImageMatrixMultiply_ARGB8888(&buf, &buf, m, 256, nil, nil, vImage_Flags(kvImageNoFlags))
    }
    return ctx.makeImage()
  }
}

/// 진열을 움직여도 되는지: 창이 보이고(재기 모드는 화면 밖 창도 보이는 것으로), 동작 줄이기가 아닐 때
@MainActor
enum ShowcaseMotion {
  /// 재기 명령 `tiers hidden 1`: 창이 가려진 것처럼(멈추는지 CPU로 확인)
  static var hidden = false {
    didSet { NotificationCenter.default.post(name: changed, object: nil) }
  }
  static let changed = Notification.Name("CubieShowcaseMotion")
  static var reduce: Bool { NSWorkspace.shared.accessibilityDisplayShouldReduceMotion || Config.reduceMotion }

  static func visible(_ w: NSWindow?) -> Bool {
    guard let w, w.isVisible, !w.isMiniaturized, !hidden else { return false }
    return Config.measure || w.occlusionState.contains(.visible)
  }
}

/// 창 보임·동작 줄이기가 바뀌면 부르는 작은 감시(진열 칸들이 함께 쓴다)
@MainActor
final class MotionWatch {
  private var tokens: [NSObjectProtocol] = []
  private var workspace: NSObjectProtocol?

  func watch(_ window: NSWindow?, _ fire: @escaping @MainActor () -> Void) {
    stop()
    let run: @Sendable (Notification) -> Void = { _ in MainActor.assumeIsolated { fire() } }
    let c = NotificationCenter.default
    if let window {
      for n in [
        NSWindow.didChangeOcclusionStateNotification, NSWindow.didMiniaturizeNotification,
        NSWindow.didDeminiaturizeNotification, NSWindow.willCloseNotification,
      ] {
        tokens.append(c.addObserver(forName: n, object: window, queue: .main, using: run))
      }
    }
    tokens.append(c.addObserver(forName: ShowcaseMotion.changed, object: nil, queue: .main, using: run))
    workspace = NSWorkspace.shared.notificationCenter.addObserver(
      forName: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil, queue: .main, using: run)
    // 보기는 창이 화면에 나오기 전에 붙는다. 처음 나올 때 알림이 오지 않는 때(재기 모드의 화면 밖 창)가 있어, 처음 나올
    // 때까지만 잠깐씩 다시 본다(가려진 창은 이미 「나온」 창이라 다시 보지 않는다)
    waitShown(window, fire)
  }

  private func waitShown(_ window: NSWindow?, _ fire: @escaping @MainActor () -> Void) {
    guard let window, !window.isVisible else { return }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self, weak window] in
      MainActor.assumeIsolated {
        guard let self, let window, !self.tokens.isEmpty else { return }
        if window.isVisible { fire() } else { self.waitShown(window, fire) }
      }
    }
  }

  func stop() {
    tokens.forEach { NotificationCenter.default.removeObserver($0) }
    tokens = []
    if let workspace { NSWorkspace.shared.notificationCenter.removeObserver(workspace) }
    workspace = nil
  }
}

/// 창이 다른 화면으로 옮겨지거나 화면 설정(HDR 켜고 끔 등)이 바뀌면 부르는 감시(HDR로 그릴지 다시 정한다)
@MainActor
final class ScreenWatch {
  private var tokens: [NSObjectProtocol] = []

  func watch(_ window: NSWindow?, _ fire: @escaping @MainActor () -> Void) {
    stop()
    let run: @Sendable (Notification) -> Void = { _ in MainActor.assumeIsolated { fire() } }
    let c = NotificationCenter.default
    if let window {
      tokens.append(c.addObserver(forName: NSWindow.didChangeScreenNotification, object: window, queue: .main, using: run))
    }
    tokens.append(
      c.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main, using: run))
  }

  func stop() {
    tokens.forEach { NotificationCenter.default.removeObserver($0) }
    tokens = []
  }
}

/// 화면 밖 스크린샷(`NativeWindowShot`)이 층 그림을 얹을 때 쓴다(층 그림은 보기 그리기에 들지 않는다)
@MainActor
protocol ShotPicture: NSView {
  var shotImage: CGImage? { get }
  var shotCorner: CGFloat { get }
}

// MARK: - 위쪽 큰 칸

/// 큰 칸 엠블럼(280pt): 미리 찍은 21장을 넘겨 천천히 좌우로 흔든다. 끌면 따라 돌고(그림이 덮는 ±0.5 라디안 안),
/// 놓고 1.6초 뒤 그 각에서 다시 흔든다. 동작 줄이기면 흔들지 않고 끈 각에 남으며 「처음 각도로」 단추가 뜬다
@MainActor
final class EmblemSwayView: NSView, ShotPicture {
  private let lo = CALayer()
  private let hi = CALayer()
  private(set) var tier = -1
  private var locked = false
  private var cache: [Int: CGImage] = [:]
  private var order: [Int] = []
  private var sway = TierShowcase.Sway.from(0)
  private(set) var yaw = 0.0
  private var shown: (Int, Int, Double) = (-1, -1, -1)
  private var timer: Timer?
  private var last: CFTimeInterval = 0
  private var drag: (x: CGFloat, yaw: Double)?
  private var resumeAt: CFTimeInterval?
  private var homing: (from: Double, start: CFTimeInterval)?
  private let watch = MotionWatch()
  private let screens = ScreenWatch()
  /// HDR 화면의 보석 티어면 그림마다 배율 지도를 곱해 반짝임을 흰색보다 밝게 그린다(docs/52 5-16)
  private(set) var hdr = false
  private let home = Chip(
    "처음 각도로",
    look: Chip.Look(fill: NSColor(white: 0, alpha: 0.6), text: NUI.white(0.85), radius: 8, size: 12, padX: 10, padY: 4))
  /// 시험·재기에서 지금 흔드는지
  var swaying: Bool { timer != nil && drag == nil && homing == nil }

  override init(frame: NSRect) {
    super.init(frame: frame)
    wantsLayer = true
    layer?.backgroundColor = NUI.color(NUI.Hex.neutral900).cgColor
    layer?.cornerRadius = 16
    layer?.masksToBounds = true
    for l in [lo, hi] {
      l.contentsGravity = .resize
      l.actions = ["contents": NSNull(), "opacity": NSNull(), "bounds": NSNull(), "position": NSNull()]
      layer?.addSublayer(l)
    }
    home.action = { [weak self] in self?.goHome() }
    home.isHidden = true
    addSubview(home)
    setAccessibilityElement(true)
    setAccessibilityRole(.image)
  }

  required init?(coder: NSCoder) { fatalError("코드로만 만든다") }

  override var isFlipped: Bool { true }

  override func layout() {
    super.layout()
    lo.frame = bounds
    hi.frame = bounds
    let f = home.fit
    home.frame = NSRect(x: bounds.width - f.width - 8, y: bounds.height - f.height - 8, width: f.width, height: f.height)
  }

  /// 티어를 바꾼다. 바뀌면 정면에서 다시 흔든다(사이트: 새 3D 칸이 정면에서 시작, 그 사이 200ms 겹쳐 바뀜)
  func show(tier t: Int, locked l: Bool, label: String) {
    setAccessibilityLabel(label)
    guard t != tier || l != locked else { return }
    let first = tier < 0
    tier = t
    locked = l
    cache = [:]
    order = []
    sway = .from(0)
    yaw = 0
    drag = nil
    resumeAt = nil
    homing = nil
    shown = (-1, -1, -1)
    setHdr(wantsHdr)
    let before = lo.contents
    render()
    if !first, let before { crossfade(lo, from: before) }
    update()
  }

  /// 그림을 200ms 동안 겹쳐 바꾼다(사이트: 새 3D 칸이 200ms 겹쳐 뜬다). `CATransition`은 쓰지 않는다: 바꾸기 전 모습을 앱
  /// 안에서 찍어 두므로 화면 밖 칸에서도 앱이 GPU 문맥을 띄울 수 있다. 그림끼리 겹치기는 합성기가 한다
  static func crossfade(_ layer: CALayer, from old: Any, duration: Double = 0.2) {
    let a = CABasicAnimation(keyPath: "contents")
    a.fromValue = old
    a.toValue = layer.contents
    a.duration = duration
    layer.add(a, forKey: "crossfade")
  }

  private func crossfade(_ layer: CALayer, from old: Any) { Self.crossfade(layer, from: old) }

  private func image(_ i: Int) -> CGImage? {
    if let c = cache[i] {
      order.removeAll { $0 == i }
      order.append(i)
      return c
    }
    let id = TierInfo.ids[min(max(tier, 0), 9)]
    guard let url = EmblemArt.swayFrame(id, i), var img = EmblemArt.decode(url) else { return nil }
    if locked, let d = EmblemArt.copy(img, dim: TierShowcase.locked) { img = d }
    if hdr, let g = EmblemArt.hdrGain(id, i).flatMap(EmblemArt.decode), let h = EmblemArt.hdr(img, gain: g) { img = h }
    cache[i] = img
    order.append(i)
    // 이웃한 두 장과 다음에 올 장만 둔다(560px 한 장이 1.2MB)
    while order.count > 4 { cache[order.removeFirst()] = nil }
    return img
  }

  /// 흔들기 시계 간격(초). 사이의 투명도는 합성기가 이어 준다(`render(smooth:)`)
  static let tick = 1.0 / 20

  /// `smooth`면 같은 두 장 사이의 투명도 바뀜을 시계 한 칸 동안 합성기가 고르게 잇는다(앱은 초당 20번만 깨어난다)
  private func render(smooth: Bool = false) {
    let f = TierShowcase.frames(yaw: yaw, count: TierShowcase.heroFrames)
    if f.lo == shown.0, f.hi == shown.1, abs(f.frac - shown.2) < 0.004 { return }
    let same = f.lo == shown.0 && f.hi == shown.1
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    if f.lo != shown.0 { lo.contents = image(f.lo) }
    if f.hi != shown.1 { hi.contents = image(f.hi) }
    if smooth, same {
      let a = CABasicAnimation(keyPath: "opacity")
      a.fromValue = hi.presentation()?.opacity ?? hi.opacity
      a.toValue = Float(f.frac)
      a.duration = Self.tick
      hi.add(a, forKey: "opacity")
    } else {
      hi.removeAnimation(forKey: "opacity")
    }
    hi.opacity = Float(f.frac)
    CATransaction.commit()
    shown = f
    home.isHidden = !(ShowcaseMotion.reduce && abs(yaw) > 1e-3 && homing == nil)
  }

  var shotImage: CGImage? { lo.contents.map { $0 as! CGImage } }
  var shotCorner: CGFloat { 16 }

  override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()
    watch.watch(window) { [weak self] in self?.update() }
    screens.watch(window) { [weak self] in self?.refreshHdr() }
    refreshHdr()
    update()
  }

  /// 잠긴(어둡게 한) 칸은 SDR 그대로. 사이트도 HDR은 보석 티어만이고 잠김은 기록 없는 아이언뿐이다
  private var wantsHdr: Bool {
    tier >= 0 && !locked && EmblemArt.hdrOn(tier: TierInfo.ids[min(tier, 9)], screen: window?.screen)
  }

  private func setHdr(_ on: Bool) {
    hdr = on
    EmblemArt.setHdr(lo, on)
    EmblemArt.setHdr(hi, on)
  }

  /// 화면이 바뀌어 HDR 여부가 달라지면 그림을 다시 푼다
  private func refreshHdr() {
    let on = wantsHdr
    guard on != hdr else { return }
    setHdr(on)
    cache = [:]
    order = []
    shown = (-1, -1, -1)
    render()
  }

  /// 흔들기 시계를 켤지 끌지 정한다
  func update() {
    let move = ShowcaseMotion.visible(window) && (homing != nil || (!ShowcaseMotion.reduce && drag == nil))
    if move, timer == nil {
      last = CACurrentMediaTime()
      let t = Timer(timeInterval: Self.tick, repeats: true) { [weak self] _ in
        MainActor.assumeIsolated {
          guard let self else { return }
          self.tick()
        }
      }
      RunLoop.main.add(t, forMode: .common)
      timer = t
    } else if !move, let t = timer {
      t.invalidate()
      timer = nil
    }
    home.isHidden = !(ShowcaseMotion.reduce && abs(yaw) > 1e-3 && homing == nil)
  }

  private func tick() {
    let now = CACurrentMediaTime()
    let dt = min(100, (now - last) * 1000)
    last = now
    if let h = homing {
      let u = (now - h.start) * 1000 / TierShowcase.homeMs
      yaw = TierShowcase.homeYaw(from: h.from, u: u)
      if u >= 1 {
        homing = nil
        sway = .from(yaw)
      }
      render()
      update()
      return
    }
    if let r = resumeAt {
      guard now >= r else { return }
      resumeAt = nil
      sway = .from(yaw)
    }
    sway = sway.step(dt)
    yaw = sway.yaw
    render(smooth: true)
  }

  private func goHome() {
    homing = (yaw, CACurrentMediaTime())
    update()
  }

  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

  override func mouseDown(with event: NSEvent) {
    drag = (convert(event.locationInWindow, from: nil).x, yaw)
    homing = nil
    resumeAt = nil
    update()
  }

  override func mouseDragged(with event: NSEvent) {
    guard let d = drag else { return }
    let x = convert(event.locationInWindow, from: nil).x
    yaw = TierShowcase.dragYaw(start: d.yaw, dx: Double(x - d.x), width: Double(bounds.width))
    render()
  }

  override func mouseUp(with event: NSEvent) {
    guard drag != nil else { return }
    drag = nil
    // 놓고 잠시 그 각에 둔 뒤 다시 흔든다(동작 줄이기면 그 각에 남는다)
    resumeAt = CACurrentMediaTime() + TierShowcase.swayResume / 1000
    update()
  }

  override func resetCursorRects() { addCursorRect(bounds, cursor: .openHand) }
}

/// 구간 표시(사이트 `DivisionPips`): 마름모 넷 가운데 켜진 개수(IV 하나 … I 넷)
@MainActor
final class DivisionPipsView: NSView {
  var tier = 0 { didSet { needsDisplay = true } }
  var count = 0 { didSet { needsDisplay = true } }

  /// 티어마다 켜진 마름모 색과 테두리(사이트 `TierEmblem` `PALETTE` accent·dark)
  static let accent: [UInt32] = [
    0xc3c8cf, 0xf3bc8a, 0xffffff, 0xfff1a8, 0xd6fff6, 0xb9ffd9, 0xe8f7ff, 0xf6d8ff, 0xffd0d0, 0xffe27a,
  ]
  static let dark: [UInt32] = [
    0x16181b, 0x2a1608, 0x1f232a, 0x3a2500, 0x0a2c2a, 0x022818, 0x0a2246, 0x22073a, 0x330407, 0x0a1a40,
  ]

  override var isFlipped: Bool { true }

  override func draw(_ dirtyRect: NSRect) {
    // 사이트 viewBox 0 0 64 10
    let k = bounds.width / 64
    for i in 0..<4 {
      let x = (32 + (Double(i) - 1.5) * 9) * k
      let p = NSBezierPath()
      p.move(to: NSPoint(x: x, y: 1.6 * k))
      p.line(to: NSPoint(x: x + 3.2 * k, y: 5 * k))
      p.line(to: NSPoint(x: x, y: 8.4 * k))
      p.line(to: NSPoint(x: x - 3.2 * k, y: 5 * k))
      p.close()
      let on = i < count
      (on ? NUI.color(Self.accent[tier]) : NUI.white(0.16)).setFill()
      p.fill()
      if on {
        NUI.color(Self.dark[tier]).setStroke()
        p.lineWidth = 0.6 * k
        p.stroke()
      }
    }
  }
}

// MARK: - 사다리

/// 사다리 칸 하나(사이트 `TierLadder` 단추): 칸 그림, 이름, 그 티어에 드는 시간. 누르면(Space·Return도) 고른다
@MainActor
final class LadderCellView: NSView, ShotPicture {
  let tier: Int
  let art = CALayer()
  private let name: NSTextField
  private let cut = NUI.label("", size: 12, color: NUI.white(0.45))
  var onPick: ((Int) -> Void)?
  var onHover: (() -> Void)?
  private(set) var hovering = false
  /// 정면 한 장(제 밝기·쉬는 밝기)
  var front: (on: CGImage?, rest: CGImage?) = (nil, nil) { didSet { applyArt(fade: false) } }
  var viewing = false {
    didSet {
      guard viewing != oldValue else { return }
      // 흔드는 띠는 밝기를 이미 정해 두었으니 정면 한 장으로 돌아가 새 밝기로
      endSweep()
      applyArt(fade: true)
    }
  }
  var mine = false
  /// 흔드는 중인 띠(쉬는 동안은 nil)
  private(set) var sweeping = false

  static let pad: CGFloat = 6
  static var height: CGFloat { pad + CGFloat(TierShowcase.ladderSize) + 4 + 20 + 4 + 16 + 4 }

  init(tier: Int) {
    self.tier = tier
    name = NUI.label(TierSheet.labels[tier], size: 14, weight: .semibold, color: NUI.color(NUI.tierTone[tier]), mono: false)
    super.init(frame: .zero)
    wantsLayer = true
    art.cornerRadius = 12
    art.masksToBounds = true
    art.contentsGravity = .resize
    art.backgroundColor = NUI.color(NUI.Hex.neutral900).cgColor
    art.actions = ["contents": NSNull(), "contentsRect": NSNull(), "bounds": NSNull(), "position": NSNull()]
    layer?.addSublayer(art)
    name.alignment = .center
    cut.alignment = .center
    addSubview(name)
    addSubview(cut)
    setAccessibilityElement(true)
    setAccessibilityRole(.button)
    setAccessibilityLabel(TierSheet.labels[tier])
  }

  required init?(coder: NSCoder) { fatalError("코드로만 만든다") }

  override var isFlipped: Bool { true }

  func setCut(_ text: String) {
    // 가운데 맞춤은 글 꼴 안에 둔다(글 꼴째 넣으면 칸의 맞춤을 잃는다)
    let p = NSMutableParagraphStyle()
    p.alignment = .center
    cut.attributedStringValue = NSAttributedString(
      string: text, attributes: [.font: NUI.font(12, mono: true), .foregroundColor: NUI.white(0.45), .paragraphStyle: p])
  }

  override func layout() {
    super.layout()
    let s = CGFloat(TierShowcase.ladderSize)
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    art.frame = NSRect(x: (bounds.width - s) / 2, y: Self.pad, width: s, height: s)
    CATransaction.commit()
    name.frame = NSRect(x: 0, y: Self.pad + s + 4, width: bounds.width, height: 20)
    cut.frame = NSRect(x: 0, y: Self.pad + s + 28, width: bounds.width, height: 16)
  }

  private func applyArt(fade: Bool) {
    if sweeping { return }
    let before = art.contents
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    art.contents = viewing ? front.on : front.rest
    art.contentsRect = CGRect(x: 0, y: 0, width: 1, height: 1)
    CATransaction.commit()
    // 사이트 `transition-[filter] duration-200`(그림끼리 겹쳐 바꾸기, `EmblemSwayView.crossfade`)
    if fade, let before, window != nil { EmblemSwayView.crossfade(art, from: before) }
  }

  /// 띠 하나로 3초 동안 한 번 좌우로 흔든다(사이트 `cube-ladder-sweep`의 그 칸 차례). 끝나면 정면 한 장으로
  func sweep(strip: CGImage) {
    sweeping = true
    let n = CGFloat(TierShowcase.ladderFrames)
    func rect(_ f: Int) -> CGRect { CGRect(x: CGFloat(f) / n, y: 0, width: 1 / n, height: 1) }
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    art.contents = strip
    art.contentsRect = rect((TierShowcase.ladderFrames - 1) / 2)
    CATransaction.commit()
    let a = CAKeyframeAnimation(keyPath: "contentsRect")
    a.values = (0...TierShowcase.ladderSteps).map { NSValue(rect: rect(TierShowcase.ladderFrame(step: $0))) }
    a.keyTimes = (0...TierShowcase.ladderSteps).map { NSNumber(value: Double($0) / Double(TierShowcase.ladderSteps)) }
    a.calculationMode = .discrete
    a.duration = TierShowcase.ladderSweepMs / 1000
    art.add(a, forKey: "sweep")
  }

  func endSweep() {
    guard sweeping else { return }
    art.removeAnimation(forKey: "sweep")
    sweeping = false
    applyArt(fade: false)
  }

  var shotImage: CGImage? { viewing ? front.on : front.rest }
  var shotCorner: CGFloat { 12 }
  /// 스크린샷에서 그림을 얹을 자리(칸 안)
  var artRect: NSRect { art.frame }

  // 누르기(마우스를 올리면 살짝 떠오르기만)
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  override func mouseDown(with event: NSEvent) {}
  override func mouseUp(with event: NSEvent) {
    guard bounds.contains(convert(event.locationInWindow, from: nil)) else { return }
    onPick?(tier)
  }
  override var acceptsFirstResponder: Bool { true }
  override var canBecomeKeyView: Bool { true }
  override func keyDown(with event: NSEvent) {
    // Space(49)·Return(36)·숫자판 Enter(76)
    if [49, 36, 76].contains(event.keyCode) { onPick?(tier) } else { super.keyDown(with: event) }
  }
  override func becomeFirstResponder() -> Bool {
    needsDisplay = true
    return true
  }
  override func resignFirstResponder() -> Bool {
    needsDisplay = true
    return true
  }
  override var focusRingMaskBounds: NSRect { bounds }
  override func drawFocusRingMask() { NSBezierPath(roundedRect: bounds, xRadius: 12, yRadius: 12).fill() }

  override func updateTrackingAreas() {
    super.updateTrackingAreas()
    for a in trackingAreas { removeTrackingArea(a) }
    addTrackingArea(NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self))
  }
  override func mouseEntered(with event: NSEvent) { setHover(true) }
  override func mouseExited(with event: NSEvent) { setHover(false) }
  private func setHover(_ on: Bool) {
    guard hovering != on else { return }
    hovering = on
    onHover?()
  }
  override func resetCursorRects() { addCursorRect(bounds, cursor: .pointingHand) }
}

/// 열 티어 사다리(사이트 `TierLadder`): 위 줄 보석 다섯, 아래 줄 금속 다섯, 한 줄 안에서도 오른쪽으로 갈수록 10pt씩 높다.
/// 보고 있는 칸 테두리·빛과 내 칸 배경 판은 이 보기가 칸 뒤에 그린다(칸 밖으로 번지는 빛까지)
@MainActor
final class TierLadderView: NSView {
  /// 칸 둘레 빛이 잘리지 않게 둘레에 두는 여백
  static let bleed: CGFloat = 26
  static let gap: CGFloat = 12
  static let step: CGFloat = 10
  private(set) var cells: [LadderCellView] = []
  var onPick: ((Int) -> Void)?
  private var timer: Timer?
  private var sweepIndex = 0
  private var sweepingCell: LadderCellView?
  private let watch = MotionWatch()
  private var loaded = false

  /// 보고 있는 칸 테두리 색(사이트 `ladderRing.ts` `TIER_RING`)
  static let ring: [UInt32] = [
    0xd6d3d1, 0xfb923c, 0xf1f5f9, 0xfacc15, 0x2dd4bf, 0x10b981, 0x38bdf8, 0xe879f9, 0xf43f5e, 0xfbbf24,
  ]

  override init(frame: NSRect) {
    super.init(frame: frame)
    wantsLayer = true
    for t in 0..<10 {
      let c = LadderCellView(tier: t)
      c.onPick = { [weak self] t in self?.onPick?(t) }
      c.onHover = { [weak self] in
        self?.needsLayout = true
        self?.needsDisplay = true
      }
      cells.append(c)
      addSubview(c)
    }
    setAccessibilityElement(true)
    setAccessibilityRole(.group)
    setAccessibilityLabel(TierShowcase.ladderLabel)
  }

  required init?(coder: NSCoder) { fatalError("코드로만 만든다") }

  override var isFlipped: Bool { true }

  /// 사다리 높이(둘레 여백 빼고): 두 줄, 줄마다 칸 + 계단 40
  static var contentHeight: CGFloat { 2 * (LadderCellView.height + 4 * step) + gap }

  func show(_ state: TierShowcase.State) {
    loadFronts()
    for c in state.cells {
      let v = cells[c.tier]
      v.mine = c.mine
      v.viewing = c.viewing
      v.setCut(c.cut)
      v.setAccessibilityValue(c.viewing ? "보는 중" : nil)
    }
    needsDisplay = true
  }

  /// 칸마다 정면 한 장(띠의 가운데 장)을 떼어 둔다. 띠는 버린다
  private func loadFronts() {
    guard !loaded else { return }
    loaded = true
    let n = TierShowcase.ladderFrames
    for c in cells {
      // 띠(3808×224)를 푼 큰 임시 그림을 칸마다 바로 놓는다(열 장을 한꺼번에 쥐고 있지 않게)
      autoreleasepool {
        guard let url = EmblemArt.ladderStrip(TierInfo.ids[c.tier]), let strip = EmblemArt.decode(url) else { return }
        let w = strip.width / n
        let r = CGRect(x: w * ((n - 1) / 2), y: 0, width: w, height: strip.height)
        c.front = (EmblemArt.copy(strip, rect: r), EmblemArt.copy(strip, rect: r, dim: TierShowcase.rest))
      }
    }
  }

  override func layout() {
    super.layout()
    let b = Self.bleed
    let w = bounds.width - b * 2
    let colW = (w - Self.gap * 4) / 5
    let rowH = LadderCellView.height + 4 * Self.step
    // 위 줄 보석(5…9), 아래 줄 금속(0…4)
    for (r, row) in [Array(5..<10), Array(0..<5)].enumerated() {
      for (j, t) in row.enumerated() {
        let c = cells[t]
        let lift: CGFloat = c.hovering ? 2 : 0
        let y = b + CGFloat(r) * (rowH + Self.gap) + (4 - CGFloat(j)) * Self.step - lift
        c.frame = NSRect(x: b + CGFloat(j) * (colW + Self.gap), y: y, width: colW, height: LadderCellView.height)
      }
    }
    placeMarks()
  }

  // 칸 뒤 표시(내 칸 배경 판·떠오르기 그림자·보고 있는 칸 테두리와 빛)는 화면에서는 층으로 둔다. 이 넓은 보기를 그리면 AppKit이
  // GPU 비동기 그리기로 돌려 앱에 Metal 문맥과 드라이버 메모리 100MB 넘게가 붙었다(docs/52 5-11). `draw`는 화면 밖
  // 스크린샷(`cacheDisplay`)만 쓴다
  override var wantsUpdateLayer: Bool { true }
  private var marks: [(plate: CALayer, shade: CALayer, ring: CALayer)] = []

  override func updateLayer() { placeMarks() }

  /// 칸마다 배경 판·그림자·테두리 층을 칸 자리에 맞춘다(칸 층들 아래)
  private func placeMarks() {
    guard let root = layer else { return }
    if marks.isEmpty {
      for _ in cells {
        let m = (plate: CALayer(), shade: CALayer(), ring: CALayer())
        for l in [m.shade, m.plate, m.ring] {
          l.actions = ["position": NSNull(), "bounds": NSNull(), "hidden": NSNull(), "backgroundColor": NSNull()]
          root.insertSublayer(l, at: 0)
        }
        marks.append(m)
      }
    }
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    for (c, m) in zip(cells, marks) {
      let r = c.frame
      // 내 칸: 아래 구간 표의 내 줄과 같은 밝은 배경 판(사이트 `MINE_BG` bg-white/10), 마우스를 올린 다른 칸은 bg-white/5
      m.plate.frame = r
      m.plate.cornerRadius = 12
      m.plate.backgroundColor = c.mine ? NUI.white(0.1).cgColor : c.hovering ? NUI.white(0.05).cgColor : nil
      // 떠오르기 그림자(사이트 hover:shadow-lg shadow-black/50), 칸 밖으로만
      outerShadow(m.shade, around: r, inset: 0, radius: 12, color: .black, opacity: c.hovering ? 0.5 : 0, blur: 6, dy: 6)
      // 보고 있는 칸: 티어 색 3px 테두리 + 같은 모양의 바깥 빛(0 0 20px 3px 색 60%), 칸 안쪽은 칠하지 않는다
      let col = NUI.color(Self.ring[c.tier])
      outerShadow(m.ring, around: r, inset: -3, radius: 15, color: col, opacity: c.viewing ? 0.6 : 0, blur: 10, dy: 0)
      m.ring.backgroundColor = c.viewing ? col.cgColor : nil
    }
    CATransaction.commit()
  }

  /// `around`를 `inset`만큼 넓힌 둥근 판(칠한 색은 `ring.backgroundColor`)과 그 바깥 그림자. 칸 안쪽은 가린다
  private func outerShadow(
    _ l: CALayer, around r: NSRect, inset: CGFloat, radius: CGFloat, color: NSColor, opacity: Float, blur: CGFloat, dy: CGFloat
  ) {
    let pad: CGFloat = 40
    let outer = r.insetBy(dx: inset, dy: inset)
    l.frame = outer
    l.cornerRadius = radius
    l.shadowColor = color.cgColor
    l.shadowOpacity = opacity
    l.shadowRadius = blur
    l.shadowOffset = CGSize(width: 0, height: dy)
    l.shadowPath = CGPath(
      roundedRect: CGRect(origin: .zero, size: outer.size), cornerWidth: radius, cornerHeight: radius, transform: nil)
    l.backgroundColor = opacity > 0 && inset == 0 ? NSColor.black.cgColor : l.backgroundColor
    // 칸 자리(둥근 12)는 가린다: 바깥 큰 사각형에서 칸 모양을 뺀 가리개
    let mask = (l.mask as? CAShapeLayer) ?? CAShapeLayer()
    mask.fillRule = .evenOdd
    let path = CGMutablePath()
    path.addRect(CGRect(x: -pad, y: -pad, width: outer.width + pad * 2, height: outer.height + pad * 2))
    path.addRoundedRect(
      in: CGRect(x: r.minX - outer.minX, y: r.minY - outer.minY, width: r.width, height: r.height), cornerWidth: 12,
      cornerHeight: 12)
    mask.path = path
    mask.frame = CGRect(origin: .zero, size: outer.size)
    l.mask = mask
    l.isHidden = opacity == 0
  }

  override func draw(_ dirtyRect: NSRect) {
    for c in cells {
      let r = c.frame
      let box = NSBezierPath(roundedRect: r, xRadius: 12, yRadius: 12)
      if c.mine {
        // 내 칸: 아래 구간 표의 내 줄과 같은 밝은 배경 판(사이트 `MINE_BG` bg-white/10)
        NUI.white(0.1).setFill()
        box.fill()
      } else if c.hovering {
        NUI.white(0.05).setFill()
        box.fill()
      }
      if c.hovering {
        // 떠오르기 그림자(사이트 hover:shadow-lg shadow-black/50)
        NSGraphicsContext.saveGraphicsState()
        let s = NSShadow()
        s.shadowColor = NSColor(white: 0, alpha: 0.5)
        s.shadowBlurRadius = 12
        s.shadowOffset = NSSize(width: 0, height: -6)
        s.set()
        let clip = NSBezierPath(rect: bounds)
        clip.append(box.reversed)
        clip.addClip()
        NSColor.black.setFill()
        box.fill()
        NSGraphicsContext.restoreGraphicsState()
      }
      guard c.viewing else { continue }
      // 보고 있는 칸: 티어 색 3px 테두리(0 0 0 3px) + 같은 모양의 바깥 빛(0 0 20px 3px 색 60%). 칸 안쪽은 칠하지 않는다
      let col = NUI.color(Self.ring[c.tier])
      NSGraphicsContext.saveGraphicsState()
      let clip = NSBezierPath(rect: bounds)
      clip.append(box.reversed)
      clip.addClip()
      let glow = NSShadow()
      glow.shadowColor = col.withAlphaComponent(0.6)
      glow.shadowBlurRadius = 20
      glow.shadowOffset = .zero
      glow.set()
      col.setFill()
      NSBezierPath(roundedRect: r.insetBy(dx: -3, dy: -3), xRadius: 15, yRadius: 15).fill()
      NSGraphicsContext.restoreGraphicsState()
    }
  }

  override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()
    watch.watch(window) { [weak self] in self?.update() }
    update()
  }

  /// 칸 흔들기 시계를 켤지 끌지 정한다. 멈추면 흔들던 칸은 정면으로
  func update() {
    let move = ShowcaseMotion.visible(window) && !ShowcaseMotion.reduce
    if move, timer == nil {
      nextSweep()
      let t = Timer(timeInterval: TierShowcase.ladderSweepMs / 1000, repeats: true) { [weak self] _ in
        MainActor.assumeIsolated {
          guard let self else { return }
          self.nextSweep()
        }
      }
      RunLoop.main.add(t, forMode: .common)
      timer = t
    } else if !move, let t = timer {
      t.invalidate()
      timer = nil
      sweepingCell?.endSweep()
      sweepingCell = nil
    }
  }

  /// 다음 칸을 흔든다(아래 티어부터 차례로, 한 번에 한 칸)
  private func nextSweep() {
    sweepingCell?.endSweep()
    let c = cells[TierShowcase.ladderCell(at: Double(sweepIndex) * TierShowcase.ladderSweepMs)]
    sweepIndex += 1
    guard let url = EmblemArt.ladderStrip(TierInfo.ids[c.tier]), let raw = EmblemArt.decode(url) else { return }
    let strip = c.viewing ? raw : (EmblemArt.copy(raw, dim: TierShowcase.rest) ?? raw)
    c.sweep(strip: strip)
    sweepingCell = c
  }
}
