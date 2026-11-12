import AppKit
import CubieCore
import Network
import WebKit

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

/// 웹 큐브 화면(되돌림 스위치 `CUBIE_WEB=1`, docs/52 5-6): 사이트 미니 모드 `/cube/mini`를 띄우고 다리로 주고받는다.
/// 창 다루기는 `FloatingWindow`, 오프라인 처리와 판 비교(docs/47 15-26)는 여기.
@MainActor
final class CubeWindow: FloatingWindow, CubeSurface, WKNavigationDelegate {
  let webView: CubieWebView
  let bridge = Bridge()

  private var triedCache = false
  private var offline = false
  /// 연결이 없어 저장해 둔 화면을 띄웠다(연결이 돌아오면 다시 불러온다)
  private var showingCache = false
  /// 이번 불러오기에서 판이 어긋나 저장본 없이 한 번 더 불러왔다(`PageFreshness.needsFreshReload`)
  private var buildRetried = false
  private let path = NWPathMonitor()

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
    super.init()

    webView.frame = host.bounds
    webView.autoresizingMask = [.width, .height]
    host.addSubview(webView)
    webView.navigationDelegate = self
    bridge.onBuild = { [weak self] build in self?.checkBuild(page: build) }
    if Config.measure {
      prepareForMeasure()
      return
    }
    bridge.onRetry = { [weak self] in self?.load() }
    bridge.onHit = { [weak self] rects in self?.hitRects = rects }

    path.pathUpdateHandler = { [weak self] p in
      guard p.status == .satisfied else { return }
      Task { @MainActor in
        guard let self else { return }
        if self.offline || self.showingCache { self.load() }
      }
    }
    path.start(queue: .main)
  }

  // MARK: CubeSurface

  var state: CubeState { bridge.state }
  var profile: Profile { bridge.profile }
  private var readyHandler: (() -> Void)?
  /// 화면이 뜰 때마다 이 앱이 말풍선을 그린다고 먼저 알린다(0.1.2 이하 앱은 보내지 않아 웹이 창 안에 작게 보인다)
  var onReady: (() -> Void)? {
    get { readyHandler }
    set {
      readyHandler = newValue
      bridge.onReady = { [weak self] in
        guard let self else { return }
        self.sendFocus()
        self.bridge.send(["type": "caps", "hintBubble": true])
        self.readyHandler?()
      }
    }
  }
  var onState: (() -> Void)? {
    get { bridge.onState }
    set { bridge.onState = newValue }
  }
  var onHint: (([[String: Any]]?) -> Void)? {
    get { bridge.onHint }
    set { bridge.onHint = newValue }
  }
  var onPressed: ((String) -> Void)? {
    get { bridge.onPressed }
    set { bridge.onPressed = newValue }
  }
  var menuProvider: (() -> NSMenu)? {
    get { webView.menuProvider }
    set { webView.menuProvider = newValue }
  }

  func send(_ command: CubeCommand) {
    switch command {
    case .scramble: bridge.send(["type": "scramble"])
    case .toggleMirror: bridge.send(["type": "mirror"])
    case .hint: bridge.send(["type": "hint"])
    case .size(let n): bridge.send(["type": "size", "n": n])
    case .practice(let stage, let see):
      if let stage {
        bridge.send(["type": "practice", "stage": stage, "mode": see ? "see" : "follow"])
      } else {
        bridge.send(["type": "practice", "stage": NSNull()])
      }
    case .keysPanel(let open): bridge.send(["type": "keysPanel", "open": open])
    }
  }

  func reload() { load() }
  func takeKeys() { panel.makeFirstResponder(webView) }
  func setPracticeSee(_ on: Bool) { bridge.setPracticeSee(on) }

  func keyArriving(_ event: NSEvent) {
    let source = KeySource.of(event)
    if Config.debug, let f = KeySource.fields(event) {
      print("[cubie] key code=\(event.keyCode) repeat=\(event.isARepeat) source=\(source.rawValue) \(f)")
      fflush(stdout)
    }
    bridge.send(["type": "key", "source": source.rawValue])
  }

  // MARK: 메모리 재기

  /// 화면 밖 창은 WebKit이 「가려짐」으로 보고 그리기를 멈추므로 가려짐 감지를 끈다(비공개 설정
  /// `_windowOcclusionDetectionEnabled`, 재기에서만). 그래야 보이는 창처럼 그린다
  override func prepareForMeasure() {
    let sel = NSSelectorFromString("_setWindowOcclusionDetectionEnabled:")
    if webView.responds(to: sel) {
      typealias Setter = @convention(c) (AnyObject, Selector, Bool) -> Void
      let imp = webView.method(for: sel)
      unsafeBitCast(imp, to: Setter.self)(webView, sel, false)
    } else {
      print("[measure] warn: occlusion detection setter missing; the web view may not draw offscreen")
    }
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

  // MARK: 포커스·보임

  override var takesAllClicks: Bool { offline }

  func sendFocus() {
    bridge.send(["type": "focus", "focused": focused])
    bridge.send(["type": "visible", "visible": visible])
    if Config.debug { dump("focus=\(focused) visible=\(visible)") }
  }

  /// 확인용: 웹 화면의 상태(data-mini-*)를 찍는다
  func dump(_ why: String) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
      self?.webView.evaluateJavaScript(
        "JSON.stringify(Object.assign({}, document.querySelector('main[data-mini]')?.dataset ?? {}))"
      ) { result, _ in
        print("[cubie] \(why) web=\(result ?? "nil") ignores=\(self?.panel.ignoresMouseEvents ?? false)")
        fflush(stdout)
      }
    }
  }

  override func becameKey() {
    panel.makeFirstResponder(webView)
    sendFocus()
  }

  override func resignedKey() { sendFocus() }

  override func occlusionChanged() {
    bridge.send(["type": "visible", "visible": visible])
  }

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
