import AppKit
import CubieCore
import CubieNativeC
import QuartzCore

/// 네이티브 큐브 화면(docs/52 5-2, `Config.native`): `CAMetalLayer` 하나에 Rust(wgpu)가 그린다.
/// 키는 그대로 Rust 코어 해석기로 넘기고, 돌리는 동안만 화면 갱신(`CADisplayLink`)을 켠다. 가만히 있을 때는 그리지 않는다.
final class NativeCubeView: NSView {
  // deinit(격리 밖)에서 놓아야 해서 격리 검사를 끈다. 주 스레드에서만 만들고 쓴다
  nonisolated(unsafe) private var view: OpaquePointer?
  private var link: CADisplayLink?
  private var timer: Timer?
  /// 재기 모드: 창이 화면 밖이라 wgpu가 가려진 창으로 보고 그릴 곳을 내주지 않는다. 그래서 같은 그리기를 화면 밖
  /// 텍스처에 하고(내보내기만 빠짐), 화면 갱신 신호 대신 1/60초 타이머로 그린다
  let offscreen = Config.measure
  /// 섞인 큐브를 다 맞췄을 때(둔 수)
  var onSolved: ((UInt32) -> Void)?

  override init(frame: NSRect) {
    super.init(frame: frame)
    wantsLayer = true
    layerContentsRedrawPolicy = .never
  }

  required init?(coder: NSCoder) { fatalError("코드로만 만든다") }

  deinit {
    if let v = view { cubie_view_free(v) }
  }

  override func makeBackingLayer() -> CALayer {
    let layer = CAMetalLayer()
    layer.isOpaque = false
    layer.backgroundColor = .clear
    layer.framebufferOnly = true
    return layer
  }

  override var acceptsFirstResponder: Bool { true }
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  // 큐브를 끌면 창이 옮겨진다(시제품: 마우스 둘러보기 없음)
  override var mouseDownCanMoveWindow: Bool { true }

  private var pixelSize: (UInt32, UInt32, Double) {
    let scale = window?.backingScaleFactor ?? 2
    return (UInt32(max(1, bounds.width * scale)), UInt32(max(1, bounds.height * scale)), Double(scale))
  }

  /// 창에 붙은 뒤 그리개를 만든다
  override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()
    guard window != nil, view == nil, let layer = layer as? CAMetalLayer else { return }
    layer.contentsScale = window?.backingScaleFactor ?? 2
    let (w, h, s) = pixelSize
    view =
      offscreen
      ? cubie_view_new_offscreen(w, h, s)
      : cubie_view_new(Unmanaged.passUnretained(layer).toOpaque(), w, h, s)
    // 창이 가려지면 Rust가 갱신을 멈춘다. 다시 보이면 한 장 그린다
    NotificationCenter.default.addObserver(
      self, selector: #selector(occlusionChanged), name: NSWindow.didChangeOcclusionStateNotification, object: window)
    if view == nil { print("[native] 그리개를 만들지 못했다"); fflush(stdout) }
    requestFrames()
  }

  @objc private func occlusionChanged(_ note: Notification) {
    if window?.occlusionState.contains(.visible) == true { redraw() }
  }

  override func viewDidChangeBackingProperties() {
    super.viewDidChangeBackingProperties()
    (layer as? CAMetalLayer)?.contentsScale = window?.backingScaleFactor ?? 2
    resized()
  }

  override func setFrameSize(_ newSize: NSSize) {
    super.setFrameSize(newSize)
    resized()
  }

  private func resized() {
    guard let v = view else { return }
    let (w, h, s) = pixelSize
    cubie_view_resize(v, w, h, s)
    requestFrames()
  }

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
    guard let v = view else { return Int32(CUBIE_KEY_IGNORED) }
    let r = cubie_view_key(v, keyCode, flags, UInt32.random(in: 0...UInt32.max))
    if r == CUBIE_KEY_SOLVED { onSolved?(cubie_view_move_count(v)) }
    requestFrames()
    return r
  }

  func scramble() {
    guard let v = view else { return }
    cubie_view_scramble(v, UInt32.random(in: 0...UInt32.max))
    requestFrames()
  }

  var moveCount: UInt32 { view.map { cubie_view_move_count($0) } ?? 0 }
  var solved: Bool { view.map { cubie_view_is_solved($0) } ?? true }
  var framesDrawn: UInt64 { view.map { cubie_view_frames_drawn($0) } ?? 0 }
  /// 그리지 못한 장 수와 마지막 까닭
  var framesFailed: (count: UInt64, last: Int32) {
    guard let v = view else { return (0, 0) }
    var last: Int32 = 0
    let n = cubie_view_frames_failed(v, &last)
    return (n, last)
  }

  /// 다시 보일 때 한 장 그린다
  func redraw() {
    guard let v = view else { return }
    cubie_view_invalidate(v)
    requestFrames()
  }

  /// 그릴 것이 있으면 화면 갱신을 켠다. 그릴 것이 없어지면 `step`이 끈다
  func requestFrames() {
    guard let v = view, cubie_view_needs_frame(v) else { return }
    if offscreen {
      guard timer == nil else { return }
      let t = Timer(timeInterval: 1.0 / 60, repeats: true) { [weak self] _ in
        MainActor.assumeIsolated { self?.step() }
      }
      RunLoop.main.add(t, forMode: .common)
      timer = t
      return
    }
    if link == nil {
      let l = displayLink(target: self, selector: #selector(onLink(_:)))
      l.add(to: .main, forMode: .common)
      link = l
    }
    link?.isPaused = false
  }

  @objc private func onLink(_ l: CADisplayLink) { step() }

  private func step() {
    guard let v = view else { return }
    let more = cubie_view_render(v, CACurrentMediaTime() * 1000)
    if !more {
      link?.isPaused = true
      timer?.invalidate()
      timer = nil
    }
  }
}

/// 네이티브 화면 실험의 앱(`CUBIE_NATIVE=1`). 웹 화면을 만들지 않는다. 떠 있는 투명 창 하나, 메뉴 막대 아이콘(섞기·끝내기),
/// ⌃⌥⌘C로 큐브에 키 입력 주기. 거울·기록·힌트·공식 연습·메뉴의 나머지 항목은 이번 범위 밖이다
@MainActor
final class NativeAppDelegate: NSObject, NSApplicationDelegate {
  let panel = CubiePanel(
    contentRect: NSRect(origin: .zero, size: Config.defaultSize), styleMask: [.borderless], backing: .buffered,
    defer: false)
  let cube = NativeCubeView(frame: NSRect(origin: .zero, size: Config.defaultSize))
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
    cube.autoresizingMask = [.width, .height]
    panel.contentView = cube
    cube.onSolved = { moves in
      print("[native] solved moves=\(moves)")
      fflush(stdout)
    }

    if Config.measure {
      measure = NativeMeasure(panel: panel, cube: cube)
      return
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
    menu.addItem(.separator())
    menu.addItem(withTitle: "끝내기", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    item.menu = menu
    statusItem = item

    let hk = HotKey { [weak self] in self?.focusCube() }
    _ = hk.register(keyCode: Config.hotKeyCode, modifiers: Config.hotKeyModifiers)
    hotKey = hk
  }

  @objc private func scramble() { cube.scramble() }

  private func focusCube() {
    NSApp.activate()
    panel.makeKeyAndOrderFront(nil)
    panel.makeFirstResponder(cube)
  }
}

/// 네이티브 화면의 재기 모드(`CUBIE_MEASURE=1 CUBIE_NATIVE=1`, `scripts/measure-memory.sh --native`). 웹 쪽 `Measure`와
/// 같은 표준 입력 명령을 받는다. 거울·큐브 크기·단축키 표는 이 시제품에 없어 받기만 하고 넘긴다
@MainActor
final class NativeMeasure {
  private let panel: CubiePanel
  private let cube: NativeCubeView
  private var turnTimer: Timer?

  /// `Measure.turns`와 같은 손가락 자리 키(두 손 배치) J F I E K D H G L S의 맥 키 코드
  static let fingerKeys: [UInt16] = [38, 3, 34, 14, 40, 2, 4, 5, 37, 1]

  init(panel: CubiePanel, cube: NativeCubeView) {
    self.panel = panel
    self.cube = cube
    let side = min(Config.maxSize.width, max(Config.minSize.width, Config.measureSide))
    panel.setFrame(NSRect(x: -30000, y: -30000, width: side, height: side), display: false)
    panel.alphaValue = 0
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
    log("started pid=\(getpid()) side=\(Int(panel.frame.width)) scale=\(panel.backingScaleFactor) native=1")
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
      self?.report("ready")
    }
  }

  private func log(_ s: String) {
    print("[measure] \(s)")
    fflush(stdout)
  }

  private func report(_ why: String) {
    log("\(why) web=0 native frames=\(cube.framesDrawn) failed=\(cube.framesFailed.count)(\(cube.framesFailed.last)) moves=\(cube.moveCount) solved=\(cube.solved)")
  }

  private func run(_ line: String) {
    let parts = line.split(separator: " ").map(String.init)
    guard let cmd = parts.first else { return }
    let arg = parts.count > 1 ? parts[1] : ""
    switch cmd {
    case "scramble":
      cube.scramble()
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
      cube.redraw()
    case "hide":
      panel.orderOut(nil)
    case "state":
      report("state")
    case "quit":
      NSApp.terminate(nil)
    case "focus", "mirror", "size", "keys":
      break
    default:
      log("unknown command: \(line)")
    }
  }
}
