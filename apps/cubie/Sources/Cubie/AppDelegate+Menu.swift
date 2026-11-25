import AppKit
import CubieCore

/// 메뉴 막대 아이콘 메뉴와 큐브 위 오른쪽 클릭 메뉴(같은 길로 만든다). 차례와 구분선은 `MenuLayout`(CubieCore, 단위 시험)이
/// 정하고, 여기서는 항목마다 AppKit 항목을 만들고 고른 일을 한다
extension AppDelegate {
  func menuNeedsUpdate(_ menu: NSMenu) {
    menu.removeAllItems()
    for item in buildMenu(forWindow: false).items {
      item.menu?.removeItem(item)
      menu.addItem(item)
    }
  }

  func buildMenu(forWindow: Bool) -> NSMenu {
    let entries = MenuLayout.main(
      forWindow: forWindow, hotKeyOK: hotKeyOK,
      pendingUpdate: updater.pendingVersion != nil, updaterAvailable: updater.isAvailable,
      practiceAvailable: !cube.state.practiceStages.isEmpty, placeAvailable: !cube.state.placeSets.isEmpty)
    return menu(of: entries)
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
      let p = cube.profile
      i.view = ProfileMenuView(profile: p, sway: MenuEmblemSway.make(p)) { [weak self] in self?.menuRecords() }
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
    case .reset:
      return [item(title, #selector(menuReset), key: s.resetKey)]
    case .hint:
      return [item(title, #selector(menuHint), key: MenuKey.hint)]
    case .place:
      return [submenu(title, menu(of: MenuLayout.place(sets: s.placeSets)))]
    case .placeSet(let id, _):
      guard let set = s.placeSets.first(where: { $0.id == id }) else { return [] }
      let i = submenu(title, menu(of: MenuLayout.placeCases(set)))
      i.state = s.placedSet == id ? .on : .off
      return [i]
    case .placeCase(let set, let id, _):
      let i = item(title, #selector(menuPlace(_:)), on: s.placedSet == set && s.placedCase == id)
      i.representedObject = [set, id]
      return [i]
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

  // MARK: 고른 일

  @objc func menuFocus() {
    // 메뉴가 열린 채 ⌃⌥⌘C를 눌러 이 항목이 불렸다면 전역 단축키도 같은 키를 받는다. 두 번 하지 않게 단축키 쪽에 맡긴다
    if hotKeyOK, NSApp.currentEvent?.type == .keyDown { return }
    focusCube()
  }

  @objc func menuToggleVisible() {
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

  @objc func menuScramble() { cube.send(.scramble) }
  /// 맞춘 상태로(맞추던 판은 기록 없이 끝난다, 묻지 않는다). 공식 연습 중이면 끝내고 맞추던 판을 맞춘 상태로
  @objc func menuReset() { cube.send(.reset) }
  /// 상황 놓기(같은 상황을 다시 고르면 처음부터). 바로 돌릴 수 있게 큐브에 키 입력을 준다
  @objc func menuPlace(_ sender: NSMenuItem) {
    guard let f = sender.representedObject as? [String], f.count == 2 else { return }
    cube.send(.place(set: f[0], id: f[1]))
    if !cube.focused { focusCube() }
  }
  @objc func menuMirror() { cube.send(.toggleMirror) }
  @objc func menuHint() { cube.send(.hint) }
  /// 공식 연습 단계 고르기(지금 하는 단계를 다시 고르면 새 판). 키를 바로 칠 수 있게 큐브에 키 입력을 준다
  @objc func menuPracticeStage(_ sender: NSMenuItem) {
    guard let id = sender.representedObject as? String else { return }
    cube.send(.practice(stage: id, see: cube.state.practiceSee))
    if !cube.focused { focusCube() }
  }
  /// 보고 치기 켜고 끄기. 연습 중이면 같은 단계를 새 방식으로 새 판
  @objc func menuPracticeSee() {
    let s = cube.state
    if let stage = s.practice {
      cube.send(.practice(stage: stage, see: !s.practiceSee))
    } else {
      // 연습 전이면 방식만 기억해 둔다(다음에 고르는 단계가 그 방식으로 열린다)
      cube.setPracticeSee(!s.practiceSee)
    }
  }
  @objc func menuPracticeStop() { cube.send(.practice(stage: nil, see: false)) }
  /// 사이트 해법 익히기(해법을 고르면 배우기 단원과 공식 연습)를 기본 브라우저로
  @objc func menuLearn() { NSWorkspace.shared.open(Config.site(Config.learnPath)) }
  @objc func menuMoveScreen(_ sender: NSMenuItem) {
    let screens = NSScreen.screens
    guard sender.tag >= 0, sender.tag < screens.count else { return }
    let f = WindowPlacement.moved(cube.panel.frame, to: screens[sender.tag].visibleFrame, margin: Config.margin)
    cube.panel.setFrame(f, display: true)
    cube.saveFrame()
  }
  @objc func menuSize(_ sender: NSMenuItem) { cube.send(.size(sender.tag)) }
  @objc func menuWindowSize(_ sender: NSMenuItem) { cube.setSide(CGFloat(sender.tag)) }

  @objc func menuRecords() { sheets.open(.records) }
  /// 단축키 표 켜고 끄기. 켜면 바로 키를 쳐 볼 수 있게 큐브에 키 입력을 준다(F1과 같은 일)
  @objc func menuKeys() {
    // 메뉴가 열린 채 F1을 눌러 이 항목이 불렸다면 메뉴가 키를 받아 큐브 창의 키 감시에는 닿지 않는다. 그래서 여기서 한 번만 한다
    toggleKeys()
    if keys.isShown, !cube.focused { focusCube() }
  }
  /// 티어표를 지금 크기로(이미 열려 있으면 그 크기로 바꾼다). 지금 크기는 메뉴 「큐브 크기」로 고른 사용자 크기다:
  /// 상황 놓기로 3×3을 잠시 든 동안에도 고른 크기로 연다(기록 창과 같다, docs/47 16-28)
  @objc func menuTiers() { sheets.open(.tiers, n: cube.book.n) }
  /// 메뉴 「키 배치·색…」: 앱이 그린 키·색 설정 창
  @objc func menuSettings() { sheets.open(.settings) }

  @objc func menuVsFriends() { NSWorkspace.shared.open(Config.site("/cube/online")) }
  @objc func menuVsBot() { NSWorkspace.shared.open(Config.site("/cube/vs")) }
  @objc func menuResetFrame() { cube.resetFrame() }
  @objc func menuReload() {
    bubble.hide()
    cube.reload()
  }
  @objc func menuQuit() { NSApp.terminate(nil) }
  @objc func menuCheckForUpdates() { updater.checkForUpdates() }
}
