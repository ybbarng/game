import AppKit
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

  // 창이 키가 아니어도 첫 누름을 받는다(누르면 바로 끌어 둘러보기)
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

/// 마우스를 올렸거나 키를 받을 때만 보이는 옅은 테두리와 손잡이(위 가운데: 옮기기, 오른쪽 아래: 크기).
/// 손잡이 밖은 누르기를 웹 화면에 넘긴다.
final class ChromeView: NSView {
  var shown = false {
    didSet { if shown != oldValue { needsDisplay = true } }
  }
  var minSize = NSSize(width: 56, height: 56)
  private var resizeStart: (mouse: NSPoint, frame: NSRect)?

  /// 창 크기에 맞춘 손잡이 크기(아주 작은 창에서 큐브를 가리지 않게)
  private var grip: CGFloat { max(8, min(14, min(bounds.width, bounds.height) * 0.14)) }

  var moveRect: NSRect {
    let w = max(16, min(44, bounds.width * 0.3))
    let h = grip * 0.7
    return NSRect(x: bounds.midX - w / 2, y: bounds.maxY - h - 2, width: w, height: h)
  }

  var resizeRect: NSRect {
    NSRect(x: bounds.maxX - grip - 1, y: 1, width: grip, height: grip)
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
    return moveRect.contains(p) || resizeRect.contains(p) ? self : nil
  }

  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

  override func resetCursorRects() {
    guard shown else { return }
    addCursorRect(moveRect, cursor: .openHand)
    addCursorRect(resizeRect, cursor: .crosshair)
  }

  override func mouseDown(with event: NSEvent) {
    let p = convert(event.locationInWindow, from: nil)
    if resizeRect.contains(p), let w = window {
      resizeStart = (NSEvent.mouseLocation, w.frame)
    } else {
      window?.performDrag(with: event)
    }
  }

  /// 오른쪽 아래를 끌어 크기를 바꾼다(왼쪽 위는 그대로)
  override func mouseDragged(with event: NSEvent) {
    guard let s = resizeStart, let w = window else { return }
    let m = NSEvent.mouseLocation
    let width = max(minSize.width, s.frame.width + (m.x - s.mouse.x))
    let height = max(minSize.height, s.frame.height - (m.y - s.mouse.y))
    w.setFrame(NSRect(x: s.frame.minX, y: s.frame.maxY - height, width: width, height: height), display: true)
  }

  override func mouseUp(with event: NSEvent) {
    if resizeStart != nil { window?.saveFrame(usingName: CubeWindow.frameName) }
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

  private var triedCache = false
  private var offline = false
  private let path = NWPathMonitor()

  static let frameName = "CubieMain"

  override init() {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .default()
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
    config.mediaTypesRequiringUserActionForPlayback = []
    webView = CubieWebView(frame: .zero, configuration: config)
    // 웹 화면 바탕을 그리지 않는다. 맥용 WKWebView에는 공개 속성이 없어 널리 쓰는 키(drawsBackground)를 쓴다
    // (macOS 판이 바뀌어 키가 없어지면 바탕이 흰색·검은색으로 보일 수 있다. README 「확신 낮은 것」)
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
    content.addSubview(chrome)
    panel.contentView = content

    placeWindow()
    webView.navigationDelegate = self
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
    // ⌘ + 끌기: 창 어디서나 옮기기(큐브 위 그냥 끌기는 둘러보기)
    let cmdDrag = NSEvent.addLocalMonitorForEvents(matching: .leftMouseDown) { [weak self] e in
      guard let self, e.window === self.panel, e.modifierFlags.contains(.command) else { return e }
      self.panel.performDrag(with: e)
      self.panel.saveFrame(usingName: Self.frameName)
      return nil
    }
    monitors = [global, local, cmdDrag].compactMap { $0 }

    path.pathUpdateHandler = { [weak self] p in
      guard p.status == .satisfied else { return }
      Task { @MainActor in
        if self?.offline == true { self?.load() }
      }
    }
    path.start(queue: .main)
  }

  /// 저장된 자리, 없으면 화면 오른쪽 아래 구석
  private func placeWindow() {
    if !panel.setFrameUsingName(Self.frameName) { resetFrame() }
    panel.setFrameAutosaveName(Self.frameName)
  }

  func resetFrame() {
    guard let screen = NSScreen.main?.visibleFrame else { return }
    let s = Config.defaultSize
    panel.setFrame(
      NSRect(x: screen.maxX - s.width - Config.margin, y: screen.minY + Config.margin, width: s.width, height: s.height),
      display: true)
  }

  func load() {
    offline = false
    triedCache = false
    hitRects = []
    webView.load(URLRequest(url: Config.miniURL))
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
      if chrome.moveRect.insetBy(dx: -4, dy: -4).contains(p) || chrome.resizeRect.insetBy(dx: -4, dy: -4).contains(p) {
        return true
      }
    }
    return false
  }

  func updateMouse() {
    // 누른 채 끄는 중(큐브 돌리기·크기 바꾸기)에는 바꾸지 않는다
    if NSEvent.pressedMouseButtons & 1 != 0 && !panel.ignoresMouseEvents { return }
    let m = NSEvent.mouseLocation
    let inside = panel.frame.contains(m)
    hovering = inside
    chrome.shown = panel.isVisible && (inside || focused)
    let p = NSPoint(x: m.x - panel.frame.minX, y: m.y - panel.frame.minY)
    let take = inside && isHot(p)
    if panel.ignoresMouseEvents == take { panel.ignoresMouseEvents = !take }
  }

  // MARK: 포커스·보임

  var focused: Bool { panel.isKeyWindow && NSApp.isActive }
  var visible: Bool { panel.isVisible && panel.occlusionState.contains(.visible) }

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

  // MARK: 불러오기 실패(오프라인): 저장된 것 → 연결 없음 화면

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    failed(error)
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    failed(error)
  }

  private func failed(_ error: Error) {
    let e = error as NSError
    if e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled { return }
    if !triedCache {
      triedCache = true
      webView.load(URLRequest(url: Config.miniURL, cachePolicy: .returnCacheDataDontLoad))
      return
    }
    offline = true
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
