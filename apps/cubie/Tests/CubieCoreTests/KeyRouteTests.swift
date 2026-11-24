import Testing

@testable import CubieCore

/// 앱 안 키 감시가 키를 어디로 보내는지(`KeyRoute`)
struct KeyRouteTests {
  private let letterJ: UInt16 = 38

  private func route(
    _ key: UInt16, _ c: KeyRoute.Context, mods: KeyRoute.Mods = [], repeat r: Bool = false
  ) -> KeyRoute.Decision {
    KeyRoute.route(keyCode: key, mods: mods, isRepeat: r, c)
  }

  private let cube = KeyRoute.Context(toCube: true, cubeIsKey: true, window: .other)
  private let sheet = KeyRoute.Context(window: .native)

  private func with(_ base: KeyRoute.Context, _ change: (inout KeyRoute.Context) -> Void) -> KeyRoute.Context {
    var c = base
    change(&c)
    return c
  }

  // MARK: 새 판 말풍선

  @Test func enterOnUpdateNoticeInstalls() {
    let c = with(cube) { $0.noticeUp = true }
    #expect(route(KeyRoute.returnKey, c) == KeyRoute.Decision(.installUpdate))
    #expect(route(KeyRoute.keypadEnter, c, mods: .numericPad) == KeyRoute.Decision(.installUpdate))
  }

  @Test func escOnUpdateNoticeOnlyClosesIt() {
    let c = with(cube) {
      $0.noticeUp = true
      $0.keysShown = true
    }
    #expect(route(KeyRoute.escape, c) == KeyRoute.Decision(dismissNotice: true, .swallow))
  }

  @Test func otherKeyClosesNoticeAndStillTurnsCube() {
    let c = with(cube) { $0.noticeUp = true }
    #expect(route(letterJ, c) == KeyRoute.Decision(dismissNotice: true, .pass(keyOrigin: true)))
    #expect(route(KeyRoute.returnKey, c, mods: .shift) == KeyRoute.Decision(dismissNotice: true, .pass(keyOrigin: true)))
  }

  @Test func repeatedKeyLeavesNoticeUp() {
    let c = with(cube) { $0.noticeUp = true }
    #expect(route(letterJ, c, repeat: true) == KeyRoute.Decision(.pass(keyOrigin: true)))
  }

  // MARK: F1

  @Test func f1TogglesShortcutsOnlyOnCubeWindow() {
    #expect(route(KeyRoute.shortcutsKey, cube, mods: .function) == KeyRoute.Decision(.toggleKeys))
    #expect(route(KeyRoute.shortcutsKey, cube, mods: .function, repeat: true) == KeyRoute.Decision(.swallow))
    #expect(route(KeyRoute.shortcutsKey, sheet, mods: .function) == KeyRoute.Decision(.pass(keyOrigin: false)))
    #expect(route(KeyRoute.shortcutsKey, cube, mods: [.function, .shift]) == KeyRoute.Decision(.pass(keyOrigin: true)))
  }

  // MARK: Esc

  @Test func escOnCubeClosesShortcutsThenPracticeThenReturnsFocus() {
    var c = with(cube) {
      $0.keysShown = true
      $0.practicing = true
    }
    #expect(route(KeyRoute.escape, c) == KeyRoute.Decision(.hideKeys))
    c.keysShown = false
    #expect(route(KeyRoute.escape, c) == KeyRoute.Decision(.stopPractice))
    c.practicing = false
    #expect(route(KeyRoute.escape, c) == KeyRoute.Decision(.returnFocus))
  }

  @Test func escWithModifierIsAnOrdinaryCubeKey() {
    #expect(route(KeyRoute.escape, cube, mods: .shift) == KeyRoute.Decision(.pass(keyOrigin: true)))
  }

  @Test func escClosesNativeSheetButNotWhileEditingText() {
    #expect(route(KeyRoute.escape, sheet) == KeyRoute.Decision(.closeWindow))
    #expect(route(KeyRoute.escape, with(sheet) { $0.editingText = true }) == KeyRoute.Decision(.pass(keyOrigin: false)))
  }

  @Test func escIsLeftToSiteSettingsPage() {
    #expect(route(KeyRoute.escape, KeyRoute.Context(window: .siteSettings)) == KeyRoute.Decision(.pass(keyOrigin: false)))
  }

  @Test func ordinaryKeyToSheetCarriesNoKeyOrigin() {
    #expect(route(letterJ, sheet) == KeyRoute.Decision(.pass(keyOrigin: false)))
  }
}
