import AppKit
import CubieCore
import CubieNativeC
import QuartzCore

/// 네이티브 큐브 화면(docs/52 5-5, `Config.native`): Rust 코어 한 판(C ABI)이 키를 수로 바꾸고, 큐브는 Core Animation 층
/// 트리(`CATransformLayer` + `CALayer`)로 그린다. 돌리기는 `CABasicAnimation`이라 합성기(WindowServer)가 그리고, 앱은 수마다
/// 층 몇 개를 옮기고 칸 색만 바꾼다. 앱 프로세스는 GPU로 그리기를 보내지 않아 드라이버 몫(약 108MB, 5-3)이 붙지 않는다.
///
/// 층 차례(바깥 → 안):
/// - 윤곽 겹 다섯(3D가 아닌 평평한 층): 바깥은 어두운 흐린 그림자, 안쪽 넷은 흐림 없는 흰 그림자를 오른쪽·왼쪽·아래·위로
///   민 것(사이트 `outlineFilter`와 같은 꼴). 그림자는 3D 층(`CATransformLayer`)에 걸지 않는다(무시되고 경고가 난다).
/// - 무대(`stage`): `sublayerTransform`에 원근(m34 = −1/P)
/// - 세계(`world`, 3D): 카메라 행렬(`CubeGeometry.sceneMatrix`). 거울 판 셋과 한 바퀴 층(`spin`)을 담는다
/// - 큐브(`cube`, 3D) → 조각(3D, 늘 제자리) → 겉면(검은 몸통 판) → 스티커(둥근 사각형, 색 + 미리 그린 광택 그림 하나를 함께 씀)
///
/// 수 하나: 그 층 조각을 돌림 층에 옮겨 돌림 층을 돌리고(속이 드러나는 자르는 면에는 검은 판 두 장), 끝나면 조각을 제자리로
/// 돌려놓고 칸 색을 코어의 화면 상태로 다시 칠한다. 조각은 늘 제자리라 행렬 오차가 쌓이지 않는다. 가만히 있을 때는 아무것도
/// 하지 않는다(타이머·화면 갱신 없음).
@MainActor
final class CACubeView: NSView {
  /// 대회 표준 색(U R F D L B, 사이트 `DEFAULT_COLORS`)과 몸통
  static let colors: [UInt32] = [0xffffff, 0xc8102e, 0x009b48, 0xffd500, 0xff5800, 0x0046ad]
  static let body = cg(0x0d0d0f)
  /// 거울 판 칸은 조금 어둡게(사이트 `MIRROR_TINT`)
  static let mirrorTint: CGFloat = 0.86
  /// 사이트 윤곽 값(`apps/web/src/cube/mini/backdrop.ts` `OUTLINE`)
  static let rim: Float = 0.55
  static let rimWidth: CGFloat = 0.005
  static let rimWidthMin: CGFloat = 1
  static let shade: Float = 0.55
  static let shadeBlur: CGFloat = 0.022

  nonisolated(unsafe) private let game: OpaquePointer
  let n: Int
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
  private var pieces: [(pos2: [Int], layer: CATransformLayer)] = []
  /// 자리마다 스티커 층과 거울 판 칸 층(뒤·왼쪽·아래를 향한 자리만)
  private var stickerLayers: [CALayer] = []
  private var mirrorCells: [Int: CALayer] = [:]
  private var panelLayers: [CALayer] = []
  private var panels: [CubeGeometry.MirrorPanel] = []
  private var unit: CGFloat = 0
  private var builtSize: CGSize = .zero

  private struct Running {
    let id: Int
    let pivot: CATransformLayer
    let members: [Int]
    let cuts: [CALayer]
  }
  private var running: Running?
  private var nextID = 0
  private var spinPaint: DispatchWorkItem?

  /// 거울 판: 켜 둠(메뉴·재기 명령) · 포커스 있음 · 섞인 큐브를 맞추는 중일 때 보인다(사이트 미니 `mirror.ts`)
  var mirrorWanted = true { didSet { updateMirror() } }
  var focused = false { didSet { updateMirror() } }
  private var mirrorShown = false

  /// 섞인 큐브를 다 맞췄을 때(둔 수)
  var onSolved: ((UInt32) -> Void)?
  /// 시작한 돌리기 애니메이션 수(재기·확인용)
  private(set) var turnsStarted = 0

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
  override var mouseDownCanMoveWindow: Bool { true }

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
    var persp = CATransform3DIdentity
    persp.m34 = -1 / CGFloat(p)
    stage.sublayerTransform = persp
    parent.addSublayer(stage)

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
        let sticker = CALayer()
        sticker.frame = face.bounds.insetBy(dx: 0.1 * u + 0.01 * u, dy: 0.1 * u + 0.01 * u)
        sticker.cornerRadius = 0.13 * u
        sticker.masksToBounds = true
        sticker.contents = Self.gloss
        sticker.contentsGravity = .resize
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
    mirrorCells = [:]
    for p in panels {
      // 판 놓임(옮김은 pt로). 판은 평평한 층이라 칸은 그 위에 납작하게 그려진다
      var m = p.matrix
      m[12] *= u
      m[13] *= u
      m[14] *= u
      let panel = CALayer()
      panel.bounds = CGRect(x: 0, y: 0, width: plate, height: plate)
      panel.position = .zero
      panel.transform = Self.ca(m)
      panel.cornerRadius = 0.1 * plate
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
      panelLayers.append(panel)
      world.addSublayer(panel)
    }
    let size = cell * u * 0.86
    for (i, s) in slots.enumerated() {
      guard let c = CubeGeometry.mirrorCell(pos2: s.pos2, normal: s.normal) else { continue }
      let l = CALayer()
      l.bounds = CGRect(x: 0, y: 0, width: size, height: size)
      l.position = CGPoint(x: plate / 2 + c.u * cell * u, y: plate / 2 + c.v * cell * u)
      l.cornerRadius = 0.16 * cell * u
      panelLayers[c.panel].addSublayer(l)
      mirrorCells[i] = l
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
  private func paint(_ colors: [UInt8]) {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    for (i, c) in colors.enumerated() where i < painted.count && painted[i] != c {
      painted[i] = c
      let hex = Self.colors[Int(min(c, 5))]
      stickerLayers[i].backgroundColor = Self.cg(hex)
      mirrorCells[i]?.backgroundColor = Self.cg(hex, Self.mirrorTint)
    }
    CATransaction.commit()
  }

  private func paintShown() {
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
    if press(keyCode: event.keyCode, flags: Self.flags(event)) == CUBIE_KEY_IGNORED {
      super.keyDown(with: event)
    }
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

  /// 키 하나를 코어로(`CUBIE_KEY_*`를 돌려준다)
  @discardableResult
  func press(keyCode: UInt16, flags: UInt32 = 0) -> Int32 {
    let r = cubie_game_key(game, keyCode, flags, UInt32.random(in: 0...UInt32.max))
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
      if r == CUBIE_KEY_SOLVED { onSolved?(cubie_game_move_count(game)) }
    default:
      break
    }
    updateMirror()
    return r
  }

  /// 메뉴·재기의 섞기(연출은 크기에 맞게)
  func scramble() {
    scramble(seed: UInt32.random(in: 0...UInt32.max), show: Int32(CUBIE_SHOW_AUTO))
  }

  /// 정한 씨앗·연출(`CUBIE_SHOW_*`)로 섞기(스크린샷이 같은 섞기를 쓴다)
  func scramble(seed: UInt32, show: Int32) {
    _ = cubie_game_scramble(game, seed, show)
    startScrambleShow()
    updateMirror()
  }

  private func startScrambleShow() {
    stopRunning()
    cancelSpin()
    if cubie_game_has_turns(game) {
      // 하나씩 빠르게: 화면 상태는 맞춘 모양, 섞기 수가 줄에 있다
      paintShown()
      pump()
    } else if n > CubieNativeLimits.autoMovesMaxN {
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
    spinLayer.add(a, forKey: "spin")
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
    CATransaction.commit()

    CATransaction.begin()
    CATransaction.setCompletionBlock { [weak self] in
      MainActor.assumeIsolated {
        guard let self, self.running?.id == id else { return }
        self.stopRunning()
        self.pump()
      }
    }
    let a = CABasicAnimation(keyPath: ["transform.rotation.x", "transform.rotation.y", "transform.rotation.z"][axis])
    a.fromValue = 0
    a.toValue = CubeGeometry.moveAngle(turns: Int(t.turns))
    a.duration = max(0.001, t.ms / 1000)
    a.timingFunction = CAMediaTimingFunction(controlPoints: 0.65, 0, 0.35, 1)
    a.fillMode = .forwards
    a.isRemovedOnCompletion = false
    pivot.add(a, forKey: "turn")
    CATransaction.commit()
    running = Running(id: id, pivot: pivot, members: members, cuts: cuts)
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
    r.pivot.removeAllAnimations()
    r.pivot.removeFromSuperlayer()
    for c in r.cuts { c.removeFromSuperlayer() }
    paintShown()
    CATransaction.commit()
  }

  // MARK: 거울·카메라

  private func updateMirror() {
    let want =
      mirrorWanted && focused && cubie_game_is_scrambled(game) && !cubie_game_is_solved(game)
    guard want != mirrorShown else { return }
    mirrorShown = want
    applyCamera(animated: true)
  }

  /// 카메라와 판 진하기(판이 보이면 판까지 담는 자리로 물러난다). 켜고 끌 때 0.3초 동안 옮긴다
  private func applyCamera(animated: Bool) {
    guard unit > 0 else { return }
    let w = Double(bounds.width)
    let h = Double(bounds.height)
    let cam = CubeGeometry.camera(n: n, aspect: w / h, panels: panels, fade: mirrorShown ? 1 : 0)
    let m = Self.ca(CubeGeometry.sceneMatrix(cam, perspective: CubeGeometry.perspective(height: h), unit: Double(unit)))
    let opacity: Float = mirrorShown ? 1 : 0
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

  // MARK: 확인용

  /// 창 없이 층 트리를 만든다(스크린샷, `NativeShot`)
  func buildForShot() { build() }

  var moveCount: UInt32 { cubie_game_move_count(game) }
  var solved: Bool { cubie_game_is_solved(game) }
  var layerCount: Int {
    func count(_ l: CALayer) -> Int { 1 + (l.sublayers ?? []).reduce(0) { $0 + count($1) } }
    return layer.map(count) ?? 0
  }
}

/// 사이트 섞기 연출 값 중 앱이 쓰는 것(코어 `game.rs`와 같다)
enum CubieNativeLimits {
  static let autoMovesMaxN = 5
  static let spinSeconds = 0.5
}

/// 네이티브 화면 앱(`CUBIE_NATIVE=1`). 웹 화면을 만들지 않는다. 떠 있는 투명 창 하나, 메뉴 막대 아이콘(섞기·거울·크기·끝내기),
/// ⌃⌥⌘C로 큐브에 키 입력 주기. 기록·힌트·공식 연습·단축키 표·메뉴의 나머지 항목은 이번 범위 밖이다(docs/52 5-5)
@MainActor
final class NativeAppDelegate: NSObject, NSApplicationDelegate {
  let panel = CubiePanel(
    contentRect: NSRect(origin: .zero, size: Config.defaultSize), styleMask: [.borderless], backing: .buffered,
    defer: false)
  private(set) var cube = CACubeView(frame: NSRect(origin: .zero, size: Config.defaultSize))
  private var statusItem: NSStatusItem?
  private var hotKey: HotKey?
  private var measure: NativeMeasure?

  func applicationDidFinishLaunching(_ notification: Notification) {
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = false
    panel.level = .floating
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    panel.hidesOnDeactivate = false
    panel.isReleasedWhenClosed = false
    panel.isMovableByWindowBackground = true
    install(cube)

    if Config.measure {
      measure = NativeMeasure(app: self)
      return
    }
    for (name, focused) in [(NSWindow.didBecomeKeyNotification, true), (NSWindow.didResignKeyNotification, false)] {
      NotificationCenter.default.addObserver(forName: name, object: panel, queue: .main) { [weak self] _ in
        MainActor.assumeIsolated { self?.cube.focused = focused }
      }
    }
    if let screen = (NSScreen.screens.first ?? NSScreen.main)?.visibleFrame {
      panel.setFrame(
        WindowPlacement.defaultFrame(visible: screen, size: Config.defaultSize, margin: Config.margin), display: false)
    }
    panel.orderFrontRegardless()

    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    item.button?.image = NSImage(named: "MenuIcon") ?? NSImage(systemSymbolName: "cube", accessibilityDescription: "Cubie")
    item.button?.image?.isTemplate = true
    let menu = NSMenu()
    menu.addItem(withTitle: "네이티브 화면 시제품", action: nil, keyEquivalent: "").isEnabled = false
    menu.addItem(withTitle: "섞기", action: #selector(scramble), keyEquivalent: "").target = self
    menu.addItem(withTitle: "거울 보이기", action: #selector(toggleMirror), keyEquivalent: "").target = self
    let sizes = NSMenu()
    for k in 2...7 {
      let it = NSMenuItem(title: "\(k)×\(k)", action: #selector(changeSize(_:)), keyEquivalent: "")
      it.tag = k
      it.target = self
      sizes.addItem(it)
    }
    let sizeItem = NSMenuItem(title: "큐브 크기", action: nil, keyEquivalent: "")
    sizeItem.submenu = sizes
    menu.addItem(sizeItem)
    let sides = NSMenu()
    for (label, side) in Config.sizePresets {
      let it = NSMenuItem(title: label, action: #selector(changeSide(_:)), keyEquivalent: "")
      it.tag = Int(side)
      it.target = self
      sides.addItem(it)
    }
    let sideItem = NSMenuItem(title: "창", action: nil, keyEquivalent: "")
    sideItem.submenu = sides
    menu.addItem(sideItem)
    menu.addItem(.separator())
    menu.addItem(withTitle: "끝내기", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    item.menu = menu
    statusItem = item

    let hk = HotKey { [weak self] in self?.focusCube() }
    _ = hk.register(keyCode: Config.hotKeyCode, modifiers: Config.hotKeyModifiers)
    hotKey = hk
  }

  private func install(_ view: CACubeView) {
    view.frame = NSRect(origin: .zero, size: panel.frame.size)
    view.autoresizingMask = [.width, .height]
    panel.contentView = view
    view.onSolved = { moves in
      print("[native] solved moves=\(moves)")
      fflush(stdout)
    }
  }

  /// 큐브 크기를 바꾼다(새 한 판)
  func setCubeSize(_ k: Int) {
    let next = CACubeView(frame: NSRect(origin: .zero, size: panel.frame.size), n: k)
    next.mirrorWanted = cube.mirrorWanted
    next.focused = cube.focused
    cube = next
    install(next)
    if !Config.measure { panel.makeFirstResponder(next) }
  }

  @objc private func scramble() { cube.scramble() }
  @objc private func toggleMirror(_ sender: NSMenuItem) {
    cube.mirrorWanted.toggle()
    sender.state = cube.mirrorWanted ? .on : .off
  }
  @objc private func changeSize(_ sender: NSMenuItem) { setCubeSize(sender.tag) }
  @objc private func changeSide(_ sender: NSMenuItem) {
    var f = panel.frame
    let side = CGFloat(sender.tag)
    f.origin.y += f.height - side
    f.size = NSSize(width: side, height: side)
    panel.setFrame(f, display: true)
  }

  private func focusCube() {
    NSApp.activate()
    panel.makeKeyAndOrderFront(nil)
    panel.makeFirstResponder(cube)
  }
}

/// 네이티브 화면의 재기 모드(`CUBIE_MEASURE=1 CUBIE_NATIVE=1`, `scripts/measure-memory.sh --native`). 웹 쪽 `Measure`와
/// 같은 표준 입력 명령을 받는다. 단축키 표(`keys`)는 이 시제품에 없어 받기만 하고 넘긴다
@MainActor
final class NativeMeasure {
  private let app: NativeAppDelegate
  private var panel: CubiePanel { app.panel }
  private var cube: CACubeView { app.cube }
  private var turnTimer: Timer?

  /// `Measure.turns`와 같은 손가락 자리 키(두 손 배치) J F I E K D H G L S의 맥 키 코드
  static let fingerKeys: [UInt16] = [38, 3, 34, 14, 40, 2, 4, 5, 37, 1]

  init(app: NativeAppDelegate) {
    self.app = app
    let side = min(Config.maxSize.width, max(Config.minSize.width, Config.measureSide))
    panel.setFrame(Config.measureFrame(side: side), display: false)
    panel.alphaValue = Config.measureOnscreen ? 0.01 : 0
    panel.ignoresMouseEvents = true
    panel.collectionBehavior = [.transient, .ignoresCycle]
    let input = FileHandle.standardInput
    input.readabilityHandler = { [weak self] h in
      let data = h.availableData
      if data.isEmpty {
        h.readabilityHandler = nil
        Task { @MainActor in NSApp.terminate(nil) }
        return
      }
      let lines = String(decoding: data, as: UTF8.self).split(whereSeparator: \.isNewline).map(String.init)
      Task { @MainActor in
        for l in lines { self?.run(l) }
      }
    }
    panel.orderFrontRegardless()
    log(
      "started pid=\(getpid()) side=\(Int(panel.frame.width)) scale=\(panel.backingScaleFactor) native=ca onscreen=\(Config.measureOnscreen)"
    )
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
      self?.report("ready")
    }
  }

  private func log(_ s: String) {
    print("[measure] \(s)")
    fflush(stdout)
  }

  private func report(_ why: String) {
    log(
      "\(why) web=0 native=ca n=\(cube.n) layers=\(cube.layerCount) turns=\(cube.turnsStarted) moves=\(cube.moveCount) solved=\(cube.solved)"
    )
  }

  private func run(_ line: String) {
    let parts = line.split(separator: " ").map(String.init)
    guard let cmd = parts.first else { return }
    let arg = parts.count > 1 ? parts[1] : ""
    switch cmd {
    case "focus":
      cube.focused = arg == "1"
    case "scramble":
      cube.scramble()
    case "mirror":
      cube.mirrorWanted = arg == "1"
    case "size":
      app.setCubeSize(Int(arg) ?? 3)
    case "side":
      let side = CGFloat(Double(arg) ?? Double(Config.defaultSize.width))
      var f = panel.frame
      f.size = NSSize(width: side, height: side)
      panel.setFrame(f, display: true)
    case "turns":
      var left = Int(arg) ?? 20
      var i = 0
      turnTimer?.invalidate()
      let t = Timer(timeInterval: 0.12, repeats: true) { [weak self] _ in
        MainActor.assumeIsolated {
          guard let self else { return }
          guard left > 0 else {
            self.turnTimer?.invalidate()
            self.turnTimer = nil
            return
          }
          self.cube.press(keyCode: Self.fingerKeys[i % Self.fingerKeys.count])
          i += 1
          left -= 1
        }
      }
      RunLoop.main.add(t, forMode: .common)
      turnTimer = t
    case "show":
      panel.orderFrontRegardless()
    case "hide":
      cube.focused = false
      panel.orderOut(nil)
    case "state":
      report("state")
    case "quit":
      NSApp.terminate(nil)
    case "keys":
      break
    default:
      log("unknown command: \(line)")
    }
  }
}
