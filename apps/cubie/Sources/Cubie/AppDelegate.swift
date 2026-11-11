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

/// Cubie: 화면 구석에 늘 떠 있는 큐브 창(docs/47 15절).
/// - ⌃⌥⌘C(`Config.hotKey*`)를 누르면 그때 앞에 있던 앱을 기억하고 큐브 창에 키 입력을 준다. 다시 누르면 돌려준다.
/// - 큐브 창이 키를 받는 동안 Esc를 누르면 기억한 앱으로 돌아가고 창은 그대로 떠 있다.
/// - F1(맥북은 fn+F1)은 큐브 옆 단축키 표를 켜고 끈다. 표는 키를 받지 않아 보면서 친 키가 그대로 큐브로 간다(`KeysPanel`).
/// - 메뉴 막대 아이콘과 창의 오른쪽 누르기 메뉴에서 섞기·큐브 크기·기록·대결·창·키 배치를 고른다(짜임은 `MenuLayout`).
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate, NSWindowDelegate {
  private let cube = CubeWindow()
  /// 「공식 보기」 말풍선(큐브 창 옆)
  private let bubble = HintBubble()
  /// 큐브 옆 단축키 표(F1·메뉴 「단축키 보기」, docs/47 15-25)
  private let keys = KeysPanel()
  private var statusItem: NSStatusItem!
  private var hotKey: HotKey!
  private var hotKeyOK = false
  /// 큐브 창으로 오기 전 앞에 있던 앱(Esc로 돌려줄 곳)을 기억하는 판단(`CubieCore`, 단위 시험)
  private let focusKeeper = FocusKeeper<RunningApp>(front: RunningApp.front())
  private var escMonitor: Any?
  /// 자동 업데이트(Sparkle). .app으로 띄웠을 때만 켜진다
  private let updater = Updater()

  /// 따로 여는 보통 창(투명 아님): 기록, 티어표, 키 배치·색. 단축키는 0.1.9부터 창이 아니라 큐브 옆 표(`KeysPanel`)
  enum WebWindow { case records, tiers, settings }
  private var webWindows: [WebWindow: NSWindow] = [:]

  /// 메모리 재기 모드(`Config.measure`)일 때만
  private var measure: Measure?

  func applicationDidFinishLaunching(_ notification: Notification) {
    // 메모리 재기: 메뉴 막대 아이콘·전역 단축키·키 감시 없이 큐브 창만(화면 밖) 띄운다
    if Config.measure {
      measure = Measure(cube: cube)
      return
    }
    statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    statusItem.button?.image = Self.menuIcon("MenuIcon", fallback: "cube", label: "Cubie")
    let menu = NSMenu()
    menu.delegate = self
    statusItem.menu = menu

    hotKey = HotKey { [weak self] in self?.toggleFocus() }
    hotKeyOK = hotKey.register(keyCode: Config.hotKeyCode, modifiers: Config.hotKeyModifiers)
    if Config.debug { print("[cubie] hotkey \(Config.hotKeyLabel) registered=\(hotKeyOK)"); fflush(stdout) }
    if !hotKeyOK {
      // 다른 앱이 이미 잡았다: 메뉴 막대 아이콘에 표시하고 메뉴 첫 줄에 알린다
      statusItem.button?.image = Self.menuIcon(
        "MenuIconWarn", fallback: "exclamationmark.triangle", label: "Cubie 단축키 실패")
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
      // F1(맥북은 fn+F1): 「단축키 보기」. 큐브 옆 표를 켜고 끈다(웹에는 보내지 않는다).
      // 맥북에서 fn 없이 누르면 밝기 키라 앱에 오지 않는다. 힌트 키(\)는 그대로 웹에 간다
      if event.keyCode == UInt16(Config.shortcutsKeyCode), event.window === self.cube.panel,
        mods.subtracting([.function, .numericPad]).isEmpty
      {
        if !event.isARepeat { self.toggleKeys() }
        return nil
      }
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
        // 단축키 표가 떠 있으면 Esc는 표 닫기. 공식 연습 중이면 연습 끝내기(맞추기로 돌아가기). 한 번 더 누르면 이전 앱으로
        if self.keys.isShown {
          self.hideKeys()
        } else if self.cube.bridge.state.practice != nil {
          self.cube.bridge.send(["type": "practice", "stage": NSNull()])
        } else {
          self.returnFocus()
        }
        return nil
      }
      // 기록·티어표 창은 Esc로 닫는다(설정 창은 웹 화면의 Esc를 그대로 둔다)
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
    cube.bridge.onReady = { [weak self] in
      guard let self else { return }
      self.cube.sendFocus()
      // 이 앱이 말풍선을 그린다고 알린다(0.1.2 이하 앱은 보내지 않아 웹이 창 안에 작게 보인다)
      self.cube.bridge.send(["type": "caps", "hintBubble": true])
      self.bubble.hide()
      // 다시 불러온 화면에도 단축키 표가 떠 있는지 알린다(떠 있는 동안만 누른 키를 보낸다)
      self.cube.bridge.send(["type": "keysPanel", "open": self.keys.isShown])
    }
    cube.bridge.onState = { [weak self] in
      guard let self, self.keys.isShown else { return }
      self.keys.setSize(self.keysN)
    }
    cube.bridge.onPressed = { [weak self] code in self?.keys.pressed(code) }
    // 다른 앱으로 가면(Esc·⌃⌥⌘C·다른 앱 누르기) 단축키 표도 닫는다. 표는 큐브를 돌릴 때만 쓴다
    NotificationCenter.default.addObserver(
      forName: NSApplication.didResignActiveNotification, object: nil, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated { self?.hideKeys() }
    }
    cube.bridge.onHint = { [weak self] lines in
      guard let self else { return }
      if let lines, !lines.isEmpty, self.cube.panel.isVisible {
        self.bubble.show(lines: lines, cube: self.cube.panel.frame, visible: self.cubeScreen)
      } else {
        self.bubble.hide()
      }
    }
    // 창을 옮기면 말풍선도 따라간다
    NotificationCenter.default.addObserver(
      forName: NSWindow.didMoveNotification, object: cube.panel, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated {
        guard let self else { return }
        self.bubble.follow(cube: self.cube.panel.frame, visible: self.cubeScreen)
        self.keys.follow(cube: self.cube.panel.frame, visible: self.cubeScreen)
      }
    }
    // 화면 구성이 바뀌어 창을 다시 놓았을 때도(크기만 줄었거나 창은 그대로인데 화면이 바뀐 때도) 말풍선을 그 화면 안으로
    cube.onPlaced = { [weak self] in
      guard let self else { return }
      self.bubble.follow(cube: self.cube.panel.frame, visible: self.cubeScreen)
      self.keys.follow(cube: self.cube.panel.frame, visible: self.cubeScreen)
    }
    // 큐브·거울을 클릭하면(끌지 않고) ⌃⌥⌘C처럼 큐브에 키 입력을 준다. 누를 때 맥이 이미 창을 앞으로 가져오지만,
    // 그것에만 기대지 않고 키 받는 창까지 확실히 정한다
    cube.onClick = { [weak self] in
      guard let self, !self.cube.focused else { return }
      self.focusCube()
    }
    cube.load()
    cube.panel.orderFrontRegardless()
  }

  /// 메뉴 막대 아이콘: .app 안 Resources의 템플릿 그림(1x·2x, 맥이 막대 색에 맞춰 칠한다).
  /// .app 밖에서 실행 파일만 띄웠으면 그림이 없어 SF Symbol로 대신한다
  private static func menuIcon(_ name: String, fallback: String, label: String) -> NSImage? {
    if let image = Bundle.main.image(forResource: name) {
      image.size = NSSize(width: 18, height: 18)
      image.isTemplate = true
      image.accessibilityDescription = label
      return image
    }
    return NSImage(systemSymbolName: fallback, accessibilityDescription: label)
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

  /// 큐브 창이 있는 화면의 보이는 영역
  private var cubeScreen: NSRect {
    (cube.panel.screen ?? NSScreen.main ?? NSScreen.screens.first)?.visibleFrame ?? cube.panel.frame
  }

  // MARK: 단축키 표

  /// 표에 보일 큐브 크기(공식 연습은 3×3만)
  private var keysN: Int { cube.bridge.state.practice != nil ? 3 : cube.bridge.state.n }

  private func toggleKeys() {
    if keys.isShown { hideKeys() } else { showKeys() }
  }

  private func showKeys() {
    keys.show(cube: cube.panel.frame, visible: cubeScreen, n: keysN)
    cube.bridge.send(["type": "keysPanel", "open": true])
  }

  private func hideKeys() {
    guard keys.isShown else { return }
    keys.hide()
    cube.bridge.send(["type": "keysPanel", "open": false])
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

  /// `key`: 오른쪽에 보일 단축키(맥 표준 표시). 메뉴가 열려 있을 때 그 키를 누르면 이 항목이 실행되고 키는 메뉴가 받는다
  /// (큐브 창에 다시 닿지 않는다). 닫혀 있을 때는 메뉴가 키를 받지 않는다(주 메뉴가 아니다). 실제로 그 키로 되는 항목에만 단다
  private func item(
    _ title: String, _ action: Selector, key: MenuKey? = nil, tag: Int = 0, on: Bool = false
  ) -> NSMenuItem {
    let i = NSMenuItem(title: title, action: action, keyEquivalent: key?.key ?? "")
    if let key {
      var mods: NSEvent.ModifierFlags = []
      if key.shift { mods.insert(.shift) }
      if key.option { mods.insert(.option) }
      if key.control { mods.insert(.control) }
      if key.command { mods.insert(.command) }
      i.keyEquivalentModifierMask = mods
    }
    i.target = self
    i.tag = tag
    i.state = on ? .on : .off
    return i
  }

  /// 차례와 구분선은 `MenuLayout`(CubieCore, 단위 시험)이 정하고, 여기서는 항목마다 AppKit 항목을 만든다
  private func buildMenu(forWindow: Bool) -> NSMenu {
    let entries = MenuLayout.main(
      forWindow: forWindow, hotKeyOK: hotKeyOK,
      pendingUpdate: updater.pendingVersion != nil, updaterAvailable: updater.isAvailable,
      practiceAvailable: !cube.bridge.state.practiceStages.isEmpty)
    return menu(of: entries)
  }

  private func menu(of entries: [MenuEntry]) -> NSMenu {
    let m = NSMenu()
    for e in entries {
      for i in items(for: e) { m.addItem(i) }
    }
    return m
  }

  private func submenu(_ title: String, _ sub: NSMenu) -> NSMenuItem {
    let i = NSMenuItem(title: title, action: nil, keyEquivalent: "")
    i.submenu = sub
    return i
  }

  private func items(for e: MenuEntry) -> [NSMenuItem] {
    let s = cube.bridge.state
    let title = e.title ?? ""
    switch e {
    case .profile:
      // 맨 위 프로필 칸(뷰가 직접 그리고 누르기를 받는다). 누르면 기록 보기
      let i = NSMenuItem(title: cube.bridge.profile.name, action: nil, keyEquivalent: "")
      i.view = ProfileMenuView(profile: cube.bridge.profile) { [weak self] in self?.menuRecords() }
      return [i]
    case .separator:
      return [.separator()]
    case .hotKeyWarning:
      let warn = NSMenuItem(title: "단축키 \(Config.hotKeyLabel)를 다른 앱이 쓰고 있어요", action: nil, keyEquivalent: "")
      warn.isEnabled = false
      return [warn]
    case .installUpdate:
      return [item("새 판 \(updater.pendingVersion ?? "") 설치…", #selector(menuCheckForUpdates))]
    case .focus:
      // 전역 단축키는 잡았을 때만 보인다(못 잡았으면 그 키는 다른 앱이 받는다)
      return [item(title, #selector(menuFocus), key: hotKeyOK ? Config.hotKeyMenuKey : nil)]
    case .toggleVisible:
      return [item(cube.panel.isVisible ? "숨기기" : "보이기", #selector(menuToggleVisible))]
    case .scramble:
      return [item(title, #selector(menuScramble), key: s.scrambleKey)]
    case .hint:
      return [item(title, #selector(menuHint), key: MenuKey.hint)]
    case .practice:
      return [submenu(title, menu(of: MenuLayout.practice(stages: s.practiceStages)))]
    case .practiceGroup:
      return [NSMenuItem.sectionHeader(title: title)]
    case .practiceStage(let id, _):
      let i = item(title, #selector(menuPracticeStage(_:)), on: s.practice == id)
      i.representedObject = id
      return [i]
    case .practiceSee:
      return [item(title, #selector(menuPracticeSee), on: s.practiceSee)]
    case .practiceStop:
      let i = item(title, #selector(menuPracticeStop))
      i.isEnabled = s.practice != nil
      return [i]
    case .cubeSize:
      // 「창」 안의 창 크기와 헷갈리지 않게 「큐브 크기」
      let sizes = NSMenu()
      for n in 2...7 {
        sizes.addItem(item("\(n)×\(n)", #selector(menuSize(_:)), tag: n, on: s.n == n))
      }
      return [submenu(title, sizes)]
    case .records:
      return [item(title, #selector(menuRecords))]
    case .tiers:
      return [item(title, #selector(menuTiers))]
    case .versus:
      let vs = NSMenu()
      vs.addItem(item("친구와 대결", #selector(menuVsFriends)))
      vs.addItem(item("컴퓨터와 대결", #selector(menuVsBot)))
      return [submenu(title, vs)]
    case .learn:
      return [item(title, #selector(menuLearn))]
    case .window:
      return [submenu(title, menu(of: MenuLayout.window(multipleScreens: NSScreen.screens.count > 1)))]
    case .windowSizes:
      // 핀치·⌘ + 스크롤·손잡이로도 바꾼다
      let nowSide = WindowGesture.preset(of: cube.panel.frame.size, in: Config.sizePresets.map(\.side))
      return Config.sizePresets.map { p in
        item("\(p.label) \(Int(p.side))", #selector(menuWindowSize(_:)), tag: Int(p.side), on: nowSide == p.side)
      }
    case .moveScreen:
      // 모니터가 둘 이상일 때만(MenuLayout): 고른 화면의 오른쪽 아래로(큐브를 끌어서도 옮길 수 있다)
      let screens = NSScreen.screens
      let now = WindowPlacement.screenIndex(of: cube.panel.frame, screens: screens.map(\.visibleFrame))
      let list = NSMenu()
      for (i, screen) in screens.enumerated() {
        list.addItem(item(screen.localizedName, #selector(menuMoveScreen(_:)), tag: i, on: i == now))
      }
      return [submenu(title, list)]
    case .mirror:
      return [item(title, #selector(menuMirror), on: s.mirror)]
    case .resetFrame:
      return [item(title, #selector(menuResetFrame))]
    case .keySettings:
      return [item(title, #selector(menuSettings))]
    case .shortcuts:
      return [item(title, #selector(menuKeys), key: MenuKey.shortcuts, on: keys.isShown)]
    case .reload:
      return [item(title, #selector(menuReload))]
    case .checkForUpdates:
      return [item(title, #selector(menuCheckForUpdates))]
    case .quit:
      return [item(title, #selector(menuQuit))]
    }
  }

  @objc private func menuFocus() {
    // 메뉴가 열린 채 ⌃⌥⌘C를 눌러 이 항목이 불렸다면 전역 단축키도 같은 키를 받는다. 두 번 하지 않게 단축키 쪽에 맡긴다
    if hotKeyOK, NSApp.currentEvent?.type == .keyDown { return }
    focusCube()
  }

  @objc private func menuToggleVisible() {
    if cube.panel.isVisible {
      if cube.focused { returnFocus() }
      bubble.hide()
      hideKeys()
      cube.panel.orderOut(nil)
    } else {
      cube.panel.orderFrontRegardless()
    }
    cube.sendFocus()
  }

  @objc private func menuScramble() { cube.bridge.send(["type": "scramble"]) }
  @objc private func menuMirror() { cube.bridge.send(["type": "mirror"]) }
  @objc private func menuHint() { cube.bridge.send(["type": "hint"]) }
  /// 공식 연습 단계 고르기(지금 하는 단계를 다시 고르면 새 판). 키를 바로 칠 수 있게 큐브에 키 입력을 준다
  @objc private func menuPracticeStage(_ sender: NSMenuItem) {
    guard let id = sender.representedObject as? String else { return }
    let s = cube.bridge.state
    cube.bridge.send(["type": "practice", "stage": id, "mode": s.practiceSee ? "see" : "follow"])
    if !cube.focused { focusCube() }
  }
  /// 보고 치기 켜고 끄기. 연습 중이면 같은 단계를 새 방식으로 새 판
  @objc private func menuPracticeSee() {
    let s = cube.bridge.state
    let mode = s.practiceSee ? "follow" : "see"
    if let stage = s.practice {
      cube.bridge.send(["type": "practice", "stage": stage, "mode": mode])
    } else {
      // 연습 전이면 방식만 기억해 둔다(다음에 고르는 단계가 그 방식으로 열린다)
      cube.bridge.setPracticeSee(!s.practiceSee)
    }
  }
  @objc private func menuPracticeStop() { cube.bridge.send(["type": "practice", "stage": NSNull()]) }
  /// 사이트 해법 익히기(해법을 고르면 배우기 단원과 공식 연습)를 기본 브라우저로
  @objc private func menuLearn() { NSWorkspace.shared.open(Config.site(Config.learnPath)) }
  @objc private func menuMoveScreen(_ sender: NSMenuItem) {
    let screens = NSScreen.screens
    guard sender.tag >= 0, sender.tag < screens.count else { return }
    let f = WindowPlacement.moved(cube.panel.frame, to: screens[sender.tag].visibleFrame, margin: Config.margin)
    cube.panel.setFrame(f, display: true)
    cube.saveFrame()
  }
  @objc private func menuSize(_ sender: NSMenuItem) { cube.bridge.send(["type": "size", "n": sender.tag]) }
  @objc private func menuWindowSize(_ sender: NSMenuItem) { cube.setSide(CGFloat(sender.tag)) }

  @objc private func menuRecords() { openWebWindow(.records) }
  /// 단축키 표 켜고 끄기. 켜면 바로 키를 쳐 볼 수 있게 큐브에 키 입력을 준다(F1과 같은 일)
  @objc private func menuKeys() {
    // 메뉴가 열린 채 F1을 눌러 이 항목이 불렸다면 메뉴가 키를 받아 큐브 창의 키 감시에는 닿지 않는다. 그래서 여기서 한 번만 한다
    toggleKeys()
    if keys.isShown, !cube.focused { focusCube() }
  }
  /// 사이트 티어표를 지금 크기로(이미 열려 있으면 그 크기로 다시 연다)
  @objc private func menuTiers() {
    if let w = webWindows[.tiers], let web = w.contentView as? WKWebView {
      web.load(URLRequest(url: Config.site("/cube/tiers?n=\(cube.bridge.state.n)")))
    }
    openWebWindow(.tiers)
  }
  /// 메뉴 「키 배치·색…」: 사이트의 키·색 설정 화면. 웹 저장소가 앱 것(브라우저와 따로)이라 앱 안에서 정해야 미니 창에 닿는다
  @objc private func menuSettings() { openWebWindow(.settings) }

  @objc private func menuVsFriends() { NSWorkspace.shared.open(Config.site("/cube/online")) }
  @objc private func menuVsBot() { NSWorkspace.shared.open(Config.site("/cube/vs")) }
  @objc private func menuResetFrame() { cube.resetFrame() }
  @objc private func menuReload() {
    bubble.hide()
    cube.load()
  }
  @objc private func menuQuit() { NSApp.terminate(nil) }
  @objc private func menuCheckForUpdates() { updater.checkForUpdates() }

  /// 기록·티어표·설정을 보통 창(투명 아님)으로 연다. 떠 있는 창과 같은 웹 저장소를 쓴다
  private func openWebWindow(_ kind: WebWindow) {
    if let w = webWindows[kind] {
      Self.bringToFront(w)
      return
    }
    let (path, title, size): (String, String, NSSize) =
      switch kind {
      case .records: ("/cube/mini?view=records", "Cubie 기록", NSSize(width: 380, height: 600))
      case .tiers: ("/cube/tiers?n=\(cube.bridge.state.n)", "Cubie 티어표", NSSize(width: 760, height: 760))
      case .settings: ("/cube/settings", "Cubie 키 배치·색", NSSize(width: 760, height: 720))
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
    Self.bringToFront(w)
  }

  /// 메뉴로 연 창을 앞으로. macOS 14부터 `NSApp.activate()`는 요청이라 다른 앱을 쓰던 중이면 거절되어, 첫 번에는
  /// 창이 다른 앱 뒤에 만들어져 안 보이고 두 번째부터 보였다(2026-11-10 사용자 「티어표 같은 걸 눌러도 처음에는 아무것도
  /// 안 뜨고 두 번째부터 뜨는데」). 사용자가 메뉴에서 고른 것이니 단축키(`showCube`)와 같이 바로 앞으로 온다
  static func bringToFront(_ w: NSWindow) {
    NSApp.activate(ignoringOtherApps: true)
    w.makeKeyAndOrderFront(nil)
    w.orderFrontRegardless()
  }

  /// 창을 닫으면 놓아준다. 설정 창이면 미니 창을 다시 불러와 바뀐 키·색을 쓴다
  func windowWillClose(_ notification: Notification) {
    guard let w = notification.object as? NSWindow,
      let kind = webWindows.first(where: { $0.value === w })?.key
    else { return }
    webWindows[kind] = nil
    if kind == .settings {
      cube.load()
      keys.reload()
    }
  }
}
