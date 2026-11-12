import AppKit
import WebKit

/// 메모리 재기 모드(`CUBIE_MEASURE=1`, `scripts/measure-memory.sh`가 띄운다).
/// 큐브 창은 화면 밖에 투명하게 떠 있고(`CubeWindow.hideForMeasure`), 상태는 표준 입력 한 줄 명령으로 바꾼다.
/// 표준 입력만 받으므로 띄운 스크립트 말고는 명령을 보낼 수 없다. 알림은 `[measure] …` 줄로 표준 출력에 찍는다.
///
/// 명령: `focus 1|0`(웹에 포커스 알림) · `scramble` · `mirror 1|0` · `size <n>`(큐브 크기) · `side <pt>`(창 한 변) ·
/// `turns <개수>`(키를 눌러 면 돌리기, 0.12초 간격) · `show` · `hide`(메뉴 「숨기기」처럼 창을 내린다) ·
/// `keys load|drop`(단축키 표 웹 화면을 화면 밖에 불러오기·버리기) · `state` · `quit`
@MainActor
final class Measure {
  private let cube: CubeWindow
  /// 단축키 표와 같은 웹 화면(재기 전용, 화면 밖)
  private var keysWindow: NSWindow?
  /// 기록 창과 같은 웹 화면(재기 전용, 화면 밖)
  private var recordsWindow: NSWindow?

  init(cube: CubeWindow) {
    self.cube = cube
    cube.bridge.onReady = { [weak self] in
      guard let self else { return }
      self.cube.sendFocus()
      self.cube.bridge.send(["type": "caps", "hintBubble": true])
      self.report("ready")
    }
    let input = FileHandle.standardInput
    input.readabilityHandler = { [weak self] h in
      let data = h.availableData
      if data.isEmpty {
        // 스크립트가 끝나 입력이 닫히면 앱도 끝낸다(남지 않게)
        h.readabilityHandler = nil
        Task { @MainActor in NSApp.terminate(nil) }
        return
      }
      let lines = String(decoding: data, as: UTF8.self).split(whereSeparator: \.isNewline).map(String.init)
      Task { @MainActor in
        for l in lines { self?.run(l) }
      }
    }
    cube.load()
    cube.panel.orderFrontRegardless()
    log("started pid=\(getpid()) side=\(Int(cube.panel.frame.width)) scale=\(cube.panel.backingScaleFactor)")
  }

  private func log(_ s: String) {
    print("[measure] \(s)")
    fflush(stdout)
  }

  /// 웹 화면 프로세스 번호(비공개 속성 `_webProcessIdentifier`)와 웹이 보는 화면 값
  private func report(_ why: String) {
    let pid = (cube.webView.value(forKey: "_webProcessIdentifier") as? Int) ?? 0
    cube.webView.evaluateJavaScript(
      """
      JSON.stringify({dpr: devicePixelRatio,
        canvas: [...document.querySelectorAll('canvas')].map(c => c.width + 'x' + c.height),
        mini: Object.assign({}, document.querySelector('main[data-mini]')?.dataset ?? {})})
      """
    ) { [weak self] result, _ in
      self?.log("\(why) web=\(pid) \(result as? String ?? "")")
    }
  }

  private func run(_ line: String) {
    let parts = line.split(separator: " ").map(String.init)
    guard let cmd = parts.first else { return }
    let arg = parts.count > 1 ? parts[1] : ""
    switch cmd {
    case "focus":
      cube.measureFocus = arg == "1"
      cube.sendFocus()
    case "scramble":
      cube.bridge.send(["type": "scramble"])
    case "mirror":
      cube.bridge.send(["type": "mirror", "on": arg == "1"])
    case "size":
      cube.bridge.send(["type": "size", "n": Int(arg) ?? 3])
    case "side":
      let side = CGFloat(Double(arg) ?? Double(Config.defaultSize.width))
      var f = cube.panel.frame
      f.size = NSSize(width: side, height: side)
      cube.panel.setFrame(f, display: true)
    case "turns":
      // 두 손 배치의 손가락 자리 키(어느 배치든 면 돌리기가 대부분). 웹은 합성 키도 같은 길로 받는다
      let count = Int(arg) ?? 20
      cube.webView.evaluateJavaScript(
        """
        (() => { const codes = ['KeyJ','KeyF','KeyI','KeyE','KeyK','KeyD','KeyH','KeyG','KeyL','KeyS'];
          for (let i = 0; i < \(count); i++) setTimeout(() => {
            const code = codes[i % codes.length];
            const key = code.slice(3).toLowerCase();
            window.dispatchEvent(new KeyboardEvent('keydown', {code, key, bubbles: true}));
            window.dispatchEvent(new KeyboardEvent('keyup', {code, key, bubbles: true}));
          }, i * 120); })()
        """, completionHandler: nil)
    case "show":
      cube.panel.orderFrontRegardless()
      cube.sendFocus()
    case "hide":
      cube.measureFocus = false
      cube.panel.orderOut(nil)
      cube.sendFocus()
    case "keys":
      if arg == "load" { loadKeys() } else { dropKeys() }
    case "records":
      if arg == "open" {
        if recordsWindow == nil {
          recordsWindow = offscreen("/cube/mini?view=records", size: NSSize(width: 380, height: 600))
        }
      } else {
        recordsWindow?.orderOut(nil)
        recordsWindow?.contentView = nil
        recordsWindow = nil
      }
    case "practice":
      // 공식 연습: 메뉴 첫 단계(따라 치기)를 연다. `practice stop`이면 끝내기
      if arg == "stop" {
        cube.bridge.send(["type": "practice", "stage": NSNull()])
      } else if let first = cube.bridge.state.practiceStages.first {
        cube.bridge.send(["type": "practice", "stage": first.id, "mode": "follow"])
      }
    case "state":
      report("state")
    case "quit":
      NSApp.terminate(nil)
    default:
      log("unknown command: \(line)")
    }
  }

  /// `KeysPanel`과 같은 설정의 웹 화면을 화면 밖 창에 불러온다(단축키 표를 한 번 띄운 뒤의 무게를 잰다)
  private func loadKeys() {
    guard keysWindow == nil else { return }
    let size = Config.keysPanelSize
    let config = WKWebViewConfiguration()
    // 큐브 창과 같은 저장소(실제 앱도 단축키 표와 큐브 창이 같은 저장소를 쓴다)
    config.websiteDataStore = cube.webView.configuration.websiteDataStore
    let web = WKWebView(frame: NSRect(origin: .zero, size: size), configuration: config)
    web.setValue(false, forKey: "drawsBackground")
    web.load(URLRequest(url: Config.site("/cube/mini?view=keys&panel=1&n=3")))
    let w = NSWindow(
      contentRect: NSRect(x: -30000, y: -32000, width: size.width, height: size.height),
      styleMask: [.borderless], backing: .buffered, defer: false)
    w.alphaValue = 0
    w.ignoresMouseEvents = true
    w.isReleasedWhenClosed = false
    w.collectionBehavior = [.transient, .ignoresCycle]
    w.contentView = web
    w.orderFrontRegardless()
    keysWindow = w
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
      let pid = (web.value(forKey: "_webProcessIdentifier") as? Int) ?? 0
      self?.log("keys web=\(pid)")
    }
  }

  /// 앱이 따로 여는 보통 창(기록 창)과 같은 설정의 웹 화면을 화면 밖 창에
  private func offscreen(_ path: String, size: NSSize) -> NSWindow {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = cube.webView.configuration.websiteDataStore
    let web = WKWebView(frame: NSRect(origin: .zero, size: size), configuration: config)
    web.load(URLRequest(url: Config.site(path)))
    let w = NSWindow(
      contentRect: NSRect(x: -30000, y: -33000, width: size.width, height: size.height),
      styleMask: [.borderless], backing: .buffered, defer: false)
    w.alphaValue = 0
    w.ignoresMouseEvents = true
    w.isReleasedWhenClosed = false
    w.collectionBehavior = [.transient, .ignoresCycle]
    w.contentView = web
    w.orderFrontRegardless()
    return w
  }

  private func dropKeys() {
    guard let w = keysWindow else { return }
    w.orderOut(nil)
    w.contentView = nil
    keysWindow = nil
    log("keys dropped")
  }
}
