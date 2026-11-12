import AppKit
import CubieCore
import Network
import WebKit

/// 떠 있는 큐브 창: 테두리 없는 투명 창. 큐브와 거울만 바탕화면 위에 뜬다.
final class CubiePanel: NSPanel {
  override var canBecomeKey: Bool { true }
  override var canBecomeMain: Bool { true }
}

/// 오른쪽 누르기 메뉴를 앱 메뉴로 바꾸는 웹 화면(「창 메뉴」).
final class CubieWebView: WKWebView {
  var menuProvider: (() -> NSMenu)?

  override func willOpenMenu(_ menu: NSMenu, with event: NSEvent) {
    guard let mine = menuProvider?() else { return }
    menu.removeAllItems()
    for item in mine.items {
      mine.removeItem(item)
      menu.addItem(item)
    }
  }

  // 창이 키가 아니어도 첫 누름을 받는다(누르면 바로 끌어 창 옮기기)
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

/// 마우스를 올렸거나 키를 받을 때만 보이는 옅은 테두리와 손잡이(위 가운데: 옮기기, 오른쪽 아래: 크기).
/// 손잡이 밖은 누르기를 웹 화면에 넘긴다.
final class ChromeView: NSView {
  var shown = false {
    didSet { if shown != oldValue { needsDisplay = true } }
  }
  var minSize = NSSize(width: 56, height: 56)
  var maxSize = NSSize(width: 480, height: 480)
  private var resizeStart: (mouse: NSPoint, frame: NSRect)?
  /// 크기 손잡이를 놓았을 때(창 자리를 저장한다)
  var onResized: (() -> Void)?

  /// 창 크기에 맞춘 손잡이 크기(아주 작은 창에서 큐브를 가리지 않게)
  private var grip: CGFloat { max(8, min(14, min(bounds.width, bounds.height) * 0.14)) }

  var moveRect: NSRect {
    let w = max(16, min(44, bounds.width * 0.3))
    let h = grip * 0.7
    return NSRect(x: bounds.midX - w / 2, y: bounds.maxY - h - 2, width: w, height: h)
  }

  /// 크기 손잡이의 보이는 자리(빗금)
  var resizeRect: NSRect {
    NSRect(x: bounds.maxX - grip - 1, y: 1, width: grip, height: grip)
  }

  /// 크기 손잡이를 잡는 자리: 빗금보다 넓게(오른쪽 아래 구석에서 16~24pt, 아주 작은 창은 한 변의 35%까지)
  var resizeHitRect: NSRect {
    let side = min(max(grip + 8, 16), 24, min(bounds.width, bounds.height) * 0.35)
    return NSRect(x: bounds.maxX - side, y: 0, width: side, height: side)
  }

  /// 창 안 점(창 좌표)이 손잡이 위인가. 큐브 끌기(창 옮기기)는 손잡이가 아닐 때만
  func isOnHandle(_ windowPoint: NSPoint) -> Bool {
    hitTest(windowPoint) != nil
  }

  override var isFlipped: Bool { false }

  override func draw(_ dirtyRect: NSRect) {
    guard shown else { return }
    let r = min(10, min(bounds.width, bounds.height) * 0.1)
    let border = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), xRadius: r, yRadius: r)
    NSColor(white: 1, alpha: 0.18).setStroke()
    border.lineWidth = 1
    border.stroke()
    NSColor(white: 1, alpha: 0.35).setFill()
    NSBezierPath(roundedRect: moveRect, xRadius: moveRect.height / 2, yRadius: moveRect.height / 2).fill()
    // 크기 손잡이: 오른쪽 아래 사선 두 줄
    let g = resizeRect
    let lines = NSBezierPath()
    for k in [0.35, 0.7] {
      lines.move(to: NSPoint(x: g.maxX - g.width * k, y: g.minY + 1))
      lines.line(to: NSPoint(x: g.maxX - 1, y: g.minY + g.height * k))
    }
    NSColor(white: 1, alpha: 0.45).setStroke()
    lines.lineWidth = 1.2
    lines.stroke()
  }

  override func hitTest(_ point: NSPoint) -> NSView? {
    guard shown else { return nil }
    let p = convert(point, from: superview)
    return moveRect.contains(p) || resizeHitRect.contains(p) ? self : nil
  }

  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

  override func resetCursorRects() {
    guard shown else { return }
    addCursorRect(moveRect, cursor: .openHand)
    addCursorRect(resizeHitRect, cursor: .crosshair)
  }

  override func mouseDown(with event: NSEvent) {
    let p = convert(event.locationInWindow, from: nil)
    if resizeHitRect.contains(p), let w = window {
      resizeStart = (NSEvent.mouseLocation, w.frame)
    } else {
      window?.performDrag(with: event)
    }
  }

  /// 오른쪽 아래를 끌어 크기를 바꾼다(왼쪽 위는 그대로)
  override func mouseDragged(with event: NSEvent) {
    guard let s = resizeStart, let w = window else { return }
    let m = NSEvent.mouseLocation
    let width = min(maxSize.width, max(minSize.width, s.frame.width + (m.x - s.mouse.x)))
    let height = min(maxSize.height, max(minSize.height, s.frame.height - (m.y - s.mouse.y)))
    w.setFrame(NSRect(x: s.frame.minX, y: s.frame.maxY - height, width: width, height: height), display: true)
  }

  override func mouseUp(with event: NSEvent) {
    if resizeStart != nil { onResized?() }
    resizeStart = nil
  }
}

/// 큐브 창과 웹 화면, 투명한 빈 곳의 누르기 넘기기, 오프라인 처리.
@MainActor
final class CubeWindow: NSObject, NSWindowDelegate, WKNavigationDelegate {
  let panel: CubiePanel
  let webView: CubieWebView
  let chrome = ChromeView()
  let bridge = Bridge()

  /// 웹이 알려 준 큐브·거울 자리(웹 화면 왼쪽 위 기준 pt). 비어 있으면 창 전체
  private var hitRects: [NSRect] = []
  private var hovering = false
  private var monitors: [Any] = []
  /// 큐브·거울을 누른 채(누른 마우스 자리·그때 창 자리, 문턱을 넘어 옮기는 중인가)
  private var press: (mouse: NSPoint, origin: NSPoint, moving: Bool)?
  /// 핀치·⌘ + 스크롤로 모은 배율(`CubieCore` `WindowZoom`)
  private var zoom = WindowZoom()
  /// 큐브·거울을 끌지 않고 눌렀다 뗐다(앱이 큐브에 키 입력을 준다)
  var onClick: (() -> Void)?

  private var triedCache = false
  private var offline = false
  /// 연결이 없어 저장해 둔 화면을 띄웠다(연결이 돌아오면 다시 불러온다)
  private var showingCache = false
  /// 이번 불러오기에서 판이 어긋나 저장본 없이 한 번 더 불러왔다(`PageFreshness.needsFreshReload`)
  private var buildRetried = false
  private let path = NWPathMonitor()

  static let frameName = "CubieMain"

  override init() {
    let config = WKWebViewConfiguration()
    // 메모리 재기는 사용자 기록·설정을 읽지도 쓰지도 않는다(늘 같은 처음 상태에서 잰다)
    config.websiteDataStore = Config.measure ? .nonPersistent() : .default()
    config.userContentController.add(bridge, name: Bridge.name)
    // 바탕을 처음부터 비운다(웹 코드가 붙기 전 한순간 검은 바탕이 보이지 않게)
    config.userContentController.addUserScript(
      WKUserScript(
        source: """
          (function(){var s=document.createElement('style');
          s.textContent='html,body,main[data-mini]{background:transparent!important}';
          (document.head||document.documentElement).appendChild(s);})();
          """,
        injectionTime: .atDocumentStart, forMainFrameOnly: true))
    // 메모리 재기의 실험(`measure-memory.sh --inject <파일>`): 문서 시작 때 넣는 스크립트(재기에서만, 표준 입력과 같이 띄운 스크립트만 준다)
    if Config.measure, let path = ProcessInfo.processInfo.environment["CUBIE_MEASURE_INJECT"],
      let js = try? String(contentsOfFile: path, encoding: .utf8)
    {
      config.userContentController.addUserScript(
        WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }
    config.mediaTypesRequiringUserActionForPlayback = []
    webView = CubieWebView(frame: .zero, configuration: config)
    // 웹 화면 바탕을 그리지 않는다. 맥용 WKWebView에는 공개 속성이 없어 널리 쓰는 키(drawsBackground)를 쓴다
    // (macOS 판이 바뀌어 키가 없어지면 바탕이 흰색·검은색으로 보일 수 있다. DEVELOPMENT.md 「공개할 때 남은 것」)
    webView.setValue(false, forKey: "drawsBackground")
    webView.underPageBackgroundColor = .clear
    bridge.webView = webView

    panel = CubiePanel(
      contentRect: NSRect(origin: .zero, size: Config.defaultSize),
      styleMask: [.borderless],
      backing: .buffered, defer: false)
    super.init()

    panel.title = "Cubie"
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = false
    panel.isFloatingPanel = true
    panel.level = .floating
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    panel.hidesOnDeactivate = false
    panel.isReleasedWhenClosed = false
    panel.acceptsMouseMovedEvents = true
    panel.minSize = Config.minSize
    panel.maxSize = Config.maxSize
    panel.delegate = self

    let content = NSView(frame: NSRect(origin: .zero, size: Config.defaultSize))
    content.wantsLayer = true
    content.layer?.backgroundColor = .clear
    webView.frame = content.bounds
    webView.autoresizingMask = [.width, .height]
    content.addSubview(webView)
    chrome.frame = content.bounds
    chrome.autoresizingMask = [.width, .height]
    chrome.minSize = Config.minSize
    chrome.maxSize = Config.maxSize
    content.addSubview(chrome)
    panel.contentView = content

    chrome.onResized = { [weak self] in self?.saveFrame() }
    webView.navigationDelegate = self
    bridge.onBuild = { [weak self] build in self?.checkBuild(page: build) }
    if Config.measure {
      hideForMeasure()
      return
    }
    placeWindow()
    bridge.onRetry = { [weak self] in self?.load() }
    bridge.onHit = { [weak self] rects in
      self?.hitRects = rects
      self?.updateMouse()
    }

    // 마우스가 움직일 때마다: 큐브·거울(과 손잡이) 위면 창이 받고, 아니면 아래 앱으로 지나가게.
    // 다른 앱 위에서의 움직임(전역)과 이 창 위의 움직임(로컬)을 함께 본다. 마우스 감시는 손쉬운 사용 권한이 필요 없다
    let global = NSEvent.addGlobalMonitorForEvents(matching: [.mouseMoved, .leftMouseUp]) { [weak self] _ in
      MainActor.assumeIsolated { self?.updateMouse() }
    }
    let local = NSEvent.addLocalMonitorForEvents(matching: [.mouseMoved, .leftMouseUp]) { [weak self] e in
      self?.updateMouse()
      return e
    }
    // 끌어 옮기기: ⌘ + 끌기는 창 어디서나 바로, 큐브·거울 그냥 끌기는 문턱을 넘으면(그 전에 떼면 클릭)
    let drag = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .leftMouseDragged, .leftMouseUp]) {
      [weak self] e in
      guard let self else { return e }
      return self.handleDrag(e)
    }
    // 핀치·⌘ + 스크롤: 창 크기(오른쪽 아래 구석 기준). 그냥 스크롤은 웹 화면에 그대로
    let zoom = NSEvent.addLocalMonitorForEvents(matching: [.magnify, .scrollWheel]) { [weak self] e in
      guard let self else { return e }
      return self.handleZoom(e)
    }
    monitors = [global, local, drag, zoom].compactMap { $0 }

    path.pathUpdateHandler = { [weak self] p in
      guard p.status == .satisfied else { return }
      Task { @MainActor in
        guard let self else { return }
        if self.offline || self.showingCache { self.load() }
      }
    }
    path.start(queue: .main)
  }

  // MARK: 메모리 재기(`Config.measure`, `Measure`)

  /// 재는 동안 웹에 알릴 포커스(앱은 앞으로 나올 수 없어 실제 키 창이 되지 않는다)
  var measureFocus = false

  /// 창을 화면 밖(어느 모니터에서도 먼 좌표)에 투명하게, 마우스를 받지 않게 둔다. 화면 구성이 바뀌어도 화면 안으로
  /// 당기지 않는다(`fitToScreens`를 부르지 않는다). 화면 밖 창은 WebKit이 「가려짐」으로 보고 그리기를 멈추므로
  /// 가려짐 감지를 끈다(비공개 설정 `_windowOcclusionDetectionEnabled`, 재기에서만). 그래야 보이는 창처럼 그린다
  private func hideForMeasure() {
    let side = min(Config.maxSize.width, max(Config.minSize.width, Config.measureSide))
    panel.setFrame(Config.measureFrame(side: side), display: false)
    panel.alphaValue = Config.measureOnscreen ? 0.01 : 0
    panel.ignoresMouseEvents = true
    // 미션 컨트롤·창 돌기에도 나오지 않게
    panel.collectionBehavior = [.transient, .ignoresCycle]
    let sel = NSSelectorFromString("_setWindowOcclusionDetectionEnabled:")
    if webView.responds(to: sel) {
      typealias Setter = @convention(c) (AnyObject, Selector, Bool) -> Void
      let imp = webView.method(for: sel)
      unsafeBitCast(imp, to: Setter.self)(webView, sel, false)
    } else {
      print("[measure] warn: occlusion detection setter missing; the web view may not draw offscreen")
    }
  }

  // MARK: 창 자리: 화면 구성마다 기억하고, 구성이 바뀌면 다시 놓는다(docs/47 15-24)
  // 테두리 없는 떠 있는 창이라 모니터를 떼도 macOS가 옮겨 주지 않는다. 그래서 켤 때뿐 아니라
  // 화면 구성이 바뀌거나 잠자기에서 깰 때마다 자리를 다시 본다

  /// 화면 구성(`WindowPlacement.layoutKey`)마다 마지막 창 자리(`NSStringFromRect`)
  static let framesKey = "CubieFramesByLayout"
  /// 화면 바뀜 알림이 몰려 올 때 마지막 것 뒤에 한 번만 다시 놓는다
  private var refitTask: Task<Void, Never>?
  /// 구성이 바뀌어 창을 다시 놓은 뒤(말풍선이 따라온다)
  var onPlaced: (() -> Void)?

  /// 켤 때: 이 구성의 자리 → 지난 자리(구성을 모를 때, 0.1.7까지 저장한 자리 포함) → 기본 자리
  private func placeWindow() {
    if !panel.setFrameUsingName(Self.frameName) {
      if let primary = Self.primaryVisible {
        panel.setFrame(
          WindowPlacement.defaultFrame(visible: primary, size: Config.defaultSize, margin: Config.margin),
          display: false)
      }
    }
    fitToScreens()
    let center = NotificationCenter.default
    center.addObserver(
      self, selector: #selector(screensChanged), name: NSApplication.didChangeScreenParametersNotification,
      object: nil)
    let workspace = NSWorkspace.shared.notificationCenter
    workspace.addObserver(
      self, selector: #selector(screensChanged), name: NSWorkspace.screensDidWakeNotification, object: nil)
    workspace.addObserver(
      self, selector: #selector(screensChanged), name: NSWorkspace.didWakeNotification, object: nil)
  }

  @objc private func screensChanged(_ note: Notification) {
    if Config.debug { print("[cubie] screens changed: \(note.name.rawValue)"); fflush(stdout) }
    refitTask?.cancel()
    refitTask = Task { @MainActor [weak self] in
      try? await Task.sleep(for: .milliseconds(600))
      guard !Task.isCancelled else { return }
      self?.fitToScreens()
    }
  }

  /// 이 화면 구성에서 저장한 자리가 보이면 그리로, 아니면 지금 자리가 보이는지 보고 당기거나 기본 자리로(`WindowPlacement.placed`).
  /// 저절로 옮긴 자리는 저장하지 않는다(저장은 사용자가 옮기거나 크기를 바꿀 때만)
  func fitToScreens() {
    let screens = NSScreen.screens.map(\.visibleFrame)
    let key = Self.layoutKey
    let f = WindowPlacement.placed(
      saved: Self.savedFrame(key), current: panel.frame, screens: screens,
      defaultSize: Config.defaultSize, margin: Config.margin)
    if Config.debug { print("[cubie] place layout=\(key) \(panel.frame) -> \(f)"); fflush(stdout) }
    if f != panel.frame { panel.setFrame(f, display: true) }
    onPlaced?()
  }

  /// 사용자가 옮기거나 크기를 바꾼 자리를 지금 화면 구성의 자리로, 또 지난 자리로 저장한다
  func saveFrame() {
    panel.saveFrame(usingName: Self.frameName)
    let defaults = UserDefaults.standard
    var all = defaults.dictionary(forKey: Self.framesKey) as? [String: String] ?? [:]
    all[Self.layoutKey] = NSStringFromRect(panel.frame)
    defaults.set(all, forKey: Self.framesKey)
  }

  private static var layoutKey: String {
    WindowPlacement.layoutKey(NSScreen.screens.map { (name: $0.localizedName, frame: $0.frame) })
  }

  private static func savedFrame(_ key: String) -> CGRect? {
    guard let s = (UserDefaults.standard.dictionary(forKey: framesKey) as? [String: String])?[key] else { return nil }
    let r = NSRectFromString(s)
    return r.width > 0 && r.height > 0 ? r : nil
  }

  /// 주 화면(메뉴 막대가 있는 화면) 보이는 영역
  private static var primaryVisible: NSRect? { (NSScreen.screens.first ?? NSScreen.main)?.visibleFrame }

  /// 기본 크기로, 주 화면 보이는 영역의 오른쪽 아래 구석에(메뉴 「창 자리 처음으로」, 이 구성의 자리로 저장)
  func resetFrame() {
    guard let screen = Self.primaryVisible else { return }
    let f = WindowPlacement.defaultFrame(visible: screen, size: Config.defaultSize, margin: Config.margin)
    panel.setFrame(f, display: true)
    saveFrame()
  }

  /// 켤 때·메뉴 「다시 불러오기」·설정 창을 닫을 때. 저장해 둔 HTML이 있어도 서버에 바뀌었는지 묻는다(`PageFreshness.load`).
  /// 예전처럼 기본 정책으로 불러오면 옛 HTML(→ 옛 화면 코드)이 남아 배포한 변경이 앱에 안 보였다(2026-11-12)
  func load() {
    offline = false
    triedCache = false
    showingCache = false
    buildRetried = false
    hitRects = []
    webView.load(URLRequest(url: Config.miniURL, cachePolicy: PageFreshness.load))
  }

  // MARK: 판 비교: 화면이 아는 빌드 커밋과 사이트에 배포된 커밋(docs/47 15-26)

  /// 화면이 「준비됨」과 함께 알려 준 빌드 커밋을 사이트 `/version.json`과 견줘, 다르면 저장본 없이 한 번 더 불러온다.
  /// 저장본으로 띄운 화면(연결 없음)은 견주지 않는다(연결이 돌아오면 어차피 다시 불러온다)
  private func checkBuild(page: String?) {
    guard !offline, !showingCache, !buildRetried else { return }
    let versionURL = Config.site("/version.json")
    Task { @MainActor [weak self] in
      let deployed = await Self.deployedBuild(versionURL)
      guard let self, !self.offline, !self.showingCache else { return }
      let reload = PageFreshness.needsFreshReload(page: page, deployed: deployed, alreadyRetried: self.buildRetried)
      if Config.debug || Config.measure {
        print("[cubie] build page=\(page ?? "nil") deployed=\(deployed ?? "nil") -> \(reload ? "reload" : "ok")")
        fflush(stdout)
      }
      guard reload else { return }
      self.buildRetried = true
      self.hitRects = []
      self.webView.load(URLRequest(url: Config.miniURL, cachePolicy: PageFreshness.forceFresh))
    }
  }

  /// 사이트에 배포된 빌드 커밋. 저장본을 쓰지 않고 받는다. 못 받으면 nil
  private static func deployedBuild(_ url: URL) async -> String? {
    let req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10)
    guard let (data, resp) = try? await URLSession.shared.data(for: req),
      (resp as? HTTPURLResponse)?.statusCode == 200
    else { return nil }
    return PageFreshness.deployedCommit(fromVersionJSON: data)
  }

  // MARK: 마우스: 투명한 빈 곳은 지나가게

  /// 창 안 점(아래 왼쪽 기준)이 큐브·거울·보이는 손잡이 위인가
  private func isHot(_ p: NSPoint) -> Bool {
    if offline || hitRects.isEmpty { return true }
    let h = panel.frame.height
    for r in hitRects where NSRect(x: r.minX, y: h - r.maxY, width: r.width, height: r.height).contains(p) {
      return true
    }
    if chrome.shown {
      if chrome.moveRect.insetBy(dx: -4, dy: -4).contains(p) || chrome.resizeHitRect.contains(p) {
        return true
      }
    }
    return false
  }

  func updateMouse() {
    if Config.measure { return }
    // 누른 채 끄는 중(창 옮기기·크기 바꾸기)에는 바꾸지 않는다
    if NSEvent.pressedMouseButtons & 1 != 0 && !panel.ignoresMouseEvents { return }
    let m = NSEvent.mouseLocation
    let inside = panel.frame.contains(m)
    hovering = inside
    chrome.shown = panel.isVisible && (inside || focused)
    let p = NSPoint(x: m.x - panel.frame.minX, y: m.y - panel.frame.minY)
    let take = inside && isHot(p)
    if panel.ignoresMouseEvents == take { panel.ignoresMouseEvents = !take }
  }

  // MARK: 마우스: 끌어 옮기기·클릭·크기
  // 큐브 위 마우스 둘러보기는 웹이 앱 안에서 끈다(`MiniCubeApp` `interactive`). 보는 각도는 키보드 x·y·z로 바꾼다

  /// 누른 채 끌기를 본다. 누름·뗌은 웹 화면에도 그대로 넘기고, 문턱을 넘은 끌기만 앱이 받아 창을 옮긴다
  private func handleDrag(_ e: NSEvent) -> NSEvent? {
    switch e.type {
    case .leftMouseDown:
      guard e.window === panel else { return e }
      press = nil
      // ⌘ + 끌기: 창 어디서나 바로 옮기기(맥 기본 창 끌기)
      if e.modifierFlags.contains(.command) {
        panel.performDrag(with: e)
        saveFrame()
        return nil
      }
      // 손잡이(옮기기·크기)는 ChromeView가 받는다
      if chrome.shown && chrome.isOnHandle(e.locationInWindow) { return e }
      press = (NSEvent.mouseLocation, panel.frame.origin, false)
      return e
    case .leftMouseDragged:
      guard var p = press else { return e }
      let m = NSEvent.mouseLocation
      if !p.moving {
        guard WindowGesture.isDrag(from: p.mouse, to: m) else { return e }
        p.moving = true
        press = p
      }
      panel.setFrameOrigin(WindowGesture.dragged(origin: p.origin, from: p.mouse, to: m))
      return nil
    case .leftMouseUp:
      guard let p = press else { return e }
      press = nil
      if p.moving {
        saveFrame()
        updateMouse()
      } else {
        onClick?()
      }
      // 뗌은 웹 화면에도 넘긴다(누름만 받고 뗌을 못 받으면 웹이 아직 누른 채로 안다)
      return e
    default:
      return e
    }
  }

  /// 핀치·⌘ + 스크롤로 창 크기를 바꾼다. 손가락을 위로(휠을 위로) 굴리면 커진다
  private func handleZoom(_ e: NSEvent) -> NSEvent? {
    guard e.window === panel else { return e }
    let step: CGFloat
    switch e.type {
    case .magnify:
      step = WindowGesture.pinchFactor(magnification: e.magnification)
    case .scrollWheel:
      guard e.modifierFlags.contains(.command) else { return e }
      // 「자연스러운 스크롤」이 켜져 있으면 값이 거꾸로 온다. 손가락·휠이 움직인 방향으로 맞춘다
      let dy = e.isDirectionInvertedFromDevice ? -e.scrollingDeltaY : e.scrollingDeltaY
      step = WindowGesture.scrollFactor(deltaY: dy, precise: e.hasPreciseScrollingDeltas)
    default:
      return e
    }
    if step != 1 {
      let f = zoom.apply(step: step, current: panel.frame, min: Config.minSize, max: Config.maxSize)
      panel.setFrame(f, display: true)
    }
    if e.phase == .ended || e.phase == .cancelled {
      zoom.end()
      saveFrame()
    }
    return nil
  }

  /// 메뉴 「창」의 크기 항목: 정사각형으로, 오른쪽 아래 구석 그대로
  func setSide(_ side: CGFloat) {
    let f = WindowGesture.resized(panel.frame, side: side, min: Config.minSize, max: Config.maxSize)
    panel.setFrame(f, display: true)
    saveFrame()
  }

  // MARK: 포커스·보임

  var focused: Bool { Config.measure ? measureFocus : panel.isKeyWindow && NSApp.isActive }
  /// 재기에서는 창이 화면 밖이라 가려짐을 보지 않고 띄웠는지만 본다
  var visible: Bool { panel.isVisible && (Config.measure || panel.occlusionState.contains(.visible)) }

  func sendFocus() {
    bridge.send(["type": "focus", "focused": focused])
    bridge.send(["type": "visible", "visible": visible])
    if Config.debug { dumpWebState("focus=\(focused) visible=\(visible)") }
  }

  /// 확인용: 웹 화면의 상태(data-mini-*)를 찍는다
  func dumpWebState(_ why: String) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
      self?.webView.evaluateJavaScript(
        "JSON.stringify(Object.assign({}, document.querySelector('main[data-mini]')?.dataset ?? {}))"
      ) { result, _ in
        print("[cubie] \(why) web=\(result ?? "nil") ignores=\(self?.panel.ignoresMouseEvents ?? false)")
        fflush(stdout)
      }
    }
  }

  func windowDidBecomeKey(_ notification: Notification) {
    panel.makeFirstResponder(webView)
    chrome.shown = true
    sendFocus()
  }

  func windowDidResignKey(_ notification: Notification) {
    chrome.shown = hovering
    sendFocus()
  }

  func windowDidChangeOcclusionState(_ notification: Notification) {
    bridge.send(["type": "visible", "visible": visible])
  }

  func windowDidMove(_ notification: Notification) { updateMouse() }
  func windowDidResize(_ notification: Notification) { chrome.needsDisplay = true }

  // MARK: 불러오기 실패: 연결이 없을 때만 저장된 것 → 연결 없음 화면(`PageFreshness.onFailure`)

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    failed(error)
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    failed(error)
  }

  private func failed(_ error: Error) {
    let e = error as NSError
    let action = PageFreshness.onFailure(domain: e.domain, code: e.code)
    if Config.debug { print("[cubie] load failed \(e.domain) \(e.code) -> \(action)"); fflush(stdout) }
    if action == .ignore { return }
    if action == .showCache && !triedCache {
      triedCache = true
      showingCache = true
      webView.load(URLRequest(url: Config.miniURL, cachePolicy: .returnCacheDataDontLoad))
      return
    }
    offline = true
    showingCache = false
    webView.loadHTMLString(Self.offlineHTML, baseURL: nil)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    sendFocus()
  }

  /// 웹 화면 프로세스가 죽으면(메모리 압박 등) 다시 띄운다
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    load()
  }

  static let offlineHTML = """
    <!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
    <style>
    html,body{height:100%;margin:0;background:transparent;color:#eee;font:12px -apple-system,sans-serif}
    body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center}
    p{margin:0;padding:2px 8px;border-radius:6px;background:rgba(0,0,0,.6)}
    button{font:inherit;color:#fff;background:#333;border:0;border-radius:6px;padding:3px 9px}
    </style>
    <p>연결 없음</p>
    <button onclick="window.webkit.messageHandlers.cubie.postMessage({type:'retry'})">다시 시도</button>
    """
}
