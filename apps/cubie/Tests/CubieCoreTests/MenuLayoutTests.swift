import Testing

@testable import CubieCore

struct MenuLayoutTests {
  /// 웹이 보내는 연습 단계(사이트 `practice/stages.ts` 차례 일부)
  private let stages = [
    PracticeStageItem(id: "beginner-cross", title: "십자", group: "초보자"),
    PracticeStageItem(id: "beginner-second", title: "2층", group: "초보자"),
    PracticeStageItem(id: "f2l", title: "F2L", group: "CFOP"),
    PracticeStageItem(id: "2look-oll", title: "2단계 OLL", group: "CFOP"),
  ]

  private func titles(_ entries: [MenuEntry]) -> [String] {
    entries.map { e in
      switch e {
      case .separator: "—"
      case .profile: "(프로필)"
      case .hotKeyWarning: "(경고)"
      case .installUpdate: "(새 판)"
      case .toggleVisible: "(숨기기·보이기)"
      case .windowSizes: "(창 크기 넷)"
      case .practiceGroup(let g): "[\(g)]"
      default: e.title ?? "?"
      }
    }
  }

  @Test func 메뉴_막대_메뉴의_차례() {
    let m = MenuLayout.main(forWindow: false, hotKeyOK: true, pendingUpdate: false, updaterAvailable: true, practiceAvailable: true)
    #expect(
      titles(m) == [
        "(프로필)", "—",
        "큐브로 가기", "(숨기기·보이기)", "—",
        "섞기", "힌트", "공식 연습", "큐브 크기", "—",
        "기록 보기", "티어표", "—",
        "대결하기", "배우기", "—",
        "창", "키 배치·색…", "단축키 보기", "—",
        "다시 불러오기", "업데이트 확인…", "Cubie 끝내기",
      ])
  }

  @Test func 오른쪽_클릭_메뉴는_큐브로_가기와_업데이트_끝내기가_없다() {
    let m = MenuLayout.main(forWindow: true, hotKeyOK: true, pendingUpdate: true, updaterAvailable: true, practiceAvailable: true)
    #expect(
      titles(m) == [
        "섞기", "힌트", "공식 연습", "큐브 크기", "—",
        "기록 보기", "티어표", "—",
        "대결하기", "배우기", "—",
        "창", "키 배치·색…", "단축키 보기", "—",
        "다시 불러오기",
      ])
  }

  @Test func 경고와_새_판은_맨_위에() {
    let bar = MenuLayout.main(forWindow: false, hotKeyOK: false, pendingUpdate: true, updaterAvailable: true, practiceAvailable: true)
    #expect(
      Array(bar.prefix(7)) == [.profile, .separator, .hotKeyWarning, .separator, .installUpdate, .separator, .focus])
    // 오른쪽 클릭 메뉴에도 단축키 경고는 보이고, 새 판 알림은 없다
    let win = MenuLayout.main(forWindow: true, hotKeyOK: false, pendingUpdate: true, updaterAvailable: true, practiceAvailable: true)
    #expect(Array(win.prefix(3)) == [.hotKeyWarning, .separator, .scramble])
    #expect(!win.contains(.installUpdate))
    // 프로필 칸은 앱 전체의 것이라 메뉴 막대 메뉴에만
    #expect(!win.contains(.profile))
  }

  @Test func 업데이트를_못_쓰면_업데이트_확인이_없다() {
    let m = MenuLayout.main(forWindow: false, hotKeyOK: true, pendingUpdate: false, updaterAvailable: false, practiceAvailable: true)
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
      MenuLayout.practice(stages: stages), MenuLayout.practice(stages: []),
    ]
    for forWindow in [false, true] {
      for hotKeyOK in [false, true] {
        for pending in [false, true] {
          for avail in [false, true] {
            all.append(
              MenuLayout.main(
                forWindow: forWindow, hotKeyOK: hotKeyOK, pendingUpdate: pending, updaterAvailable: avail,
                practiceAvailable: avail))
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
    let m = MenuLayout.main(forWindow: false, hotKeyOK: true, pendingUpdate: false, updaterAvailable: true, practiceAvailable: true)
    for e in [MenuEntry.mirror, .windowSizes, .moveScreen, .resetFrame] {
      #expect(!m.contains(e))
    }
  }

  @Test func 공식_연습_하위_메뉴는_묶음마다_이름_줄과_단계_맨_아래_연습_끝내기() {
    #expect(
      titles(MenuLayout.practice(stages: stages)) == [
        "[초보자]", "십자", "2층", "—",
        "[CFOP]", "F2L", "2단계 OLL", "—",
        "보고 치기", "—", "연습 끝내기",
      ])
    #expect(MenuLayout.practice(stages: stages)[1] == .practiceStage(id: "beginner-cross", title: "십자"))
  }

  @Test func 옛_화면이면_공식_연습이_없다() {
    let m = MenuLayout.main(
      forWindow: false, hotKeyOK: true, pendingUpdate: false, updaterAvailable: true, practiceAvailable: false)
    #expect(!m.contains(.practice))
    #expect(m.contains(.hint))
  }

  @Test func 연습_단계_목록_읽기는_틀린_줄을_버린다() {
    let rows: [[String: Any]] = [
      ["id": "f2l", "title": "F2L", "group": "CFOP"],
      ["id": "", "title": "빈", "group": "CFOP"],
      ["title": "id 없음", "group": "CFOP"],
      ["id": "oll", "title": 3, "group": "CFOP"],
    ]
    #expect(PracticeStageItem.list(from: rows) == [PracticeStageItem(id: "f2l", title: "F2L", group: "CFOP")])
    #expect(PracticeStageItem.list(from: nil).isEmpty)
    #expect(PracticeStageItem.list(from: "x").isEmpty)
  }
}
