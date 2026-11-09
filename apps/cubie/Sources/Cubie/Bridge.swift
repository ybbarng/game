import AppKit
import WebKit

/// 웹 미니 모드(`apps/web/src/cube/mini/app-bridge.ts`)와 주고받는 작은 메시지 다리.
/// - 앱 → 화면: `window.dispatchEvent(new CustomEvent("cubie", { detail }))`
/// - 화면 → 앱: `window.webkit.messageHandlers.cubie.postMessage(msg)`
/// 메시지 이름(`type`)은 app-bridge.ts의 `FromApp`·`ToApp`과 같아야 한다.
@MainActor
final class Bridge: NSObject, WKScriptMessageHandler {
  static let name = "cubie"

  /// 화면이 알려 준 값(메뉴 체크 표시)
  struct WebState {
    var n = 3
    var mirror = true
    var records = false
  }

  private(set) var state = WebState()
  weak var webView: WKWebView?
  /// 화면이 떴다(앱이 지금 포커스·보임을 다시 알려 줄 때)
  var onReady: (() -> Void)?
  var onState: (() -> Void)?
  /// 연결 없음 화면의 「다시 시도」
  var onRetry: (() -> Void)?
  /// 큐브·거울이 차지하는 사각형(웹 화면 왼쪽 위 기준 pt)
  var onHit: (([NSRect]) -> Void)?
  /// 「공식 보기」 말풍선 줄들(웹 `BubbleLine`). nil이면 숨기기
  var onHint: (([[String: Any]]?) -> Void)?

  nonisolated func userContentController(
    _ controller: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    MainActor.assumeIsolated { self.receive(message.body) }
  }

  private func receive(_ body: Any) {
    guard let d = body as? [String: Any], let type = d["type"] as? String else { return }
    switch type {
    case "ready":
      onReady?()
    case "state":
      if let n = d["n"] as? Int { state.n = n }
      if let m = d["mirror"] as? Bool { state.mirror = m }
      if let r = d["records"] as? Bool { state.records = r }
      onState?()
    case "retry":
      onRetry?()
    case "hit":
      let rects = (d["rects"] as? [[Double]] ?? []).compactMap { r -> NSRect? in
        r.count == 4 ? NSRect(x: r[0], y: r[1], width: r[2], height: r[3]) : nil
      }
      if Config.debug { print("[cubie] hit \(rects.map { NSStringFromRect($0) })"); fflush(stdout) }
      onHit?(rects)
    case "hint":
      onHint?(d["lines"] as? [[String: Any]])
    case "idle":
      if Config.debug { print("[cubie] idle \(d["showing"] as? String ?? "none")"); fflush(stdout) }
    default:
      break
    }
  }

  func send(_ detail: [String: Any]) {
    guard let webView,
      let data = try? JSONSerialization.data(withJSONObject: detail),
      let json = String(data: data, encoding: .utf8)
    else { return }
    webView.evaluateJavaScript(
      "window.dispatchEvent(new CustomEvent('cubie', { detail: \(json) }))",
      completionHandler: nil)
  }
}
