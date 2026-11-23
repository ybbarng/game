import Testing

@testable import CubieCore

/// 보통 창이 열린 동안만 Dock·⌘Tab에 나온다(docs/52 5-18)
struct AppPresenceTests {
  @Test func noOpenWindowKeepsAppInMenuBarOnly() {
    #expect(AppPresence.forOpenWindows(0, measuring: false) == .menuBarOnly)
  }

  @Test func oneOpenWindowShowsAppInDockAndSwitcher() {
    #expect(AppPresence.forOpenWindows(1, measuring: false) == .dockAndSwitcher)
  }

  @Test func threeOpenWindowsStillShowAppInDockAndSwitcher() {
    #expect(AppPresence.forOpenWindows(3, measuring: false) == .dockAndSwitcher)
  }

  @Test func measuringModeNeverChangesPolicy() {
    #expect(AppPresence.forOpenWindows(0, measuring: true) == nil)
    #expect(AppPresence.forOpenWindows(2, measuring: true) == nil)
  }
}
