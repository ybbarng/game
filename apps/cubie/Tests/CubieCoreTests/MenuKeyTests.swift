import Testing

@testable import CubieCore

struct MenuKeyTests {
  @Test func 기본_섞기_키_Enter는_리턴() {
    #expect(MenuKey.fromWeb(code: "Enter") == MenuKey(key: "\r"))
  }

  @Test func 글자_키는_소문자와_수식() {
    #expect(MenuKey.fromWeb(code: "KeyR", shift: true) == MenuKey(key: "r", shift: true))
    #expect(MenuKey.fromWeb(code: "Digit3", alt: true, ctrl: true) == MenuKey(key: "3", option: true, control: true))
  }

  @Test func 기호와_특수_키() {
    #expect(MenuKey.fromWeb(code: "Semicolon")?.key == ";")
    #expect(MenuKey.fromWeb(code: "Space")?.key == " ")
    #expect(MenuKey.fromWeb(code: "ArrowLeft")?.key == "\u{F702}")
    #expect(MenuKey.fromWeb(code: "F2")?.key == "\u{F705}")
  }

  @Test func 앱이_가로채는_키와_모르는_키는_달지_않는다() {
    #expect(MenuKey.fromWeb(code: "Escape") == nil)
    #expect(MenuKey.fromWeb(code: "F1") == nil)
    #expect(MenuKey.fromWeb(code: "Numpad5") == nil)
    #expect(MenuKey.fromWeb(code: "") == nil)
  }

  @Test func F1은_AppKit_기능_키_글자() {
    #expect(MenuKey.f1 == "\u{F704}")
  }

  @Test func 단축키_보기는_F1_힌트는_웹_힌트_키와_같은_역슬래시() {
    #expect(MenuKey.shortcuts == MenuKey(key: MenuKey.f1))
    // 웹 `HINT_KEYS`("Backslash")를 메뉴 글자로 바꾼 것과 같다
    #expect(MenuKey.hint == MenuKey.fromWeb(code: "Backslash"))
  }
}
