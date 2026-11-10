import Testing

@testable import CubieCore

struct MenuLayoutTests {
  private func titles(_ entries: [MenuEntry]) -> [String] {
    entries.map { e in
      switch e {
      case .separator: "—"
      case .hotKeyWarning: "(경고)"
      case .installUpdate: "(새 판)"
      case .toggleVisible: "(숨기기·보이기)"
      case .windowSizes: "(창 크기 넷)"
      default: e.title ?? "?"
      }
    }
  }

  @Test func 메뉴_막대_메뉴의_차례() {
    let m = MenuLayout.main(forWindow: false, hotKeyOK: true, pendingUpdate: false, updaterAvailable: true)
    #expect(
      titles(m) == [
        "큐브로 가기", "(숨기기·보이기)", "—",
        "섞기", "공식 보기", "큐브 크기", "—",
        "기록 보기", "티어표", "—",
        "대결하기", "배우기", "—",
        "창", "키 배치·색…", "단축키 보기", "—",
        "다시 불러오기", "업데이트 확인…", "Cubie 끝내기",
      ])
  }

  @Test func 오른쪽_클릭_메뉴는_큐브로_가기와_업데이트_끝내기가_없다() {
    let m = MenuLayout.main(forWindow: true, hotKeyOK: true, pendingUpdate: true, updaterAvailable: true)
    #expect(
      titles(m) == [
        "섞기", "공식 보기", "큐브 크기", "—",
        "기록 보기", "티어표", "—",
        "대결하기", "배우기", "—",
        "창", "키 배치·색…", "단축키 보기", "—",
        "다시 불러오기",
      ])
  }

  @Test func 경고와_새_판은_맨_위에() {
    let bar = MenuLayout.main(forWindow: false, hotKeyOK: false, pendingUpdate: true, updaterAvailable: true)
    #expect(Array(bar.prefix(5)) == [.hotKeyWarning, .separator, .installUpdate, .separator, .focus])
    // 오른쪽 클릭 메뉴에도 단축키 경고는 보이고, 새 판 알림은 없다
    let win = MenuLayout.main(forWindow: true, hotKeyOK: false, pendingUpdate: true, updaterAvailable: true)
    #expect(Array(win.prefix(3)) == [.hotKeyWarning, .separator, .scramble])
    #expect(!win.contains(.installUpdate))
  }

  @Test func 업데이트를_못_쓰면_업데이트_확인이_없다() {
    let m = MenuLayout.main(forWindow: false, hotKeyOK: true, pendingUpdate: false, updaterAvailable: false)
    #expect(Array(m.suffix(2)) == [.reload, .quit])
  }

  @Test func 창_하위_메뉴의_차례() {
    #expect(
      titles(MenuLayout.window(multipleScreens: false)) == [
        "(창 크기 넷)", "—", "거울", "—", "자리 처음으로",
      ])
    #expect(
      titles(MenuLayout.window(multipleScreens: true)) == [
        "(창 크기 넷)", "—", "화면 옮기기", "거울", "—", "자리 처음으로",
      ])
  }

  @Test func 구분선은_처음_끝에_없고_겹치지_않는다() {
    var all: [[MenuEntry]] = [
      MenuLayout.window(multipleScreens: false), MenuLayout.window(multipleScreens: true),
    ]
    for forWindow in [false, true] {
      for hotKeyOK in [false, true] {
        for pending in [false, true] {
          for avail in [false, true] {
            all.append(
              MenuLayout.main(forWindow: forWindow, hotKeyOK: hotKeyOK, pendingUpdate: pending, updaterAvailable: avail))
          }
        }
      }
    }
    for m in all {
      #expect(m.first != .separator)
      #expect(m.last != .separator)
      #expect(!zip(m, m.dropFirst()).contains { $0 == .separator && $1 == .separator })
    }
  }

  @Test func 거울과_창_항목은_맨_위가_아니라_창_안에() {
    let m = MenuLayout.main(forWindow: false, hotKeyOK: true, pendingUpdate: false, updaterAvailable: true)
    for e in [MenuEntry.mirror, .windowSizes, .moveScreen, .resetFrame] {
      #expect(!m.contains(e))
    }
  }
}
