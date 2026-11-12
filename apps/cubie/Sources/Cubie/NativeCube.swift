import AppKit
import CubieCore
import CubieNativeC
import QuartzCore

/// 네이티브 큐브 화면(docs/52 5-5·5-6): Rust 코어 한 판(C ABI)이 키를 수로 바꾸고, 큐브는 Core Animation 층
/// 트리(`CATransformLayer` + `CALayer`)로 그린다. 돌리기는 `CABasicAnimation`이라 합성기(WindowServer)가 그리고, 앱은 수마다
/// 층 몇 개를 옮기고 칸 색만 바꾼다. 앱 프로세스는 GPU로 그리기를 보내지 않아 드라이버 몫(약 108MB, 5-3)이 붙지 않는다.
///
/// 층 차례(바깥 → 안):
/// - 축하(`cheerLayer`, 평평한 층): 다 맞춘 순간 빛 고리와 시간 숫자(사이트 `SolveCheer.tsx`)
/// - 윤곽 겹 다섯(3D가 아닌 평평한 층): 바깥은 어두운 흐린 그림자, 안쪽 넷은 흐림 없는 흰 그림자를 오른쪽·왼쪽·아래·위로
///   민 것(사이트 `outlineFilter`와 같은 꼴). 그림자는 3D 층(`CATransformLayer`)에 걸지 않는다(무시되고 경고가 난다).
/// - 무대(`stage`): `sublayerTransform`에 원근(m34 = −1/P)
/// - 세계(`world`, 3D): 카메라 행렬(`CubeGeometry.sceneMatrix`). 거울 판 셋과 한 바퀴 층(`spin`)을 담는다
/// - 큐브(`cube`, 3D) → 조각(3D, 늘 제자리) → 겉면(검은 몸통 판) → 스티커(둥근 사각형, 색 + 미리 그린 광택 그림 하나를 함께 씀)
/// - 거울 판(평평한 층) 안에는 큐브 스티커를 한 벌씩 더 두고 판 평면으로 누른다(`mirrorFlatten`). 돌리는 동안 그 판의
///   스티커도 같은 애니메이션으로 따라 돈다(사이트 CSS 3D 장면과 같은 방식). 판을 보는 쪽을 등진 스티커는 뒷면이라 보이지 않는다.
///
/// 수 하나: 그 층 조각을 돌림 층에 옮겨 돌림 층을 돌리고(속이 드러나는 자르는 면에는 검은 판 두 장), 끝나면 조각을 제자리로
/// 돌려놓고 칸 색을 코어의 화면 상태로 다시 칠한다. 조각은 늘 제자리라 행렬 오차가 쌓이지 않는다. 가만히 있을 때는 아무것도
/// 하지 않는다(타이머·화면 갱신 없음).
@MainActor
final class CACubeView: NSView {
  static let body = cg(0x0d0d0f)
  /// 거울 판 칸은 조금 어둡게(사이트 `MIRROR_TINT`)
  static let mirrorTint: CGFloat = 0.86
  /// 사이트 윤곽 값(`apps/web/src/cube/mini/backdrop.ts` `OUTLINE`)
  static let rim: Float = 0.55
  static let rimWidth: CGFloat = 0.005
  static let rimWidthMin: CGFloat = 1
  static let shade: Float = 0.55
  static let shadeBlur: CGFloat = 0.022
  /// 살짝 보기 각도(사이트 `PEEK`)
  static let peekBack = (yaw: 212.0, pitch: 26.0)
  static let peekDown = (yaw: 32.0, pitch: -55.0)

  nonisolated(unsafe) let game: OpaquePointer
  let n: Int
  /// 면 색(U R F D L B, 설정 `colors`)
  private(set) var colors: [UInt32] = CubeSettings.standard
  var stickerless = false
  /// 동작 줄이기(시스템 설정): 거울 페이드·축하를 줄인다
  var reducedMotion = false
  /// 스티커 자리마다 조각 중심(두 배 좌표)과 면 방향(코어 차례)
  private var slots: [(pos2: [Int], normal: [Int])] = []
  /// 지금 칠한 색(자리마다)
  private var painted: [UInt8]

  // 층
  private var rims: [CALayer] = []
  private let stage = CALayer()
  private let world = CATransformLayer()
  private let spinLayer = CATransformLayer()
  private let cube = CATransformLayer()
  private let cheerLayer = CALayer()
  private var pieces: [(pos2: [Int], layer: CATransformLayer)] = []
  /// 자리마다 스티커 층
  private var stickerLayers: [CALayer] = []
  private var panelLayers: [CALayer] = []
  /// 판마다 누른 큐브(조각 층과 자리마다 스티커 층)
  private var mirrorCubes: [CATransformLayer] = []
  private var mirrorPieces: [[CATransformLayer]] = []
  private var mirrorStickers: [[CALayer]] = []
  private var panels: [CubeGeometry.MirrorPanel] = []
  private var unit: CGFloat = 0
  private var builtSize: CGSize = .zero

  private struct Running {
    let id: Int
    let pivots: [CATransformLayer]
    let members: [Int]
    let cuts: [CALayer]
  }
  private var running: Running?
  private var nextID = 0
  private var spinPaint: DispatchWorkItem?

  /// 거울 판을 보일지(창이 정한다: 켜 둠·포커스·섞인 큐브·창 크기, 사이트 `mirror.ts`)
  private(set) var mirrorShown = false
  /// 살짝 보기 중인 각(없으면 기본 각)
  private var peek: (yaw: Double, pitch: Double)?

  /// 시작한 돌리기 애니메이션 수(재기·확인용)
  private(set) var turnsStarted = 0
  /// 키 누름을 창이 다룬다(기록·소리·힌트). 없으면 바로 코어로
  var onKeyDown: ((NSEvent) -> Bool)?
  var onKeyUp: ((NSEvent) -> Void)?
  /// 크기가 바뀌어 층을 다시 만들었다(누르는 자리를 다시 알린다)
  var onLayout: (() -> Void)?

  /// 광택 그림(스티커가 모두 함께 쓴다. 한 번만 그린다): 왼쪽 위 옅은 흰 빛 → 투명 → 오른쪽 아래 옅은 그늘(사이트 CSS 3D와 같은 띠)
  static let gloss: CGImage? = {
    let s = 32
    guard
      let ctx = CGContext(
        data: nil, width: s, height: s, bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { return nil }
    let colors = [
      CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 0.16), CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 0),
      CGColor(srgbRed: 0, green: 0, blue: 0, alpha: 0.1),
    ]
    guard
      let g = CGGradient(
        colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: colors as CFArray, locations: [0, 0.55, 1])
    else { return nil }
    // 층 좌표는 y가 위: 왼쪽 위(0, s) → 오른쪽 아래(s, 0)
    ctx.drawLinearGradient(g, start: CGPoint(x: 0, y: s), end: CGPoint(x: s, y: 0), options: [])
    return ctx.makeImage()
  }()

  static func cg(_ hex: UInt32, _ tint: CGFloat = 1) -> CGColor {
    CGColor(
      srgbRed: CGFloat((hex >> 16) & 0xff) / 255 * tint, green: CGFloat((hex >> 8) & 0xff) / 255 * tint,
      blue: CGFloat(hex & 0xff) / 255 * tint, alpha: 1)
  }

  init(frame: NSRect, n: Int = 3) {
    game = cubie_game_new(UInt32(n))
    self.n = Int(cubie_game_size(game))
    let count = Int(cubie_game_sticker_count(game))
    painted = [UInt8](repeating: 255, count: count)
    super.init(frame: frame)
    for i in 0..<count {
      var p = [Int32](repeating: 0, count: 3)
      var nrm = [Int32](repeating: 0, count: 3)
      _ = cubie_game_sticker_slot(game, UInt32(i), &p, &nrm)
      slots.append((p.map(Int.init), nrm.map(Int.init)))
    }
    wantsLayer = true
    layerContentsRedrawPolicy = .never
  }

  required init?(coder: NSCoder) { fatalError("코드로만 만든다") }

  deinit { cubie_game_free(game) }

  override func makeBackingLayer() -> CALayer {
    let l = CALayer()
    l.isOpaque = false
    l.backgroundColor = .clear
    return l
  }

  override var acceptsFirstResponder: Bool { true }
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  override var mouseDownCanMoveWindow: Bool { false }

  override func layout() {
    super.layout()
    if bounds.size != builtSize { build() }
  }

  override func setFrameSize(_ newSize: NSSize) {
    super.setFrameSize(newSize)
    needsLayout = true
  }

  override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()
    needsLayout = true
  }

  // MARK: 설정

  func setColors(_ c: [UInt32]) {
    guard c.count == 6, c != colors else { return }
    colors = c
    painted = painted.map { _ in 255 }
    paintShown()
  }

  func setMoveMs(_ ms: Double) { cubie_game_set_move_ms(game, ms) }

  // MARK: 층 만들기

  /// 층 트리를 (다시) 만든다. 한 칸 = `unit` pt(원근 거리 ÷ 큐브 거리라 바라보는 점 근처가 1:1)
  private func build() {
    guard let root = layer, bounds.width > 1, bounds.height > 1 else { return }
    stopRunning()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    builtSize = bounds.size
    let w = Double(bounds.width)
    let h = Double(bounds.height)
    let p = CubeGeometry.perspective(height: h)
    unit = CGFloat(p / CubeGeometry.cubeDist(n: n, aspect: w / h))
    root.sublayers?.forEach { $0.removeFromSuperlayer() }

    // 윤곽 겹: 바깥(어두운 그림자) → 안(흰 선 넷) → 무대
    let side = min(bounds.width, bounds.height)
    let d = max(Self.rimWidthMin, side * Self.rimWidth)
    let shadeRadius = max(0.5, side * Self.shadeBlur) / 2
    var parent = root
    rims = []
    let specs: [(CGColor, Float, CGSize, CGFloat)] = [
      (.black, Self.shade, .zero, shadeRadius),
      (.white, Self.rim, CGSize(width: 0, height: -d), 0),
      (.white, Self.rim, CGSize(width: 0, height: d), 0),
      (.white, Self.rim, CGSize(width: -d, height: 0), 0),
      (.white, Self.rim, CGSize(width: d, height: 0), 0),
    ]
    for (color, opacity, offset, radius) in specs {
      let l = CALayer()
      l.frame = root.bounds
      l.shadowColor = color
      l.shadowOpacity = opacity
      l.shadowOffset = offset
      l.shadowRadius = radius
      parent.addSublayer(l)
      rims.append(l)
      parent = l
    }
    stage.frame = root.bounds
    stage.transform = CATransform3DIdentity
    var persp = CATransform3DIdentity
    persp.m34 = -1 / CGFloat(p)
    stage.sublayerTransform = persp
    parent.addSublayer(stage)
    cheerLayer.frame = root.bounds
    cheerLayer.sublayers?.forEach { $0.removeFromSuperlayer() }
    root.addSublayer(cheerLayer)

    for l in [world, spinLayer, cube] as [CALayer] {
      l.sublayers?.forEach { $0.removeFromSuperlayer() }
      l.bounds = .zero
      l.position = .zero
    }
    world.position = CGPoint(x: root.bounds.midX, y: root.bounds.midY)
    stage.addSublayer(world)
    world.addSublayer(spinLayer)
    spinLayer.addSublayer(cube)

    buildPieces()
    panels = CubeGeometry.mirrorPanels(n: n)
    buildPanels()
    painted = painted.map { _ in 255 }
    paintShown()
    applyCamera(animated: false)
    CATransaction.commit()
    onLayout?()
  }

  private func stickerLayer(size: CGFloat, radius: CGFloat) -> CALayer {
    let s = CALayer()
    s.bounds = CGRect(x: 0, y: 0, width: size, height: size)
    s.cornerRadius = radius
    s.masksToBounds = true
    s.contents = Self.gloss
    s.contentsGravity = .resize
    return s
  }

  private func buildPieces() {
    let u = unit
    let m = n - 1
    pieces = []
    stickerLayers = [CALayer](repeating: CALayer(), count: slots.count)
    var index: [String: Int] = [:]
    for (i, s) in slots.enumerated() { index["\(s.pos2)|\(s.normal)"] = i }
    let size = 1.02 * u
    for pos in CubeGeometry.outerPieces(n: n) {
      let piece = CATransformLayer()
      piece.bounds = .zero
      piece.position = .zero
      piece.transform = Self.ca(
        CubeGeometry.translation(Double(pos[0]) / 2 * Double(u), Double(pos[1]) / 2 * Double(u), Double(pos[2]) / 2 * Double(u)))
      for axis in 0..<3 where abs(pos[axis]) == m {
        var normal = [0, 0, 0]
        normal[axis] = pos[axis] > 0 ? 1 : -1
        // 조각 면은 거의 네모로, 이웃과 살짝 겹친다(틈으로 윤곽 선이나 뒤쪽 칸이 비치지 않게)
        let face = CALayer()
        face.bounds = CGRect(x: 0, y: 0, width: size, height: size)
        face.position = .zero
        face.backgroundColor = Self.body
        face.cornerRadius = 0.03 * u
        face.isDoubleSided = false
        face.transform = Self.ca(
          CubeGeometry.multiply(CubeGeometry.faceRotation(normal), CubeGeometry.translation(0, 0, 0.5 * Double(u))))
        // 스티커 없는 모양: 조각 면 전체가 색(가장자리만 아주 조금 남긴다)
        let inset = stickerless ? 0.02 * u : 0.11 * u
        let sticker = stickerLayer(size: size - 2 * inset, radius: stickerless ? 0.05 * u : 0.13 * u)
        sticker.position = CGPoint(x: size / 2, y: size / 2)
        face.addSublayer(sticker)
        piece.addSublayer(face)
        if let i = index["\(pos)|\(normal)"] { stickerLayers[i] = sticker }
      }
      cube.addSublayer(piece)
      pieces.append((pos, piece))
    }
  }

  private func buildPanels() {
    let u = Double(unit)
    let cell = CubeGeometry.mirrorCell
    let plate = (Double(n) + CubeGeometry.mirrorPad * 2) * cell * u
    panelLayers = []
    mirrorCubes = []
    mirrorPieces = []
    mirrorStickers = []
    for p in panels {
      // 판 놓임(옮김은 pt로). 판은 평평한 층이라 안에 둔 3D 층은 판 평면에 그려진다
      var m = p.matrix
      m[12] *= u
      m[13] *= u
      m[14] *= u
      let panel = CALayer()
      panel.bounds = CGRect(x: 0, y: 0, width: plate, height: plate)
      panel.position = .zero
      panel.transform = Self.ca(m)
      panel.cornerRadius = CubeGeometry.mirrorPlateRadius * cell * u
      panel.borderWidth = 1
      panel.borderColor = CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 0.26)
      let glass = CAGradientLayer()
      glass.frame = panel.bounds
      glass.cornerRadius = panel.cornerRadius
      glass.colors = [
        CGColor(srgbRed: 46 / 255, green: 56 / 255, blue: 78 / 255, alpha: 0.62),
        CGColor(srgbRed: 14 / 255, green: 18 / 255, blue: 28 / 255, alpha: 0.5),
      ]
      glass.startPoint = CGPoint(x: 0, y: 1)
      glass.endPoint = CGPoint(x: 1, y: 0)
      panel.addSublayer(glass)
      panel.opacity = 0
      // 누른 큐브: 판 가운데에서 큐브 스티커를 판 평면으로(사이트 `mirrorFlatten`). 조각은 큐브와 같은 자리·같은 돌리기
      let flat = CATransformLayer()
      flat.bounds = .zero
      flat.position = CGPoint(x: plate / 2, y: plate / 2)
      flat.transform = Self.ca(CubeGeometry.mirrorFlatten(p, cell: cell))
      panel.addSublayer(flat)
      var ps: [CATransformLayer] = []
      var stickers = [CALayer](repeating: CALayer(), count: slots.count)
      var index: [String: Int] = [:]
      for (i, s) in slots.enumerated() { index["\(s.pos2)|\(s.normal)"] = i }
      let mm = n - 1
      for (pos, _) in pieces {
        let piece = CATransformLayer()
        piece.bounds = .zero
        piece.position = .zero
        piece.transform = Self.ca(CubeGeometry.translation(Double(pos[0]) / 2 * u, Double(pos[1]) / 2 * u, Double(pos[2]) / 2 * u))
        for axis in 0..<3 where abs(pos[axis]) == mm {
          var normal = [0, 0, 0]
          normal[axis] = pos[axis] > 0 ? 1 : -1
          let s = stickerLayer(size: CubeGeometry.mirrorSticker * u, radius: 0.16 * u)
          s.contents = nil
          s.position = .zero
          s.isDoubleSided = false
          s.transform = Self.ca(
            CubeGeometry.multiply(CubeGeometry.faceRotation(normal), CubeGeometry.translation(0, 0, 0.5 * u)))
          piece.addSublayer(s)
          if let i = index["\(pos)|\(normal)"] { stickers[i] = s }
        }
        flat.addSublayer(piece)
        ps.append(piece)
      }
      panelLayers.append(panel)
      mirrorCubes.append(flat)
      mirrorPieces.append(ps)
      mirrorStickers.append(stickers)
      world.addSublayer(panel)
    }
  }

  static func ca(_ m: CubeGeometry.Mat4) -> CATransform3D {
    let c = m.map { CGFloat($0) }
    return CATransform3D(
      m11: c[0], m12: c[1], m13: c[2], m14: c[3], m21: c[4], m22: c[5], m23: c[6], m24: c[7],
      m31: c[8], m32: c[9], m33: c[10], m34: c[11], m41: c[12], m42: c[13], m43: c[14], m44: c[15])
  }

  // MARK: 칠하기

  /// 칸 색을 코어 화면 상태로(바뀐 칸만). 색을 바꾸는 일은 여기와 `paintSolved`에서만 생긴다
  private func paint(_ shown: [UInt8]) {
    // 층을 아직 만들기 전(창에 붙기 전)이면 칠할 것이 없다. 만들 때 처음부터 칠한다
    guard stickerLayers.count == painted.count else { return }
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    for (i, c) in shown.enumerated() where i < painted.count && painted[i] != c {
      painted[i] = c
      let hex = colors[Int(min(c, 5))]
      stickerLayers[i].backgroundColor = Self.cg(hex)
      let tinted = Self.cg(hex, Self.mirrorTint)
      for k in mirrorStickers.indices { mirrorStickers[k][i].backgroundColor = tinted }
    }
    CATransaction.commit()
  }

  func paintShown() {
    var colors = [UInt8](repeating: 0, count: painted.count)
    _ = cubie_game_shown_colors(game, &colors, UInt32(colors.count))
    paint(colors)
  }

  /// 맞춘 큐브 색(자리 번호 = 면 × n² + …라 면 번호가 곧 색)
  private func paintSolved() {
    paint((0..<painted.count).map { UInt8($0 / (n * n)) })
  }

  // MARK: 입력

  override func keyDown(with event: NSEvent) {
    if let onKeyDown {
      if !onKeyDown(event) { super.keyDown(with: event) }
      return
    }
    if press(keyCode: event.keyCode, flags: Self.flags(event)) == CUBIE_KEY_IGNORED {
      super.keyDown(with: event)
    }
  }

  override func keyUp(with event: NSEvent) {
    onKeyUp?(event)
  }

  static func flags(_ e: NSEvent) -> UInt32 {
    let m = e.modifierFlags
    var f: UInt32 = 0
    if m.contains(.shift) { f |= UInt32(CUBIE_FLAG_SHIFT) }
    if m.contains(.option) { f |= UInt32(CUBIE_FLAG_ALT) }
    if m.contains(.control) { f |= UInt32(CUBIE_FLAG_CTRL) }
    if m.contains(.command) { f |= UInt32(CUBIE_FLAG_CMD) }
    if e.isARepeat { f |= UInt32(CUBIE_FLAG_REPEAT) }
    return f
  }

  /// 키 하나를 코어로(`CUBIE_KEY_*`를 돌려준다). 섞기는 정한 연출로
  @discardableResult
  func press(keyCode: UInt16, flags: UInt32 = 0, seed: UInt32 = UInt32.random(in: 0...UInt32.max)) -> Int32 {
    let r = cubie_game_key(game, keyCode, flags, seed)
    switch r {
    case Int32(CUBIE_KEY_SCRAMBLED):
      startScrambleShow()
    case Int32(CUBIE_KEY_RESET):
      stopRunning()
      cancelSpin()
      paintShown()
    case Int32(CUBIE_KEY_MOVED), Int32(CUBIE_KEY_SOLVED):
      cancelSpin()
      // 돌던 수는 끝낸 자리로 두고 새 수를 바로 돌린다(사이트 장면과 같다)
      if running != nil { stopRunning() }
      pump()
    default:
      break
    }
    return r
  }

  /// 마지막으로 둔 수의 표기(되돌리기면 거꾸로 돌린 수)와 큐브 돌리기인지
  var lastNotation: String { NativeCore.string { cubie_game_last_notation(game, $0, $1) } }
  var lastRotation: Bool { cubie_game_last_rotation(game) }

  /// 섞기 연출을 정한다(`CUBIE_SHOW_*`)
  func setScrambleShow(_ show: Int32) { cubie_game_set_scramble_show(game, show) }

  /// 정한 씨앗·연출(`CUBIE_SHOW_*`)로 섞기. 섞기 글 수를 돌려준다
  @discardableResult
  func scramble(seed: UInt32, show: Int32) -> UInt32 {
    let count = cubie_game_scramble(game, seed, show)
    startScrambleShow()
    return count
  }

  func reset() {
    cubie_game_reset(game)
    stopRunning()
    cancelSpin()
    paintShown()
  }

  private func startScrambleShow() {
    stopRunning()
    cancelSpin()
    if cubie_game_has_turns(game) {
      // 하나씩 빠르게: 화면 상태는 맞춘 모양, 섞기 수가 줄에 있다
      paintShown()
      pump()
    } else if n > CubieNativeLimits.autoMovesMaxN && !reducedMotion {
      // 짧은 연출: 맞춘 모양으로 한 바퀴 돌기 시작해 반 바퀴에서 섞인 모양으로
      paintSolved()
      spin(seconds: CubieNativeLimits.spinSeconds)
      let work = DispatchWorkItem { [weak self] in MainActor.assumeIsolated { self?.paintShown() } }
      spinPaint = work
      DispatchQueue.main.asyncAfter(deadline: .now() + CubieNativeLimits.spinSeconds / 2, execute: work)
    } else {
      paintShown()
    }
  }

  /// 섞기 연출이 도는 중인가(줄에 섞기 수가 남았거나 한 바퀴가 도는 중)
  var showing: Bool { spinPaint != nil || cubie_game_has_turns(game) }

  /// 섞기 연출을 바로 끝낸 자리로
  func finishShow() {
    if cubie_game_finish_show(game) {
      stopRunning()
      paintShown()
    }
    cancelSpin()
  }

  private func cancelSpin() {
    guard let w = spinPaint else { return }
    w.cancel()
    spinPaint = nil
    spinLayer.removeAnimation(forKey: "spin")
    paintShown()
  }

  private func spin(seconds: Double) {
    let a = CABasicAnimation(keyPath: "transform.rotation.y")
    a.fromValue = 0
    a.toValue = 2 * Double.pi
    a.duration = seconds
    a.timingFunction = CAMediaTimingFunction(controlPoints: 0.65, 0, 0.35, 1)
    a.delegate = SpinEnd { [weak self] in self?.spinPaint = nil }
    spinLayer.add(a, forKey: "spin")
  }

  // MARK: 보기만 하는 연출(떠 있을 때 다시 보기·조금 섞기, docs/47 15-5)

  /// 화면을 맞춘 모양(`solved`) 또는 논리 상태로 두고 줄을 비운다
  func showJump(solved: Bool) {
    cubie_game_show_jump(game, solved)
    stopRunning()
    cancelSpin()
    paintShown()
  }

  /// 보기만 하는 수를 그 시간으로 돌린다
  func showPush(_ notation: String, ms: Double) {
    let ok = notation.withCString { cubie_game_show_push(game, $0, ms) }
    if ok { pump() }
  }

  // MARK: 돌리기

  /// 줄의 다음 수를 돌린다(돌리는 중이면 끝날 때 다시 부른다)
  private func pump() {
    guard running == nil else { return }
    var t = CubieTurn()
    guard cubie_game_take_turn(game, &t) else { return }
    let axis = Int(t.axis)
    let from = Int(t.from)
    let to = Int(t.to)
    let members = pieces.indices.filter {
      CubeGeometry.inMove(n: n, axis: axis, from: from, to: to, pos2: pieces[$0].pos2)
    }
    nextID += 1
    let id = nextID
    turnsStarted += 1
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    let pivot = CATransformLayer()
    pivot.bounds = .zero
    pivot.position = .zero
    cube.addSublayer(pivot)
    // 큐브 속이 드러나는 자르는 면: 도는 쪽과 나머지 쪽에 검은 판 하나씩
    var cuts: [CALayer] = []
    for c in CubeGeometry.cutPlanes(n: n, from: from, to: to) {
      let still = cutPlate(axis: axis, at: c)
      cube.addSublayer(still)
      cuts.append(still)
      pivot.addSublayer(cutPlate(axis: axis, at: c))
    }
    for i in members { pivot.addSublayer(pieces[i].layer) }
    // 거울 판이 보이면 판 안의 누른 큐브도 같은 층을 돌린다
    var pivots = [pivot]
    if mirrorShown {
      for k in mirrorCubes.indices {
        let mp = CATransformLayer()
        mp.bounds = .zero
        mp.position = .zero
        mirrorCubes[k].addSublayer(mp)
        for i in members { mp.addSublayer(mirrorPieces[k][i]) }
        pivots.append(mp)
      }
    }
    CATransaction.commit()

    CATransaction.begin()
    CATransaction.setCompletionBlock { [weak self] in
      MainActor.assumeIsolated {
        guard let self, self.running?.id == id else { return }
        self.stopRunning()
        self.pump()
      }
    }
    for pv in pivots {
      let a = CABasicAnimation(keyPath: ["transform.rotation.x", "transform.rotation.y", "transform.rotation.z"][axis])
      a.fromValue = 0
      a.toValue = CubeGeometry.moveAngle(turns: Int(t.turns))
      a.duration = max(0.001, t.ms / 1000)
      a.timingFunction = CAMediaTimingFunction(controlPoints: 0.65, 0, 0.35, 1)
      a.fillMode = .forwards
      a.isRemovedOnCompletion = false
      pv.add(a, forKey: "turn")
    }
    CATransaction.commit()
    running = Running(id: id, pivots: pivots, members: members, cuts: cuts)
  }

  private func cutPlate(axis: Int, at c: Double) -> CALayer {
    let u = Double(unit)
    let side = Double(n) * u
    var t = [0.0, 0, 0]
    t[axis] = c * u
    var normal = [0, 0, 0]
    normal[axis] = 1
    let l = CALayer()
    l.bounds = CGRect(x: 0, y: 0, width: side, height: side)
    l.position = .zero
    l.backgroundColor = Self.body
    l.transform = Self.ca(
      CubeGeometry.multiply(CubeGeometry.translation(t[0], t[1], t[2]), CubeGeometry.faceRotation(normal)))
    return l
  }

  /// 도는 수를 끝낸 자리로: 조각을 제자리로 돌려놓고 돌림 층을 버린 뒤 화면 상태로 칠한다(같은 순간이라 깜빡이지 않는다)
  private func stopRunning() {
    guard let r = running else { return }
    running = nil
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    for i in r.members { cube.addSublayer(pieces[i].layer) }
    for (k, pv) in r.pivots.enumerated() {
      if k > 0 {
        for i in r.members { mirrorCubes[k - 1].addSublayer(mirrorPieces[k - 1][i]) }
      }
      pv.removeAllAnimations()
      pv.removeFromSuperlayer()
    }
    for c in r.cuts { c.removeFromSuperlayer() }
    paintShown()
    CATransaction.commit()
  }

  // MARK: 거울·카메라·살짝 보기

  /// 거울 판을 보이거나 숨긴다. 0.3초 동안 판이 짙어지며 카메라가 판까지 담는 자리로 물러난다(동작 줄이기면 바로)
  func setMirror(_ on: Bool) {
    guard on != mirrorShown else { return }
    mirrorShown = on
    applyCamera(animated: !reducedMotion)
    onLayout?()
  }

  /// 살짝 보기(뒤·아래). nil이면 처음 각도로. 살짝 보는 동안은 큐브만 담는다
  func setPeek(_ v: (yaw: Double, pitch: Double)?) {
    peek = v
    applyCamera(animated: false)
  }

  /// 카메라와 판 진하기(판이 보이면 판까지 담는 자리로 물러난다). 켜고 끌 때 0.3초 동안 옮긴다
  private func applyCamera(animated: Bool) {
    guard unit > 0 else { return }
    let w = Double(bounds.width)
    let h = Double(bounds.height)
    let show = mirrorShown && peek == nil
    let cam = CubeGeometry.camera(n: n, aspect: w / h, panels: panels, fade: show ? 1 : 0)
    let m = Self.ca(
      CubeGeometry.sceneMatrix(
        cam, perspective: CubeGeometry.perspective(height: h), unit: Double(unit),
        yaw: peek?.yaw ?? CubeGeometry.defaultYaw, pitch: peek?.pitch ?? CubeGeometry.defaultPitch))
    let opacity: Float = show ? 1 : 0
    CATransaction.begin()
    if animated {
      CATransaction.setAnimationDuration(CubeGeometry.mirrorFade)
      CATransaction.setAnimationTimingFunction(CAMediaTimingFunction(controlPoints: 0.65, 0, 0.35, 1))
    } else {
      CATransaction.setDisableActions(true)
    }
    world.transform = m
    for p in panelLayers { p.opacity = opacity }
    CATransaction.commit()
  }

  /// 큐브와 보이는 거울 판의 화면 사각형(창 왼쪽 위 기준 pt). 앱이 그 밖의 누르기를 아래 앱에 넘긴다
  var hitRects: [CGRect] {
    guard bounds.width > 1, bounds.height > 1 else { return [] }
    return CubeGeometry.hitRects(
      n: n, width: Double(bounds.width), height: Double(bounds.height), panels: panels, mirrorShown: mirrorShown)
  }

  // MARK: 다 맞춘 축하(사이트 `SolveCheer.tsx`, docs/47 15-22)

  /// ① 큐브가 살짝 움츠렸다(0.95) 통 튄다(1.02, 0.48초) ② 큐브 둘레에 옅은 빛 고리가 퍼졌다 사라진다(0.42~0.9초)
  /// ③ 시간 숫자를 큐브 아래에 작게(0.6초부터 1.8초, 이 판 전 최고보다 빠르면 금색). 동작 줄이기면 빛만 0.5초 옅게
  /// 나타났다 사라지고 숫자가 보였다 지운다. 모두 합성기 애니메이션이라 앱은 그리지 않는다
  func cheer(text: String, best: Bool) {
    guard let cubeRect = hitRects.first, bounds.width > 1 else { return }
    let side = min(bounds.width, bounds.height)
    // 창 좌표(왼쪽 위 기준) → 층 좌표(왼쪽 아래 기준)
    let r = CGRect(
      x: cubeRect.minX, y: bounds.height - cubeRect.maxY, width: cubeRect.width, height: cubeRect.height)
    let inner = r.insetBy(dx: r.width * 0.07, dy: r.height * 0.07)
    let now = CACurrentMediaTime()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    cheerLayer.sublayers?.forEach { $0.removeFromSuperlayer() }

    let ring = CAShapeLayer()
    ring.frame = cheerLayer.bounds
    ring.path = CGPath(ellipseIn: inner, transform: nil)
    ring.fillColor = nil
    ring.strokeColor = CGColor(srgbRed: 1, green: 0.95, blue: 0.75, alpha: 0.75)
    ring.lineWidth = max(1, side * 0.012)
    ring.opacity = 0
    cheerLayer.addSublayer(ring)

    let label = CATextLayer()
    let font = max(8, min(13, side * 0.11))
    label.string = text
    label.font = NSFont.monospacedDigitSystemFont(ofSize: font, weight: .semibold)
    label.fontSize = font
    label.alignmentMode = .center
    label.contentsScale = window?.backingScaleFactor ?? 2
    label.foregroundColor = best ? CGColor(srgbRed: 1, green: 0.82, blue: 0.3, alpha: 1) : .white
    label.shadowColor = .black
    label.shadowOpacity = 0.8
    label.shadowRadius = 1.5
    label.shadowOffset = .zero
    label.frame = CGRect(x: 0, y: max(1, r.minY - font * 0.2), width: bounds.width, height: font * 1.3)
    label.opacity = 0
    cheerLayer.addSublayer(label)
    CATransaction.commit()

    func fade(_ l: CALayer, start: Double, keys: [Double], values: [Float], total: Double) {
      let a = CAKeyframeAnimation(keyPath: "opacity")
      a.values = values
      a.keyTimes = keys.map { NSNumber(value: $0) }
      a.duration = total
      a.beginTime = now + start
      a.fillMode = .both
      a.isRemovedOnCompletion = false
      l.add(a, forKey: "fade")
    }
    if reducedMotion {
      fade(ring, start: 0, keys: [0, 0.4, 1], values: [0, 0.5, 0], total: 0.5)
      fade(label, start: 0.1, keys: [0, 0.1, 0.85, 1], values: [0, 1, 1, 0], total: 1.8)
    } else {
      let bounce = CAKeyframeAnimation(keyPath: "transform.scale")
      bounce.values = [1, 0.95, 1.02, 1]
      bounce.keyTimes = [0, 0.3, 0.7, 1]
      bounce.duration = 0.48
      bounce.timingFunctions = [CAMediaTimingFunction(name: .easeInEaseOut)]
      stage.add(bounce, forKey: "cheer")
      fade(ring, start: 0.42, keys: [0, 0.3, 1], values: [0, 0.8, 0], total: 0.48)
      let grow = CABasicAnimation(keyPath: "transform.scale")
      grow.fromValue = 0.92
      grow.toValue = 1.12
      grow.duration = 0.48
      grow.beginTime = now + 0.42
      grow.fillMode = .both
      grow.isRemovedOnCompletion = false
      ring.add(grow, forKey: "grow")
      fade(label, start: 0.6, keys: [0, 0.12, 0.85, 1], values: [0, 1, 1, 0], total: 1.8)
    }
    let work = DispatchWorkItem { [weak self] in
      MainActor.assumeIsolated { self?.cheerLayer.sublayers?.forEach { $0.removeFromSuperlayer() } }
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 2.5, execute: work)
  }

  /// 층을 다시 만든다(스티커 없는 모양을 바꿨을 때)
  func rebuild() {
    builtSize = .zero
    needsLayout = true
  }

  // MARK: 확인용

  /// 창 없이 층 트리를 만든다(스크린샷, `NativeShot`)
  func buildForShot() { build() }

  var moveCount: UInt32 { cubie_game_move_count(game) }
  var solved: Bool { cubie_game_is_solved(game) }
  var scrambled: Bool { cubie_game_is_scrambled(game) }
  var turning: Bool { running != nil }
  var layerCount: Int {
    func count(_ l: CALayer) -> Int { 1 + (l.sublayers ?? []).reduce(0) { $0 + count($1) } }
    return layer.map(count) ?? 0
  }
}

/// 한 바퀴가 끝나면 알린다(섞기 연출이 끝났는지)
private final class SpinEnd: NSObject, CAAnimationDelegate, @unchecked Sendable {
  let done: @MainActor @Sendable () -> Void
  init(_ done: @escaping @MainActor @Sendable () -> Void) { self.done = done }
  nonisolated func animationDidStop(_ anim: CAAnimation, finished flag: Bool) {
    let d = done
    MainActor.assumeIsolated { d() }
  }
}

/// 사이트 섞기 연출 값 중 앱이 쓰는 것(코어 `game.rs`와 같다)
enum CubieNativeLimits {
  static let autoMovesMaxN = 5
  static let spinSeconds = 0.5
}
