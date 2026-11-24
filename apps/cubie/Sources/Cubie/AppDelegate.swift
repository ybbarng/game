import AppKit
import CubieCore
import CubieNativeC
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
  /// 떠 있는 큐브 창(docs/52 5-6)
  private let cube = NativeCubeWindow()
  /// 「공식 보기」 말풍선(큐브 창 옆)
  private let bubble = HintBubble()
  /// 큐브 옆 단축키 표(F1·메뉴 「단축키 보기」, docs/47 15-25)
  private lazy var keys = KeysPanel { [weak cube] n in cube?.keyBindings(n: n) ?? .empty }
  private var statusItem: NSStatusItem!
  private var hotKey: HotKey!
  private var hotKeyOK = false
  /// 큐브 창으로 오기 전 앞에 있던 앱(Esc로 돌려줄 곳)을 기억하는 판단(`CubieCore`, 단위 시험)
  private let focusKeeper = FocusKeeper<RunningApp>(front: RunningApp.front())
  private var escMonitor: Any?
  /// 자동 업데이트(Sparkle). .app으로 띄웠을 때만 켜진다
  private let updater = Updater()
  /// 말풍선에 지금 새 판 알림이 떠 있다(힌트 줄이 오면 그것으로 바뀐다)
  private var updateNoticeShown = false
  private var updateNoticeUp: Bool { updateNoticeShown && bubble.isShown }

  /// 따로 여는 보통 창(투명 아님, 앱이 그린다, docs/52 5-8): 기록, 티어표, 키 배치·색
  enum SheetKind { case records, tiers, settings }
  private var sheets: [SheetKind: NativeSheetWindow] = [:] { didSet { updatePresence() } }
  /// 설정 창의 「모든 설정…」이 여는 사이트 창(앱이 여는 사이트 창은 이것 하나)
  private var siteSettings: NSWindow? { didSet { updatePresence() } }
  /// 사이트 창을 열 때 넣은 앱 저장소 글(닫을 때 사이트에서 바뀐 키만 가려낸다, `WebStoreMerge`)
  private var siteOpened: [String: String]?
  /// 지금 활성화 정책(docs/52 5-18). 처음은 `main.swift`가 둔 `.accessory`, 재기 모드는 `.prohibited`라 nil(바꾸지 않음)
  private var presence: AppPresence? = Config.measure ? nil : .menuBarOnly
  /// 보통 창이 열린 동안만 거는 앱 메뉴(Cubie 끝내기 ⌘Q, 창 닫기 ⌘W·최소화 ⌘M)
  private lazy var appMainMenu: NSMenu = buildMainMenu()
  /// 네이티브 설정 창이 값을 바꿨다: 다음 차례에 한 번만 큐브 창(설정·키 배치만)과 단축키 표가 다시 읽는다
  private lazy var settingsReload = Coalescer(schedule: { f in DispatchQueue.main.async { f() } }) { [weak self] in
    guard let self else { return }
    self.cube.applyStoredSettings()
    self.keys.reload()
  }

  /// 메모리 재기 모드(`Config.measure`)일 때만
  private var nativeMeasure: NativeMeasure?

  func applicationDidFinishLaunching(_ notification: Notification) {
    // 메모리 재기: 메뉴 막대 아이콘·전역 단축키·키 감시 없이 큐브 창만(화면 밖) 띄운다
    if Config.measure {
      do {
        let native = cube
        let m = NativeMeasure(cube: native)
        // 단축키 표·기록 창도 화면 밖에서 띄워 잰다
        m.openKeys = { [weak self] in
          guard let self else { return }
          self.keys.show(cube: Config.measureFrame(side: 96), visible: Config.measureFrame(side: 2000), n: native.state.n)
          native.send(.keysPanel(true))
        }
        m.dropKeys = { [weak self] in
          self?.keys.hide()
          self?.keys.reload()
          native.send(.keysPanel(false))
        }
        // 기록 창·티어표·설정 창도 화면 밖에서 띄워 잰다
        m.window = { [weak self] name, open in
          let kind: SheetKind? =
            switch name {
            case "records": .records
            case "tiers": .tiers
            case "settings": .settings
            default: nil
            }
          if let kind { self?.measureWindow(kind, open: open) }
          // `replay open`: 기록 창을 열고 한 판 다시 보기(네이티브 창만)
          if name == "replay", open {
            self?.measureWindow(.records, open: true)
            (self?.sheets[.records] as? NativeRecordsWindow)?.measureReplay()
          }
          // `editor open|close`: 「사용자」 배치로 두고 설정 창(키 배치 편집기가 펼쳐진 채)을 연다(docs/52 5-8)
          if name == "editor" {
            if open {
              let custom = "customFrom".withCString { o in
                "twoHand".withCString { a in "".withCString { c in NativeCore.string { cubie_keymap_edit(nil, o, a, c, 0, $0, $1) } } }
              }
              native.store.set(KeymapEditorModel.parseEdit(custom).stored, for: StoredKeymap.key)
            }
            self?.measureWindow(.settings, open: open)
          }
        }
        // `pick <티어 0~9>`: 티어표 사다리 칸 누르기(docs/52 5-11)
        m.pickTier = { [weak self] t in (self?.sheets[.tiers] as? NativeTiersWindow)?.page.pick(t) }
        // `place tiers <화면 번호>`: 티어표 창을 그 화면 가운데로(알파 0.01, 마우스는 지나감, 포커스는 그대로). HDR 판정이 창이
        // 놓인 화면을 따르는지 본다(docs/52 5-16). `place tiers off`면 다시 화면 밖으로
        m.placeTiers = { [weak self] arg in
          guard let w = self?.sheets[.tiers]?.window else { return "no window" }
          if let i = Int(arg), NSScreen.screens.indices.contains(i) {
            let s = NSScreen.screens[i].frame
            w.ignoresMouseEvents = true
            w.alphaValue = 0.01
            w.setFrameOrigin(NSPoint(x: s.midX - w.frame.width / 2, y: s.midY - w.frame.height / 2))
          } else if arg != "stay" {
            w.setFrameOrigin(NSPoint(x: -30000, y: -30000))
          }
          let page = (self?.sheets[.tiers] as? NativeTiersWindow)?.page
          return "screen=\(w.screen?.localizedName ?? "nil") hdr=\(page?.hero.hdr == true ? 1 : 0)"
        }
        nativeMeasure = m
      }
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
      // 새 판 말풍선이 떠 있으면: Enter는 설치(Sparkle 창), Esc는 닫기만, 다른 키는 닫고 그대로 큐브에(docs/47 15-12)
      if self.updateNoticeUp, event.window === self.cube.panel, !event.isARepeat {
        let plain = mods.subtracting([.function, .numericPad, .capsLock]).isEmpty
        if plain, event.keyCode == 36 || event.keyCode == 76 {
          self.installFromNotice()
          return nil
        }
        self.hideUpdateNotice()
        if plain, event.keyCode == 53 { return nil }
      }
      // F1(맥북은 fn+F1): 「단축키 보기」. 큐브 옆 표를 켜고 끈다(웹에는 보내지 않는다).
      // 맥북에서 fn 없이 누르면 밝기 키라 앱에 오지 않는다. 힌트 키(\)는 그대로 웹에 간다
      if event.keyCode == UInt16(Config.shortcutsKeyCode), event.window === self.cube.panel,
        mods.subtracting([.function, .numericPad]).isEmpty
      {
        if !event.isARepeat { self.toggleKeys() }
        return nil
      }
      let isEsc = event.keyCode == 53 && mods.subtracting([.function, .numericPad]).isEmpty
      // 큐브 창으로 가는 키: 화면에 닿기 직전에 출처를 알린다(웹은 같은 연결이라 키보다 먼저 닿는다)
      if !isEsc, event.window === self.cube.panel {
        self.cube.keyArriving(event)
      }
      guard isEsc else { return event }
      if self.cube.panel.isKeyWindow {
        // 단축키 표가 떠 있으면 Esc는 표 닫기. 공식 연습 중이면 연습 끝내기(맞추기로 돌아가기). 한 번 더 누르면 이전 앱으로
        if self.keys.isShown {
          self.hideKeys()
        } else if self.cube.state.practice != nil {
          self.cube.send(.practice(stage: nil, see: false))
        } else {
          self.returnFocus()
        }
        return nil
      }
      // 기록·티어표·설정 창은 Esc로 닫는다(설정 창의 키 지정 중에는 편집기 감시가 먼저 먹는다). 「모든 설정…」 사이트 창은
      // 웹 화면의 Esc를 그대로 둔다. 글 칸에 쓰는 중이면 Esc는 글 칸 몫이다(`EscClose`)
      guard let w = event.window else { return event }
      let kind: EscClose.Window =
        if w === self.siteSettings {
          .siteSettings
        } else if self.sheets.values.contains(where: { $0.window === w }) {
          .native
        } else {
          .other
        }
      let editing = (w.firstResponder as? NSText)?.isEditable == true
      guard EscClose.closes(kind, editingText: editing) else { return event }
      w.close()
      return nil
    }

    if Config.debug { listenDebug() }
    cube.onRecorded = { [weak self] in
      (self?.sheets[.records] as? NativeRecordsWindow)?.reload()
      // 티어표 창도 지금 보는 크기로 다시 그린다(내 티어·다음 판 목표·지난 티어가 바뀐다)
      (self?.sheets[.tiers] as? NativeTiersWindow)?.reload()
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

  /// 확인용(CUBIE_DEBUG): 다른 프로세스가 보낸 알림으로 메뉴와 같은 일을 한다(메뉴를 마우스로 누르지 않고 확인).
  /// 알림 이름 `kr.byb.cubie.debug`, object는 "scramble"·"mirror"·"size:4"·"records"·"tiers"·"settings"·"site-settings"(「모든 설정…」)·
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
        case "mirror": self.menuMirror()
        case "size": self.cube.send(.size(Int(parts.last ?? "") ?? 3))
        case "records": self.menuRecords()
        case "tiers": self.menuTiers()
        case "settings": self.menuSettings()
        case "site-settings": self.openSiteSettings()
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

  // MARK: 단축키 표

  /// 표에 보일 큐브 크기(공식 연습은 3×3만)
  private var keysN: Int { cube.state.practice != nil ? 3 : cube.state.n }

  private func toggleKeys() {
    if keys.isShown { hideKeys() } else { showKeys() }
  }

  private func showKeys() {
    keys.show(cube: cube.panel.frame, visible: cubeScreen, n: keysN)
    cube.send(.keysPanel(true))
  }

  private func hideKeys() {
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
      practiceAvailable: !cube.state.practiceStages.isEmpty)
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
    let s = cube.state
    let title = e.title ?? ""
    switch e {
    case .profile:
      // 맨 위 프로필 칸(뷰가 직접 그리고 누르기를 받는다). 누르면 기록 보기
      let i = NSMenuItem(title: cube.profile.name, action: nil, keyEquivalent: "")
      i.view = ProfileMenuView(profile: cube.profile) { [weak self] in self?.menuRecords() }
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
      cube.watchMouse(false)
    } else {
      cube.panel.orderFrontRegardless()
      cube.watchMouse(true)
    }
    cube.sendFocus()
  }

  @objc private func menuScramble() { cube.send(.scramble) }
  @objc private func menuMirror() { cube.send(.toggleMirror) }
  @objc private func menuHint() { cube.send(.hint) }
  /// 공식 연습 단계 고르기(지금 하는 단계를 다시 고르면 새 판). 키를 바로 칠 수 있게 큐브에 키 입력을 준다
  @objc private func menuPracticeStage(_ sender: NSMenuItem) {
    guard let id = sender.representedObject as? String else { return }
    cube.send(.practice(stage: id, see: cube.state.practiceSee))
    if !cube.focused { focusCube() }
  }
  /// 보고 치기 켜고 끄기. 연습 중이면 같은 단계를 새 방식으로 새 판
  @objc private func menuPracticeSee() {
    let s = cube.state
    if let stage = s.practice {
      cube.send(.practice(stage: stage, see: !s.practiceSee))
    } else {
      // 연습 전이면 방식만 기억해 둔다(다음에 고르는 단계가 그 방식으로 열린다)
      cube.setPracticeSee(!s.practiceSee)
    }
  }
  @objc private func menuPracticeStop() { cube.send(.practice(stage: nil, see: false)) }
  /// 사이트 해법 익히기(해법을 고르면 배우기 단원과 공식 연습)를 기본 브라우저로
  @objc private func menuLearn() { NSWorkspace.shared.open(Config.site(Config.learnPath)) }
  @objc private func menuMoveScreen(_ sender: NSMenuItem) {
    let screens = NSScreen.screens
    guard sender.tag >= 0, sender.tag < screens.count else { return }
    let f = WindowPlacement.moved(cube.panel.frame, to: screens[sender.tag].visibleFrame, margin: Config.margin)
    cube.panel.setFrame(f, display: true)
    cube.saveFrame()
  }
  @objc private func menuSize(_ sender: NSMenuItem) { cube.send(.size(sender.tag)) }
  @objc private func menuWindowSize(_ sender: NSMenuItem) { cube.setSide(CGFloat(sender.tag)) }

  @objc private func menuRecords() { openWindow(.records) }
  /// 단축키 표 켜고 끄기. 켜면 바로 키를 쳐 볼 수 있게 큐브에 키 입력을 준다(F1과 같은 일)
  @objc private func menuKeys() {
    // 메뉴가 열린 채 F1을 눌러 이 항목이 불렸다면 메뉴가 키를 받아 큐브 창의 키 감시에는 닿지 않는다. 그래서 여기서 한 번만 한다
    toggleKeys()
    if keys.isShown, !cube.focused { focusCube() }
  }
  /// 티어표를 지금 크기로(이미 열려 있으면 그 크기로 바꾼다)
  @objc private func menuTiers() { openTiers(n: cube.state.n) }
  /// 메뉴 「키 배치·색…」: 사이트의 키·색 설정 화면. 웹 저장소가 앱 것(브라우저와 따로)이라 앱 안에서 정해야 미니 창에 닿는다
  @objc private func menuSettings() { openWindow(.settings) }

  @objc private func menuVsFriends() { NSWorkspace.shared.open(Config.site("/cube/online")) }
  @objc private func menuVsBot() { NSWorkspace.shared.open(Config.site("/cube/vs")) }
  @objc private func menuResetFrame() { cube.resetFrame() }
  @objc private func menuReload() {
    bubble.hide()
    cube.reload()
  }
  @objc private func menuQuit() { NSApp.terminate(nil) }
  @objc private func menuCheckForUpdates() { updater.checkForUpdates() }

  /// 기록·티어표·설정 창을 연다(앱이 그린 창, docs/52 5-8)
  private func openWindow(_ kind: SheetKind, n: Int? = nil) {
    let native = cube
    if let s = sheets[kind] {
      if let n { (s as? NativeTiersWindow)?.show(n) }
      present(s.window)
      return
    }
    let s: NativeSheetWindow
    switch kind {
    case .records:
      let r = NativeRecordsWindow(book: native.book) { [weak native] in native?.settings ?? CubeSettings() }
      r.onTiers = { [weak self] n in self?.openTiers(n: n) }
      s = r
    case .tiers:
      s = NativeTiersWindow(store: native.store, math: RustTierMath(), n: n ?? cube.state.n)
    case .settings:
      // 바꾸면 바로 큐브 창(색·회전 시간·스티커·소리·섞기 연출·키 배치)과 단축키 표가 다시 읽는다. 슬라이더·색 칸을 끄는
      // 동안은 바뀔 때마다 불리니 한 차례에 한 번으로 모은다(`settingsReload`)
      s = NativeSettingsWindow(
        store: native.store,
        onChange: { [weak self] in self?.settingsReload.request() },
        openWeb: { [weak self] in self?.openSiteSettings() })
    }
    s.onClose = { [weak self] in self?.sheets[kind] = nil }
    sheets[kind] = s
    placeNormalWindow(s.window, name: "CubieWindow.\(kind)")
    present(s.window)
  }

  /// 보통 창이 크기·자리를 기억한다(창마다 이름, `FrameMemory`). 처음 열거나 기억한 자리가 화면 밖이면 큐브 창이 있는 화면
  /// 가운데에(`WindowPlacement.normalWindowFrame`). 재기 모드는 화면 밖에 두므로 기억하지 않는다
  private func placeNormalWindow(_ w: NSWindow, name: String) {
    guard !Config.measure else { return }
    let saved = FrameMemory.saved(name)
    let f = WindowPlacement.normalWindowFrame(
      saved: saved, size: w.frame.size, cubeScreen: cube.panel.screen?.visibleFrame,
      screens: NSScreen.screens.map(\.visibleFrame))
    w.setFrame(f, display: false)
    FrameMemory.remember(w, name: name)
    if Config.debug { print("[cubie] place \(name) saved=\(saved.map { "\($0)" } ?? "nil") -> \(f) now=\(w.frame)"); fflush(stdout) }
  }

  /// 연 창을 보인다. 재기 모드는 화면 밖에 두고 앞으로 가져오지 않는다(사용자 화면·포커스를 건드리지 않는다)
  private func present(_ w: NSWindow) {
    if Config.measure {
      w.setFrameOrigin(NSPoint(x: -30000, y: -30000))
      w.orderFrontRegardless()
    } else {
      Self.bringToFront(w)
      if Config.debug { print("[cubie] present \(w.title) frame=\(w.frame)"); fflush(stdout) }
    }
  }

  /// 재기 명령: 창 열기·닫기
  func measureWindow(_ kind: SheetKind, open: Bool) {
    if open {
      openWindow(kind)
    } else {
      sheets[kind]?.window.close()
    }
  }

  /// 티어표를 크기 `n`으로(메뉴 「티어표」, 기록 창 「티어표」)
  private func openTiers(n: Int) { openWindow(.tiers, n: n) }

  /// 설정 창의 「모든 설정…」: 사이트 설정 화면을 보통 창(투명 아님)으로 연다. 앱 저장소의 큐브 글을 문서 시작 때 넣는다
  private func openSiteSettings() {
    if let w = siteSettings {
      present(w)
      return
    }
    let size = NSSize(width: 760, height: 720)
    let config = WKWebViewConfiguration()
    config.websiteDataStore = Config.measure ? .nonPersistent() : .default()
    // 문서가 뜰 때마다 같은 글(연 때의 앱 저장소)을 넣는다. 닫을 때 이 글과 견주어 사이트에서 바뀐 키만 읽어 온다
    let snapshot = storeSnapshot()
    siteOpened = snapshot
    if let js = Self.setItemsJS(snapshot) {
      config.userContentController.addUserScript(
        WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }
    let web = WKWebView(frame: NSRect(origin: .zero, size: size), configuration: config)
    web.load(URLRequest(url: Config.site("/cube/settings"), cachePolicy: PageFreshness.load))
    let w = NSWindow(
      contentRect: web.frame, styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered,
      defer: false)
    // 네이티브 설정 창(「Cubie 키 배치·색」)과 Dock·⌘Tab에서 갈리게 다른 이름
    w.title = "Cubie 모든 설정"
    w.contentView = web
    w.isReleasedWhenClosed = false
    w.delegate = self
    w.center()
    placeNormalWindow(w, name: "CubieSite.settings")
    siteSettings = w
    present(w)
  }

  // MARK: Dock·⌘Tab(docs/52 5-18)
  // 보통 창이 다른 앱 뒤로 가면 ⌘Tab으로 고를 수 없어 찾지 못했다. 보통 창이 하나라도 열린 동안만 보통 앱(`.regular`)으로
  // Dock·⌘Tab·앱 메뉴에 나오고, 모두 닫으면 메뉴 막대 아이콘만(`.accessory`)으로 돌아간다. 판단은 `CubieCore/AppPresence`

  /// 열린 보통 창 수에 맞춰 정책을 바꾼다. `sheets`·`siteSettings`가 바뀔 때마다 불린다
  private func updatePresence() {
    let open = sheets.count + (siteSettings == nil ? 0 : 1)
    guard let want = AppPresence.forOpenWindows(open, measuring: Config.measure),
      want != presence
    else { return }
    switch want {
    case .dockAndSwitcher:
      // 창을 앞으로 가져오기(`bringToFront`) 전에 바꿔야 그 창과 함께 Dock·⌘Tab에 나온다
      presence = want
      NSApp.setActivationPolicy(.regular)
      NSApp.mainMenu = appMainMenu
      if Config.debug { print("[cubie] presence regular"); fflush(stdout) }
    case .menuBarOnly:
      // 창을 닫는 중(`windowWillClose`)에 부르므로 닫기가 끝난 뒤 바꾼다. 그 사이 다시 열었으면 그대로 둔다
      DispatchQueue.main.async { [weak self] in
        guard let self, self.sheets.isEmpty, self.siteSettings == nil, self.presence != .menuBarOnly else { return }
        self.presence = .menuBarOnly
        // 앱 메뉴를 걸어 둔 채면 큐브 창에서 ⌘Q가 앱을 끈다(예전처럼 큐브에 간다)
        NSApp.mainMenu = nil
        NSApp.setActivationPolicy(.accessory)
        if Config.debug { print("[cubie] presence accessory"); fflush(stdout) }
      }
    }
  }

  /// 앱 메뉴(메뉴 막대 첫 칸, 이름은 번들 이름)와 창 메뉴. 큐브 코어는 ⌘ 조합을 ⌘Z 말고 모두 무시하므로(`keymap.rs`
  /// `resolve_action`) 큐브 키와 부딪치지 않는다
  private func buildMainMenu() -> NSMenu {
    let main = NSMenu()
    let appItem = NSMenuItem()
    let appMenu = NSMenu(title: "Cubie")
    let quit = NSMenuItem(title: "Cubie 끝내기", action: #selector(menuQuit), keyEquivalent: "q")
    quit.target = self
    appMenu.addItem(quit)
    appItem.submenu = appMenu
    main.addItem(appItem)
    // 편집: 글 칸(키 배치 가져오기 등)에서 잘라내기·복사·붙여넣기·전체 선택. 표준 동작을 응답 사슬에 보낸다(target nil).
    // 되돌리기 ⌘Z는 두지 않는다(큐브 되돌리기 키라 큐브 창에 가야 한다)
    let editItem = NSMenuItem()
    let editMenu = NSMenu(title: "편집")
    for (title, action, key) in [
      ("잘라내기", #selector(NSText.cut(_:)), "x"), ("복사", #selector(NSText.copy(_:)), "c"),
      ("붙여넣기", #selector(NSText.paste(_:)), "v"), ("전체 선택", #selector(NSText.selectAll(_:)), "a"),
    ] {
      editMenu.addItem(NSMenuItem(title: title, action: action, keyEquivalent: key))
    }
    editItem.submenu = editMenu
    main.addItem(editItem)
    let windowItem = NSMenuItem()
    let windowMenu = NSMenu(title: "창")
    let close = NSMenuItem(title: "닫기", action: #selector(menuCloseWindow), keyEquivalent: "w")
    close.target = self
    windowMenu.addItem(close)
    let mini = NSMenuItem(title: "최소화", action: #selector(menuMinimizeWindow), keyEquivalent: "m")
    mini.target = self
    windowMenu.addItem(mini)
    windowItem.submenu = windowMenu
    main.addItem(windowItem)
    return main
  }

  /// 키를 받는 보통 창(기록·티어표·설정·사이트 창). 큐브 창·단축키 표·말풍선이면 nil(닫거나 줄이지 않는다)
  private var frontNormalWindow: NSWindow? {
    guard let w = NSApp.keyWindow else { return nil }
    let normal = sheets.values.contains { $0.window === w } || w === siteSettings
    return normal ? w : nil
  }

  @objc private func menuCloseWindow() { frontNormalWindow?.performClose(nil) }
  @objc private func menuMinimizeWindow() { frontNormalWindow?.performMiniaturize(nil) }

  /// 메뉴로 연 창을 앞으로. macOS 14부터 `NSApp.activate()`는 요청이라 다른 앱을 쓰던 중이면 거절되어, 첫 번에는
  /// 창이 다른 앱 뒤에 만들어져 안 보이고 두 번째부터 보였다(2026-11-10 사용자 「티어표 같은 걸 눌러도 처음에는 아무것도
  /// 안 뜨고 두 번째부터 뜨는데」). 사용자가 메뉴에서 고른 것이니 단축키(`showCube`)와 같이 바로 앞으로 온다
  static func bringToFront(_ w: NSWindow) {
    NSApp.activate(ignoringOtherApps: true)
    w.makeKeyAndOrderFront(nil)
    w.orderFrontRegardless()
  }

  /// 「모든 설정…」 사이트 창을 닫으면 놓아주고, 사이트에서 바꾼 키·색을 큐브 창·단축키 표·설정 창에 쓴다
  func windowWillClose(_ notification: Notification) {
    guard let w = notification.object as? NSWindow, w === siteSettings else { return }
    siteSettings = nil
    let opened = siteOpened
    siteOpened = nil
    let native = cube
    guard let web = w.contentView as? WKWebView, let opened else {
      cube.reload()
      keys.reload()
      return
    }
    // 사이트 설정 화면에서 바뀐 키만 앱 저장소로 옮긴다(앱이 쓰는 미니 기록 `cube.mini.*`는 빼고). 통째로
    // 덮으면 창이 열린 동안 네이티브 설정 창에서 바꾼 값이 열 때 값으로 되돌아간다(`WebStoreMerge`).
    // 창을 닫는 중이라도 웹 화면은 이 응답이 올 때까지 붙들어 둔다
    web.evaluateJavaScript(Self.readStoreJS) { [weak self] result, _ in
      MainActor.assumeIsolated {
        _ = web
        if let text = result as? String, let data = text.data(using: .utf8),
          let d = (try? JSONSerialization.jsonObject(with: data)) as? [String: String]
        {
          let c = WebStoreMerge.changes(opened: opened, closed: d)
          for (k, v) in c.set { native.store.set(v, for: k) }
          for k in c.removed { native.store.remove(k) }
          if Config.debug { print("[cubie] site settings closed set=\(c.set.keys.sorted()) removed=\(c.removed)"); fflush(stdout) }
        }
        self?.cube.reload()
        self?.keys.reload()
        (self?.sheets[.settings] as? NativeSettingsWindow)?.reload()
      }
    }
  }

  /// 웹 화면의 큐브 저장소(`cube.`로 시작하는 키) 전부를 JSON 글로
  static let readStoreJS =
    "JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('cube.'))"
    + ".map(k => [k, localStorage.getItem(k)])))"

  /// 앱 저장소 글을 localStorage에 넣는 스크립트
  static func setItemsJS(_ d: [String: String]) -> String? {
    guard let data = try? JSONSerialization.data(withJSONObject: d), let json = String(data: data, encoding: .utf8)
    else { return nil }
    return "(function(d){for(var k in d){try{localStorage.setItem(k,d[k])}catch(e){}}})(" + json + ");"
  }

  /// 앱 저장소의 큐브 글 전부(기록·프로필·키 배치·설정). 사이트 설정 화면은 사이트 코드 그대로 이 글을 읽는다
  private func storeSnapshot() -> [String: String] {
    var d: [String: String] = [:]
    for k in cube.store.keys where k.hasPrefix("cube.") { d[k] = cube.store.string(k) }
    return d
  }
}
