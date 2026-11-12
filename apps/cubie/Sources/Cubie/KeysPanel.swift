import AppKit
import CubieCore
import WebKit

/// 큐브 옆 단축키 표(docs/47 15-25): F1이나 메뉴 「단축키 보기」로 켜고 끈다. 사용자 흐름은 「표를 보면서 키를 하나씩 눌러
/// 큐브를 돌려 본다」라서
/// - 키 입력을 받지 않는다(키를 받지 않는 패널, 마우스도 지나간다). 키는 계속 큐브 창이 받는다.
/// - 큐브를 가리지 않는다. 자리는 `WindowPlacement.keysFrame`(창 위, 모자라면 아래. 창 옆 말풍선과 겹치지 않는다).
/// - 화면은 웹 `?view=keys&panel=1`(지금 배치의 키보드 그림). 큐브 창에서 누른 키는 웹이 앱에 `pressed`로 알리고,
///   앱이 여기로 넘겨 그 칸을 잠깐 빛낸다.
/// - 웹 화면은 띄울 때 만들고, 숨긴 뒤 `releaseAfter`가 지나도록 다시 띄우지 않으면 버린다. 웹 화면 하나가 따로 된 웹
///   프로세스(약 35MB)를 쓰는데, 예전에는 한 번 띄우면 앱을 끌 때까지 남았다(docs/52 2절)
@MainActor
final class KeysPanel {
  /// 숨긴 뒤 웹 화면을 버리기까지(F1을 껐다 곧 다시 켜면 다시 불러오지 않게)
  static let releaseAfter: Duration = .seconds(30)

  private let panel: NSPanel
  private let box: NSView
  private var webView: WKWebView?
  private var releaseTask: Task<Void, Never>?
  /// 네이티브 화면이면 앱 저장소의 키 배치·설정을 웹 화면에 넣는 스크립트(docs/52 5-6)
  var storeScript: (() -> WKUserScript?)?

  init() {
    let size = Config.keysPanelSize
    panel = NSPanel(
      contentRect: NSRect(origin: .zero, size: size),
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered, defer: true)
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = true
    panel.level = .floating
    panel.ignoresMouseEvents = true
    panel.hidesOnDeactivate = false
    panel.isReleasedWhenClosed = false
    panel.becomesKeyOnlyIfNeeded = true
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]

    box = NSView(frame: NSRect(origin: .zero, size: size))
    box.wantsLayer = true
    box.layer?.backgroundColor = NSColor(calibratedRed: 0.04, green: 0.04, blue: 0.04, alpha: 1).cgColor
    box.layer?.cornerRadius = 10
    box.layer?.masksToBounds = true
    box.layer?.borderColor = NSColor(white: 1, alpha: 0.15).cgColor
    box.layer?.borderWidth = 1
    panel.contentView = box
  }

  var isShown: Bool { panel.isVisible }

  /// 큐브 창 위(또는 아래)에 띄운다. `n`: 지금 큐브 크기(공식 연습 중이면 3)
  func show(cube: NSRect, visible: NSRect, n: Int) {
    releaseTask?.cancel()
    releaseTask = nil
    if webView == nil {
      makeWebView().load(URLRequest(url: Config.site("/cube/mini?view=keys&panel=1&n=\(n)"), cachePolicy: PageFreshness.load))
    } else {
      setSize(n)
    }
    panel.setFrame(WindowPlacement.keysFrame(cube: cube, panel: Config.keysPanelSize, visible: visible), display: true)
    panel.orderFrontRegardless()
  }

  /// 큐브 창과 같은 웹 저장소(키 배치·크기를 함께 읽는다)
  private func makeWebView() -> WKWebView {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = Config.measure ? .nonPersistent() : .default()
    if let script = storeScript?() { config.userContentController.addUserScript(script) }
    let web = WKWebView(frame: box.bounds, configuration: config)
    // 불러오기 전 흰 바탕이 번쩍이지 않게 웹 바탕은 그리지 않고 상자 색을 쓴다(`CubeWindow`와 같은 키)
    web.setValue(false, forKey: "drawsBackground")
    web.autoresizingMask = [.width, .height]
    box.addSubview(web)
    webView = web
    return web
  }

  /// 창이 옮겨 가면 따라간다(보이는 동안만)
  func follow(cube: NSRect, visible: NSRect) {
    guard panel.isVisible else { return }
    panel.setFrame(WindowPlacement.keysFrame(cube: cube, panel: panel.frame.size, visible: visible), display: true)
  }

  func hide() {
    panel.orderOut(nil)
    guard webView != nil, releaseTask == nil else { return }
    releaseTask = Task { @MainActor [weak self] in
      try? await Task.sleep(for: Self.releaseAfter)
      guard !Task.isCancelled, let self, !self.panel.isVisible else { return }
      self.releaseWebView()
    }
  }

  /// 웹 화면을 버린다(그 웹 프로세스도 끝난다). 다음에 띄울 때 새로 불러온다
  private func releaseWebView() {
    releaseTask = nil
    webView?.removeFromSuperview()
    webView = nil
  }

  /// 큐브 창에서 누른 키(`KeyboardEvent.code`)를 표에서 잠깐 빛낸다
  func pressed(_ code: String) {
    guard panel.isVisible else { return }
    send(["type": "pressed", "code": code])
  }

  /// 큐브 크기가 바뀌었다
  func setSize(_ n: Int) { send(["type": "size", "n": n]) }

  /// 키 배치를 바꿨다: 떠 있으면 다시 불러오고, 아니면 버려서 다음에 띄울 때 새로 불러온다
  func reload() {
    if panel.isVisible {
      webView?.reloadFromOrigin()
    } else {
      releaseTask?.cancel()
      releaseWebView()
    }
  }

  private func send(_ detail: [String: Any]) {
    guard let webView,
      let data = try? JSONSerialization.data(withJSONObject: detail),
      let json = String(data: data, encoding: .utf8)
    else { return }
    webView.evaluateJavaScript(
      "window.dispatchEvent(new CustomEvent('cubie', { detail: \(json) }))", completionHandler: nil)
  }
}
