import AppKit
import CubieCore

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
/// - 메뉴 막대 아이콘과 창의 오른쪽 누르기 메뉴에서 섞기·큐브 크기·기록·대결·창·키 배치를 고른다(`AppDelegate+Menu`, 짜임은
///   `MenuLayout`). 보통 창(기록·티어표·설정·사이트 창)은 `SheetWindows`, 재기 모드는 `MeasureWiring`이 잇는다.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
  /// 떠 있는 큐브 창(docs/52 5-6)
  let cube = NativeCubeWindow()
  /// 「공식 보기」 말풍선(큐브 창 옆)
  let bubble = HintBubble()
  /// 큐브 옆 단축키 표(F1·메뉴 「단축키 보기」, docs/47 15-25)
  private(set) lazy var keys = KeysPanel { [weak cube] n in cube?.keyBindings(n: n) ?? .empty }
  /// 따로 여는 보통 창(기록·티어표·설정·「모든 설정…」 사이트 창)
  private(set) lazy var sheets = SheetWindows(cube: cube)
  private var statusItem: NSStatusItem!
  private var hotKey: HotKey!
  private(set) var hotKeyOK = false
  /// 큐브 창으로 오기 전 앞에 있던 앱(Esc로 돌려줄 곳)을 기억하는 판단(`CubieCore`, 단위 시험)
  private let focusKeeper = FocusKeeper<RunningApp>(front: RunningApp.front())
  private var escMonitor: Any?
  /// 자동 업데이트(Sparkle). .app으로 띄웠을 때만 켜진다
  let updater = Updater()
  /// 말풍선에 지금 새 판 알림이 떠 있다(힌트 줄이 오면 그것으로 바뀐다)
  private var updateNoticeShown = false
  private var updateNoticeUp: Bool { updateNoticeShown && bubble.isShown }
  /// 네이티브 설정 창이 값을 바꿨다: 다음 차례에 한 번만 큐브 창(설정·키 배치만)과 단축키 표가 다시 읽는다. 슬라이더·색 칸을
  /// 끄는 동안은 바뀔 때마다 불리니 한 차례에 한 번으로 모은다
  private lazy var settingsReload = Coalescer(schedule: { f in DispatchQueue.main.async { f() } }) { [weak self] in
    guard let self else { return }
    self.cube.applyStoredSettings()
    self.keys.reload()
  }

  /// 메모리 재기 모드(`Config.measure`)일 때만
  private var measure: NativeMeasure?

  func applicationDidFinishLaunching(_ notification: Notification) {
    sheets.onSettingsChanged = { [weak self] in self?.settingsReload.request() }
    // 「모든 설정…」 사이트 창을 닫으면 바뀐 키·색을 큐브 창·단축키 표·설정 창에 쓴다
    sheets.onSiteSettingsClosed = { [weak self] in
      self?.cube.reload()
      self?.keys.reload()
      self?.sheets.settings?.reload()
    }
    // 메모리 재기: 메뉴 막대 아이콘·전역 단축키·키 감시 없이 큐브 창만(화면 밖) 띄운다
    if Config.measure {
      measure = MeasureWiring.make(cube: cube, keys: keys, sheets: sheets)
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

    // 앱 안 키 감시: 새 판 말풍선·F1·Esc를 큐브 화면보다 먼저 본다
    escMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
      self?.keyDown(event) ?? event
    }

    if Config.debug { listenDebug() }
    cube.onRecorded = { [weak self] in
      self?.sheets.records?.reload()
      // 티어표 창도 지금 보는 크기로 다시 그린다(내 티어·다음 판 목표·지난 티어가 바뀐다)
      self?.sheets.tiers?.reload()
      // 맞추는 동안 미룬 새 판 알림(큐브에 그대로 있을 때만)
      if self?.cube.focused == true { self?.showUpdateNoticeIfDue() }
    }
    cube.menuProvider = { [weak self] in self?.buildMenu(forWindow: true) ?? NSMenu() }
    cube.onReady = { [weak self] in
      guard let self else { return }
      self.bubble.hide()
      // 다시 불러온 화면에도 단축키 표가 떠 있는지 알린다(떠 있는 동안만 누른 키를 보낸다)
      self.cube.send(.keysPanel(self.keys.isShown))
    }
    cube.onState = { [weak self] in
      guard let self, self.keys.isShown else { return }
      self.keys.setSize(self.keysN)
    }
    cube.onPressed = { [weak self] code in self?.keys.pressed(code) }
    // 다른 앱으로 가면(Esc·⌃⌥⌘C·다른 앱 누르기) 단축키 표도 닫는다. 표는 큐브를 돌릴 때만 쓴다
    NotificationCenter.default.addObserver(
      forName: NSApplication.didResignActiveNotification, object: nil, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated {
        self?.hideKeys()
        self?.hideUpdateNotice()
      }
    }
    cube.onHint = { [weak self] lines in
      guard let self else { return }
      if let lines, !lines.isEmpty, self.cube.panel.isVisible {
        self.updateNoticeShown = false
        self.bubble.show(lines: lines, cube: self.cube.panel.frame, visible: self.cubeScreen)
      } else if !self.updateNoticeUp {
        self.bubble.hide()
      }
    }
    // 창을 옮기면 말풍선도 따라간다
    NotificationCenter.default.addObserver(
      forName: NSWindow.didMoveNotification, object: cube.panel, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated { self?.followCube() }
    }
    // 화면 구성이 바뀌어 창을 다시 놓았을 때도(크기만 줄었거나 창은 그대로인데 화면이 바뀐 때도) 말풍선을 그 화면 안으로
    cube.onPlaced = { [weak self] in self?.followCube() }
    // 큐브·거울을 클릭하면(끌지 않고) ⌃⌥⌘C처럼 큐브에 키 입력을 준다. 누를 때 맥이 이미 창을 앞으로 가져오지만,
    // 그것에만 기대지 않고 키 받는 창까지 확실히 정한다
    cube.onClick = { [weak self] in
      guard let self, !self.cube.focused else { return }
      self.focusCube()
    }
    cube.reload()
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

  // MARK: 앱 안 키 감시

  /// 앱 창으로 가는 키를 화면보다 먼저 본다(갈 곳은 `KeyRoute`). 먹었으면 nil
  private func keyDown(_ event: NSEvent) -> NSEvent? {
    let w = event.window
    let context = KeyRoute.Context(
      toCube: w === cube.panel, cubeIsKey: cube.panel.isKeyWindow, window: w.map(sheets.escKind),
      editingText: (w?.firstResponder as? NSText)?.isEditable == true,
      noticeUp: updateNoticeUp, keysShown: keys.isShown, practicing: cube.state.practice != nil)
    let mods = KeyRoute.Mods(rawValue: event.modifierFlags.intersection(.deviceIndependentFlagsMask).rawValue)
    let d = KeyRoute.route(keyCode: event.keyCode, mods: mods, isRepeat: event.isARepeat, context)
    if d.dismissNotice { hideUpdateNotice() }
    switch d.action {
    case .pass(let keyOrigin):
      if keyOrigin { cube.keyArriving(event) }
      return event
    case .swallow: break
    case .installUpdate: installFromNotice()
    case .toggleKeys: toggleKeys()
    case .hideKeys: hideKeys()
    case .stopPractice: cube.send(.practice(stage: nil, see: false))
    case .returnFocus: returnFocus()
    case .closeWindow: w?.close()
    }
    return nil
  }

  /// 확인용(CUBIE_DEBUG): 다른 프로세스가 보낸 알림으로 메뉴와 같은 일을 한다(메뉴를 마우스로 누르지 않고 확인).
  /// 알림 이름 `kr.byb.cubie.debug`, object는 "scramble"·"reset"(맞춘 상태로)·"hint"·"place:<묶음 id>,<상황 id>"·"mirror"·"size:4"·"records"·"tiers"·"settings"·"site-settings"(「모든 설정…」)·
  /// "visible"(숨기기·보이기)·"reload"·"practice:<단계 id>"(비우면 끝내기)·"keys"·"frame:x,y,w,h"·"dump"
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
        case "reset": self.menuReset()
        case "hint": self.menuHint()
        case "place":
          // "place:<묶음 id>,<상황 id>"(docs/47 16-24)
          let f = (parts.last ?? "").split(separator: ",").map(String.init)
          if f.count == 2 { self.cube.send(.place(set: f[0], id: f[1])) }
        case "mirror": self.menuMirror()
        case "size": self.cube.send(.size(Int(parts.last ?? "") ?? 3))
        case "records": self.menuRecords()
        case "tiers": self.menuTiers()
        case "settings": self.menuSettings()
        case "site-settings": self.sheets.openSiteSettings()
        case "visible": self.menuToggleVisible()
        case "reload": self.menuReload()
        case "practice": self.cube.send(.practice(stage: parts.count > 1 ? parts[1] : nil, see: false))
        case "keys": self.menuKeys()
        case "frame":
          let v = (parts.last ?? "").split(separator: ",").compactMap { Double($0) }
          if v.count == 4 {
            let w = max(Config.minSize.width, v[2])
            let h = max(Config.minSize.height, v[3])
            self.cube.panel.setFrame(NSRect(x: v[0], y: v[1], width: w, height: h), display: true)
          }
        default: self.cube.dump("dump frame=\(self.cube.panel.frame) bubble=\(self.bubble.isShown)")
        }
      }
    }
  }

  /// 큐브 창이 있는 화면의 보이는 영역
  private var cubeScreen: NSRect {
    (cube.panel.screen ?? NSScreen.main ?? NSScreen.screens.first)?.visibleFrame ?? cube.panel.frame
  }

  /// 말풍선·단축키 표가 큐브 창을 따라간다
  private func followCube() {
    bubble.follow(cube: cube.panel.frame, visible: cubeScreen)
    keys.follow(cube: cube.panel.frame, visible: cubeScreen)
  }

  // MARK: 단축키 표

  /// 표에 보일 큐브 크기(공식 연습은 3×3만)
  private var keysN: Int { cube.state.practice != nil ? 3 : cube.state.n }

  func toggleKeys() {
    if keys.isShown { hideKeys() } else { showKeys() }
  }

  private func showKeys() {
    keys.show(cube: cube.panel.frame, visible: cubeScreen, n: keysN)
    cube.send(.keysPanel(true))
  }

  func hideKeys() {
    guard keys.isShown else { return }
    keys.hide()
    cube.send(.keysPanel(false))
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
    cube.watchMouse(true)
    cube.takeKeys()
    showUpdateNoticeIfDue()
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

  // MARK: 새 판 말풍선(docs/47 15-12)
  // 메뉴 막대 아이콘이 가려지면 메뉴 첫 줄의 「새 판 … 설치…」를 못 본다. 사용자가 큐브로 온 순간에만 큐브 옆에 알린다
  // (포커스는 이미 사용자가 옮겼다). 같은 판은 하루에 한 번, 맞추는 중이면 미룬다(`UpdateNotice`)

  private func showUpdateNoticeIfDue() {
    guard let version = updater.pendingVersion, cube.panel.isVisible, !bubble.isShown else { return }
    let d = UserDefaults.standard
    let last = d.string(forKey: UpdateNotice.versionKey).map {
      UpdateNotice.Shown(version: $0, at: Date(timeIntervalSince1970: d.double(forKey: UpdateNotice.atKey)))
    }
    let now = Date()
    guard UpdateNotice.shouldShow(pending: version, last: last, now: now, solving: cube.solving) else { return }
    d.set(version, forKey: UpdateNotice.versionKey)
    d.set(now.timeIntervalSince1970, forKey: UpdateNotice.atKey)
    if Config.debug { print("[cubie] update notice \(version)"); fflush(stdout) }
    updateNoticeShown = true
    bubble.show(
      lines: HintBubble.updateLines(version: version), cube: cube.panel.frame, visible: cubeScreen
    ) { [weak self] in self?.installFromNotice() }
  }

  private func hideUpdateNotice() {
    guard updateNoticeShown else { return }
    updateNoticeShown = false
    bubble.hide()
  }

  private func installFromNotice() {
    hideUpdateNotice()
    updater.checkForUpdates()
  }
}
