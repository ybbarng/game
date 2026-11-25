import AppKit
import CubieCore
import WebKit

/// 따로 여는 보통 창(투명 아님): 앱이 그린 기록·티어표·키 배치와 색 창(docs/52 5-8)과 설정 창의 「모든 설정…」 사이트 창.
/// - 열기·앞으로·크기와 자리 기억(`FrameMemory`)
/// - 보통 창이 열린 동안만 Dock·⌘Tab과 앱 메뉴(docs/52 5-18, 판단은 `AppPresence`)
/// - 사이트 창은 앱 저장소 글을 넣어 열고 닫을 때 바뀐 키만 읽어 온다(`WebStoreSync`)
@MainActor
final class SheetWindows: NSObject, NSWindowDelegate {
  enum Kind { case records, tiers, settings }

  private let cube: NativeCubeWindow
  /// 설정 창이 값을 바꿨다(큐브 창·단축키 표가 다시 읽는다)
  var onSettingsChanged: (() -> Void)?
  /// 사이트 창을 닫아 앱 저장소가 바뀌었을 수 있다
  var onSiteSettingsClosed: (() -> Void)?

  private(set) var sheets: [Kind: NativeSheetWindow] = [:] { didSet { updatePresence() } }
  /// 설정 창의 「모든 설정…」이 여는 사이트 창(앱이 여는 사이트 창은 이것 하나)
  private(set) var siteSettings: NSWindow? { didSet { updatePresence() } }
  /// 사이트 창을 열 때 넣은 앱 저장소 글(닫을 때 사이트에서 바뀐 키만 가려낸다)
  private var siteOpened: [String: String]?
  /// 지금 활성화 정책. 처음은 `main.swift`가 둔 `.accessory`, 재기 모드는 `.prohibited`라 nil(바꾸지 않음)
  private var presence: AppPresence? = Config.measure ? nil : .menuBarOnly
  /// 보통 창이 열린 동안만 거는 앱 메뉴(Cubie 끝내기 ⌘Q, 편집, 창 닫기 ⌘W·최소화 ⌘M)
  private lazy var appMainMenu: NSMenu = buildMainMenu()

  init(cube: NativeCubeWindow) {
    self.cube = cube
  }

  var records: NativeRecordsWindow? { sheets[.records] as? NativeRecordsWindow }
  var tiers: NativeTiersWindow? { sheets[.tiers] as? NativeTiersWindow }
  var settings: NativeSettingsWindow? { sheets[.settings] as? NativeSettingsWindow }

  /// Esc 닫기 판단(`EscClose`)에 넘길 창 갈래
  func escKind(_ w: NSWindow) -> EscClose.Window {
    if w === siteSettings { return .siteSettings }
    if sheets.values.contains(where: { $0.window === w }) { return .native }
    return .other
  }

  // MARK: 열기

  /// 기록·티어표·설정 창을 연다. 이미 열려 있으면 앞으로(티어표는 `n`이 있으면 그 크기로)
  func open(_ kind: Kind, n: Int? = nil) {
    if let s = sheets[kind] {
      if let n { (s as? NativeTiersWindow)?.show(n) }
      present(s.window)
      return
    }
    let s: NativeSheetWindow
    switch kind {
    case .records:
      let r = NativeRecordsWindow(book: cube.book) { [weak cube] in cube?.settings ?? CubeSettings() }
      r.onTiers = { [weak self] n in self?.open(.tiers, n: n) }
      s = r
    case .tiers:
      s = NativeTiersWindow(store: cube.store, math: RustTierMath(), n: n ?? cube.book.n)
    case .settings:
      // 바꾸면 바로 큐브 창(색·회전 시간·스티커·소리·섞기 연출·키 배치)과 단축키 표가 다시 읽는다
      s = NativeSettingsWindow(
        store: cube.store,
        onChange: { [weak self] in self?.onSettingsChanged?() },
        openWeb: { [weak self] in self?.openSiteSettings() })
    }
    s.onClose = { [weak self] in self?.sheets[kind] = nil }
    sheets[kind] = s
    place(s.window, name: "CubieWindow.\(kind)")
    present(s.window)
  }

  func close(_ kind: Kind) {
    sheets[kind]?.window.close()
  }

  /// 설정 창의 「모든 설정…」: 사이트 설정 화면을 보통 창으로 연다. 앱 저장소의 큐브 글을 문서 시작 때 넣는다
  func openSiteSettings() {
    if let w = siteSettings {
      present(w)
      return
    }
    let size = NSSize(width: 760, height: 720)
    let config = WKWebViewConfiguration()
    config.websiteDataStore = Config.measure ? .nonPersistent() : .default()
    // 문서가 뜰 때마다 같은 글(연 때의 앱 저장소)을 넣는다. 닫을 때 이 글과 견주어 사이트에서 바뀐 키만 읽어 온다
    let snapshot = WebStoreSync.snapshot(cube.store)
    siteOpened = snapshot
    if let js = WebStoreSync.setItemsJS(snapshot) {
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
    place(w, name: "CubieSite.settings")
    siteSettings = w
    present(w)
  }

  /// 「모든 설정…」 사이트 창을 닫으면 놓아주고, 사이트에서 바꾼 키만 앱 저장소로 옮긴다(앱이 쓰는 미니 기록
  /// `cube.mini.*`는 빼고). 통째로 덮으면 창이 열린 동안 네이티브 설정 창에서 바꾼 값이 열 때 값으로 되돌아간다
  func windowWillClose(_ notification: Notification) {
    guard let w = notification.object as? NSWindow, w === siteSettings else { return }
    siteSettings = nil
    let opened = siteOpened
    siteOpened = nil
    guard let web = w.contentView as? WKWebView, let opened else {
      onSiteSettingsClosed?()
      return
    }
    // 창을 닫는 중이라도 웹 화면은 이 응답이 올 때까지 붙들어 둔다
    web.evaluateJavaScript(WebStoreSync.readStoreJS) { [weak self] result, _ in
      MainActor.assumeIsolated {
        _ = web
        guard let self else { return }
        let c = WebStoreSync.applyClosed(result: result, opened: opened, to: self.cube.store)
        if Config.debug, let c {
          print("[cubie] site settings closed set=\(c.set.keys.sorted()) removed=\(c.removed)"); fflush(stdout)
        }
        self.onSiteSettingsClosed?()
      }
    }
  }

  // MARK: 자리·앞으로

  /// 보통 창이 크기·자리를 기억한다(창마다 이름, `FrameMemory`). 처음 열거나 기억한 자리가 화면 밖이면 큐브 창이 있는 화면
  /// 가운데에(`WindowPlacement.normalWindowFrame`). 재기 모드는 화면 밖에 두므로 기억하지 않는다
  private func place(_ w: NSWindow, name: String) {
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

  /// 메뉴로 연 창을 앞으로. macOS 14부터 `NSApp.activate()`는 요청이라 다른 앱을 쓰던 중이면 거절되어, 첫 번에는
  /// 창이 다른 앱 뒤에 만들어져 안 보이고 두 번째부터 보였다(2026-11-10 사용자 「티어표 같은 걸 눌러도 처음에는 아무것도
  /// 안 뜨고 두 번째부터 뜨는데」). 사용자가 메뉴에서 고른 것이니 단축키(`showCube`)와 같이 바로 앞으로 온다
  static func bringToFront(_ w: NSWindow) {
    NSApp.activate(ignoringOtherApps: true)
    w.makeKeyAndOrderFront(nil)
    w.orderFrontRegardless()
  }

  // MARK: Dock·⌘Tab(docs/52 5-18)
  // 보통 창이 다른 앱 뒤로 가면 ⌘Tab으로 고를 수 없어 찾지 못했다. 보통 창이 하나라도 열린 동안만 보통 앱(`.regular`)으로
  // Dock·⌘Tab·앱 메뉴에 나오고, 모두 닫으면 메뉴 막대 아이콘만(`.accessory`)으로 돌아간다. 판단은 `CubieCore/AppPresence`

  private var openCount: Int { sheets.count + (siteSettings == nil ? 0 : 1) }

  /// 열린 보통 창 수에 맞춰 정책을 바꾼다. `sheets`·`siteSettings`가 바뀔 때마다 불린다
  private func updatePresence() {
    guard let want = AppPresence.forOpenWindows(openCount, measuring: Config.measure), want != presence else { return }
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
        guard let self, self.openCount == 0, self.presence != .menuBarOnly else { return }
        self.presence = .menuBarOnly
        // 앱 메뉴를 걸어 둔 채면 큐브 창에서 ⌘Q가 앱을 끈다(예전처럼 큐브에 간다)
        NSApp.mainMenu = nil
        NSApp.setActivationPolicy(.accessory)
        if Config.debug { print("[cubie] presence accessory"); fflush(stdout) }
      }
    }
  }

  /// 앱 메뉴(메뉴 막대 첫 칸, 이름은 번들 이름)·편집·창 메뉴. 큐브 코어는 ⌘ 조합을 ⌘Z 말고 모두 무시하므로(`keymap.rs`
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
    return escKind(w) == .other ? nil : w
  }

  @objc private func menuQuit() { NSApp.terminate(nil) }
  @objc private func menuCloseWindow() { frontNormalWindow?.performClose(nil) }
  @objc private func menuMinimizeWindow() { frontNormalWindow?.performMiniaturize(nil) }
}
