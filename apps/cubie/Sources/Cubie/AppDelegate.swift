import AppKit
import CubieCore
import WebKit

/// 실제 앱을 포커스 판단(`FocusKeeper`)에 넘기는 껍질
final class RunningApp: FocusApp {
  let app: NSRunningApplication
  init(_ app: NSRunningApplication) { self.app = app }
  var isSelf: Bool { app == NSRunningApplication.current }
  var isTerminated: Bool { app.isTerminated }
  static func front() -> RunningApp? { NSWorkspace.shared.frontmostApplication.map(RunningApp.init) }
}

/// Cubie: 화면 구석에 늘 떠 있는 큐브 창(docs/47 14절).
/// - ⌃⌥⌘C(`Config.hotKey*`)를 누르면 그때 앞에 있던 앱을 기억하고 큐브 창에 키 입력을 준다. 다시 누르면 돌려준다.
/// - 큐브 창이 키를 받는 동안 Esc를 누르면 기억한 앱으로 돌아가고 창은 그대로 떠 있다.
/// - 메뉴 막대 아이콘과 창의 오른쪽 누르기 메뉴에서 섞기·거울·크기·기록·대결·설정을 고른다.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate, NSWindowDelegate {
  private let cube = CubeWindow()
  private var statusItem: NSStatusItem!
  private var hotKey: HotKey!
  private var hotKeyOK = false
  /// 큐브 창으로 오기 전 앞에 있던 앱(Esc로 돌려줄 곳)을 기억하는 판단(`CubieCore`, 단위 시험)
  private let focusKeeper = FocusKeeper<RunningApp>(front: RunningApp.front())
  private var escMonitor: Any?

  /// 따로 여는 보통 창(투명 아님): 기록, 단축키, 키·색 설정
  enum WebWindow { case records, keys, settings }
  private var webWindows: [WebWindow: NSWindow] = [:]

  func applicationDidFinishLaunching(_ notification: Notification) {
    statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    statusItem.button?.image = NSImage(systemSymbolName: "cube", accessibilityDescription: "Cubie")
    let menu = NSMenu()
    menu.delegate = self
    statusItem.menu = menu

    hotKey = HotKey { [weak self] in self?.toggleFocus() }
    hotKeyOK = hotKey.register(keyCode: Config.hotKeyCode, modifiers: Config.hotKeyModifiers)
    if Config.debug { print("[cubie] hotkey \(Config.hotKeyLabel) registered=\(hotKeyOK)"); fflush(stdout) }
    if !hotKeyOK {
      // 다른 앱이 이미 잡았다: 메뉴 막대 아이콘에 표시하고 메뉴 첫 줄에 알린다
      statusItem.button?.image = NSImage(
        systemSymbolName: "exclamationmark.triangle", accessibilityDescription: "Cubie 단축키 실패")
    }

    // 다른 앱이 앞으로 올 때마다 기억한다(창을 직접 눌러 왔을 때도 Esc로 돌아갈 곳)
    NSWorkspace.shared.notificationCenter.addObserver(
      forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
    ) { [weak self] note in
      let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
      MainActor.assumeIsolated {
        if Config.debug { print("[cubie] activated: \(app?.localizedName ?? "?")"); fflush(stdout) }
        self?.focusKeeper.activated(app.map(RunningApp.init))
      }
    }

    // Esc: 큐브 창이 키를 받는 동안만 가로챈다(웹 화면에는 가지 않는다)
    escMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
      guard let self else { return event }
      let mods = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
      let isEsc = event.keyCode == 53 && mods.subtracting([.function, .numericPad]).isEmpty
      // 큐브 창으로 가는 키: 웹 화면에 닿기 직전에 출처를 알린다(같은 연결이라 키보다 먼저 닿는다)
      if !isEsc, event.window === self.cube.panel {
        let source = KeySource.of(event)
        if Config.debug, let f = KeySource.fields(event) {
          print("[cubie] key code=\(event.keyCode) repeat=\(event.isARepeat) source=\(source.rawValue) \(f)")
          fflush(stdout)
        }
        self.cube.bridge.send(["type": "key", "source": source.rawValue])
      }
      guard isEsc else { return event }
      if self.cube.panel.isKeyWindow {
        self.returnFocus()
        return nil
      }
      // 기록·단축키 창은 Esc로 닫는다(설정 창은 웹 화면의 Esc를 그대로 둔다)
      if let w = event.window, let kind = self.webWindows.first(where: { $0.value === w })?.key,
        kind != .settings
      {
        w.close()
        return nil
      }
      return event
    }

    if Config.debug { listenDebug() }
    cube.webView.menuProvider = { [weak self] in self?.buildMenu(forWindow: true) ?? NSMenu() }
    cube.bridge.onReady = { [weak self] in self?.cube.sendFocus() }
    cube.load()
    cube.panel.orderFrontRegardless()
  }

  func applicationWillTerminate(_ notification: Notification) {
    hotKey?.unregister()
    if let escMonitor { NSEvent.removeMonitor(escMonitor) }
  }

  /// 확인용(CUBIE_DEBUG): 다른 프로세스가 보낸 알림으로 메뉴와 같은 일을 한다(메뉴를 마우스로 누르지 않고 확인).
  /// 알림 이름 `kr.byb.cubie.debug`, object는 "scramble"·"mirror"·"size:4"·"records"·"keys"·"frame:x,y,w,h"·"dump"
  private func listenDebug() {
    DistributedNotificationCenter.default().addObserver(
      forName: Notification.Name("kr.byb.cubie.debug"), object: nil, queue: .main
    ) { [weak self] note in
      let cmd = note.object as? String ?? ""
      MainActor.assumeIsolated {
        guard let self else { return }
        print("[cubie] debug \(cmd)"); fflush(stdout)
        let parts = cmd.split(separator: ":", maxSplits: 1).map(String.init)
        switch parts.first {
        case "scramble": self.menuScramble()
        case "mirror": self.menuMirror()
        case "size": self.cube.bridge.send(["type": "size", "n": Int(parts.last ?? "") ?? 3])
        case "records": self.menuRecords()
        case "keys": self.menuKeys()
        case "frame":
          let v = (parts.last ?? "").split(separator: ",").compactMap { Double($0) }
          if v.count == 4 {
            let w = max(Config.minSize.width, v[2])
            let h = max(Config.minSize.height, v[3])
            self.cube.panel.setFrame(NSRect(x: v[0], y: v[1], width: w, height: h), display: true)
          }
        default: self.cube.dumpWebState("dump frame=\(self.cube.panel.frame)")
        }
      }
    }
  }

  // MARK: 포커스

  func toggleFocus() {
    if Config.debug { print("[cubie] hotkey pressed; focused=\(cube.focused)"); fflush(stdout) }
    switch focusKeeper.hotKey(cubeFocused: cube.focused, front: RunningApp.front()) {
    case .returnFocus: returnFocus()
    case .focusCube: showCube()
    }
  }

  /// 메뉴 「큐브로 가기」·「기록 보기」 등: 지금 앞 앱을 기억하고 큐브로
  func focusCube() {
    focusKeeper.activated(RunningApp.front())
    showCube()
  }

  private func showCube() {
    // macOS 14부터 `activate()`는 요청이라 앞 앱이 내주지 않으면 곧 되돌아간다(단축키로 받은 포커스를 바로 잃었다).
    // 단축키는 사용자가 누른 것이니 예전 방식으로 바로 앞으로 온다
    NSApp.activate(ignoringOtherApps: true)
    cube.panel.makeKeyAndOrderFront(nil)
    cube.panel.makeFirstResponder(cube.webView)
  }

  /// 기억한 앱을 앞으로. 큐브 창은 그대로 떠 있다
  func returnFocus() {
    let target = focusKeeper.returnTarget()
    if Config.debug { print("[cubie] return to \(target?.app.localizedName ?? "nil")"); fflush(stdout) }
    if let target {
      target.app.activate()
    } else {
      NSApp.hide(nil)
      cube.panel.orderFrontRegardless()
    }
  }

  // MARK: 메뉴

  func menuNeedsUpdate(_ menu: NSMenu) {
    menu.removeAllItems()
    for item in buildMenu(forWindow: false).items {
      item.menu?.removeItem(item)
      menu.addItem(item)
    }
  }

  private func item(_ title: String, _ action: Selector, key: String = "", tag: Int = 0, on: Bool = false)
    -> NSMenuItem
  {
    let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
    i.target = self
    i.tag = tag
    i.state = on ? .on : .off
    return i
  }

  private func buildMenu(forWindow: Bool) -> NSMenu {
    let m = NSMenu()
    let s = cube.bridge.state
    if !hotKeyOK {
      let warn = NSMenuItem(title: "단축키 \(Config.hotKeyLabel)를 다른 앱이 쓰고 있어요", action: nil, keyEquivalent: "")
      warn.isEnabled = false
      m.addItem(warn)
      m.addItem(.separator())
    }
    if !forWindow {
      m.addItem(item("큐브로 가기 (\(Config.hotKeyLabel))", #selector(menuFocus)))
      m.addItem(item(cube.panel.isVisible ? "숨기기" : "보이기", #selector(menuToggleVisible)))
      m.addItem(.separator())
    }
    m.addItem(item("섞기", #selector(menuScramble)))
    m.addItem(item("거울", #selector(menuMirror), on: s.mirror))
    let sizes = NSMenu()
    for n in 2...7 {
      sizes.addItem(item("\(n)×\(n)", #selector(menuSize(_:)), tag: n, on: s.n == n))
    }
    let sizeItem = NSMenuItem(title: "크기", action: nil, keyEquivalent: "")
    sizeItem.submenu = sizes
    m.addItem(sizeItem)
    m.addItem(item("기록 보기", #selector(menuRecords)))
    let vs = NSMenu()
    vs.addItem(item("친구와 대결", #selector(menuVsFriends)))
    vs.addItem(item("컴퓨터와 대결", #selector(menuVsBot)))
    let vsItem = NSMenuItem(title: "대결하기", action: nil, keyEquivalent: "")
    vsItem.submenu = vs
    m.addItem(vsItem)
    m.addItem(.separator())
    m.addItem(item("단축키 보기", #selector(menuKeys)))
    m.addItem(item("키·색 설정…", #selector(menuSettings)))
    m.addItem(item("창 자리 처음으로", #selector(menuResetFrame)))
    m.addItem(item("다시 불러오기", #selector(menuReload)))
    if !forWindow {
      m.addItem(.separator())
      m.addItem(item("Cubie 끝내기", #selector(menuQuit)))
    }
    return m
  }

  @objc private func menuFocus() { focusCube() }

  @objc private func menuToggleVisible() {
    if cube.panel.isVisible {
      if cube.focused { returnFocus() }
      cube.panel.orderOut(nil)
    } else {
      cube.panel.orderFrontRegardless()
    }
    cube.sendFocus()
  }

  @objc private func menuScramble() { cube.bridge.send(["type": "scramble"]) }
  @objc private func menuMirror() { cube.bridge.send(["type": "mirror"]) }
  @objc private func menuSize(_ sender: NSMenuItem) { cube.bridge.send(["type": "size", "n": sender.tag]) }

  @objc private func menuRecords() { openWebWindow(.records) }
  @objc private func menuKeys() { openWebWindow(.keys) }
  /// 사이트의 키·색 설정. 웹 저장소가 앱 것(브라우저와 따로)이라 앱 안에서 정해야 미니 창에 닿는다
  @objc private func menuSettings() { openWebWindow(.settings) }

  @objc private func menuVsFriends() { NSWorkspace.shared.open(Config.site("/cube/online")) }
  @objc private func menuVsBot() { NSWorkspace.shared.open(Config.site("/cube/vs")) }
  @objc private func menuResetFrame() { cube.resetFrame() }
  @objc private func menuReload() { cube.load() }
  @objc private func menuQuit() { NSApp.terminate(nil) }

  /// 기록·단축키·설정을 보통 창(투명 아님)으로 연다. 떠 있는 창과 같은 웹 저장소를 쓴다
  private func openWebWindow(_ kind: WebWindow) {
    if let w = webWindows[kind] {
      NSApp.activate()
      w.makeKeyAndOrderFront(nil)
      return
    }
    let (path, title, size): (String, String, NSSize) =
      switch kind {
      case .records: ("/cube/mini?view=records", "Cubie 기록", NSSize(width: 360, height: 480))
      case .keys: ("/cube/mini?view=keys", "Cubie 단축키", NSSize(width: 780, height: 560))
      case .settings: ("/cube/settings", "Cubie 키·색 설정", NSSize(width: 760, height: 720))
      }
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .default()
    let web = WKWebView(frame: NSRect(origin: .zero, size: size), configuration: config)
    web.load(URLRequest(url: Config.site(path)))
    let w = NSWindow(
      contentRect: web.frame, styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered,
      defer: false)
    w.title = title
    w.contentView = web
    w.isReleasedWhenClosed = false
    w.delegate = self
    w.center()
    webWindows[kind] = w
    NSApp.activate()
    w.makeKeyAndOrderFront(nil)
  }

  /// 창을 닫으면 놓아준다. 설정 창이면 미니 창을 다시 불러와 바뀐 키·색을 쓴다
  func windowWillClose(_ notification: Notification) {
    guard let w = notification.object as? NSWindow,
      let kind = webWindows.first(where: { $0.value === w })?.key
    else { return }
    webWindows[kind] = nil
    if kind == .settings { cube.load() }
  }
}
