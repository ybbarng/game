import AppKit
import CubieCore
import WebKit

/// 큐브 옆 단축키 표(docs/47 15-25): F1이나 메뉴 「단축키 보기」로 켜고 끈다. 사용자 흐름은 「표를 보면서 키를 하나씩 눌러
/// 큐브를 돌려 본다」라서
/// - 키 입력을 받지 않는다(키를 받지 않는 패널, 마우스도 지나간다). 키는 계속 큐브 창이 받는다.
/// - 큐브를 가리지 않는다. 자리는 `WindowPlacement.keysFrame`(창 위, 모자라면 아래. 창 옆 말풍선과 겹치지 않는다).
/// - 화면은 웹 `?view=keys&panel=1`(지금 배치의 키보드 그림). 큐브 창에서 누른 키는 웹이 앱에 `pressed`로 알리고,
///   앱이 여기로 넘겨 그 칸을 잠깐 빛낸다.
@MainActor
final class KeysPanel {
  private let panel: NSPanel
  private let webView: WKWebView
  private var loaded = false

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

    // 큐브 창과 같은 웹 저장소(키 배치·크기를 함께 읽는다)
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .default()
    webView = WKWebView(frame: NSRect(origin: .zero, size: size), configuration: config)
    // 불러오기 전 흰 바탕이 번쩍이지 않게 웹 바탕은 그리지 않고 상자 색을 쓴다(`CubeWindow`와 같은 키)
    webView.setValue(false, forKey: "drawsBackground")
    webView.autoresizingMask = [.width, .height]

    let box = NSView(frame: NSRect(origin: .zero, size: size))
    box.wantsLayer = true
    box.layer?.backgroundColor = NSColor(calibratedRed: 0.04, green: 0.04, blue: 0.04, alpha: 1).cgColor
    box.layer?.cornerRadius = 10
    box.layer?.masksToBounds = true
    box.layer?.borderColor = NSColor(white: 1, alpha: 0.15).cgColor
    box.layer?.borderWidth = 1
    box.addSubview(webView)
    panel.contentView = box
  }

  var isShown: Bool { panel.isVisible }

  /// 큐브 창 위(또는 아래)에 띄운다. `n`: 지금 큐브 크기(공식 연습 중이면 3)
  func show(cube: NSRect, visible: NSRect, n: Int) {
    if !loaded {
      webView.load(URLRequest(url: Config.site("/cube/mini?view=keys&panel=1&n=\(n)")))
      loaded = true
    } else {
      setSize(n)
    }
    panel.setFrame(WindowPlacement.keysFrame(cube: cube, panel: Config.keysPanelSize, visible: visible), display: true)
    panel.orderFrontRegardless()
  }

  /// 창이 옮겨 가면 따라간다(보이는 동안만)
  func follow(cube: NSRect, visible: NSRect) {
    guard panel.isVisible else { return }
    panel.setFrame(WindowPlacement.keysFrame(cube: cube, panel: panel.frame.size, visible: visible), display: true)
  }

  func hide() { panel.orderOut(nil) }

  /// 큐브 창에서 누른 키(`KeyboardEvent.code`)를 표에서 잠깐 빛낸다
  func pressed(_ code: String) {
    guard panel.isVisible else { return }
    send(["type": "pressed", "code": code])
  }

  /// 큐브 크기가 바뀌었다
  func setSize(_ n: Int) { send(["type": "size", "n": n]) }

  /// 키 배치를 바꿨다: 다음에 띄울 때 새로 불러온다
  func reload() {
    loaded = false
    if panel.isVisible { webView.reload(); loaded = true }
  }

  private func send(_ detail: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: detail),
      let json = String(data: data, encoding: .utf8)
    else { return }
    webView.evaluateJavaScript(
      "window.dispatchEvent(new CustomEvent('cubie', { detail: \(json) }))", completionHandler: nil)
  }
}
