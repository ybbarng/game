import Testing

@testable import CubieCore

/// 보통 창 Esc 닫기
struct EscCloseTests {
  @Test func nativeWindowClosesOnEsc() {
    #expect(EscClose.closes(.native, editingText: false) == true)
  }

  @Test func nativeWindowStaysOpenWhileEditingText() {
    #expect(EscClose.closes(.native, editingText: true) == false)
  }

  @Test func siteSettingsWindowLeavesEscToPage() {
    #expect(EscClose.closes(.site(settings: true), editingText: false) == false)
    #expect(EscClose.closes(.site(settings: false), editingText: false) == true)
  }

  @Test func otherWindowsNeverClose() {
    #expect(EscClose.closes(.other, editingText: false) == false)
  }
}
