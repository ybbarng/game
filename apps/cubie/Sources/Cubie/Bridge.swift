import AppKit
import CubieCore
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
    /// 지금 키 배치의 섞기 키(메뉴 「섞기」 옆에 보인다). 이 값을 보내기 전 웹 화면이면 비어 있다
    var scrambleKey: MenuKey?
  }

  private(set) var state = WebState()
  /// 메뉴 맨 위 프로필 칸(웹이 `profile`로 알려 준다, docs/47 15-20). 알려 주기 전에는 번호 없는 익명 이름
  private(set) var profile = Profile.placeholder
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
      if let keys = d["scrambleKeys"] as? [[String: Any]] {
        state.scrambleKey = keys.lazy.compactMap { k -> MenuKey? in
          guard let code = k["code"] as? String else { return nil }
          return MenuKey.fromWeb(
            code: code, shift: k["shift"] as? Bool ?? false, alt: k["alt"] as? Bool ?? false,
            ctrl: k["ctrl"] as? Bool ?? false)
        }.first
      }
      onState?()
    case "profile":
      // 0.1.6부터. 이름이 없는 꼴은 버린다(앞서 받은 것을 그대로 둔다)
      if let p = Profile.from(message: d) { profile = p }
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
