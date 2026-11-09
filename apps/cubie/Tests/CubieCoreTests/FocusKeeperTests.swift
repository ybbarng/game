import Testing

@testable import CubieCore

/// 가짜 앱(작업 공간에 넣는 앱 대신)
final class FakeApp: FocusApp {
  let name: String
  let isSelf: Bool
  var isTerminated = false
  init(_ name: String, isSelf: Bool = false) {
    self.name = name
    self.isSelf = isSelf
  }
}

struct FocusKeeperTests {
  let cubie = FakeApp("Cubie", isSelf: true)
  let editor = FakeApp("Editor")
  let browser = FakeApp("Browser")

  @Test func 단축키는_그때_앞_앱을_기억하고_Esc는_그_앱으로() {
    let k = FocusKeeper<FakeApp>(front: editor)
    #expect(k.hotKey(cubeFocused: false, front: browser) == .focusCube)
    #expect(k.returnTarget() === browser)
  }

  @Test func 큐브가_키를_받는_중이면_단축키는_돌려주기() {
    let k = FocusKeeper<FakeApp>(front: editor)
    #expect(k.hotKey(cubeFocused: true, front: cubie) == .returnFocus)
    #expect(k.returnTarget() === editor)
  }

  @Test func 큐브를_직접_눌러_왔어도_마지막_다른_앱으로_돌아간다() {
    let k = FocusKeeper<FakeApp>(front: nil)
    k.activated(editor)
    k.activated(cubie)  // 창을 눌러 Cubie가 앞으로
    #expect(k.returnTarget() === editor)
  }

  @Test func 자기_자신은_기억하지_않는다() {
    let k = FocusKeeper<FakeApp>(front: cubie)
    #expect(k.returnTarget() == nil)
    #expect(k.hotKey(cubeFocused: false, front: cubie) == .focusCube)
    #expect(k.returnTarget() == nil)
  }

  @Test func 끝난_앱으로는_돌아가지_않는다() {
    let k = FocusKeeper<FakeApp>(front: editor)
    editor.isTerminated = true
    #expect(k.returnTarget() == nil)
  }
}

struct KeySourceRuleTests {
  /// 2026-11-09 이 맥에서 Cubie가 받은 키의 칸 값(debug 기록)
  @Test func 실측한_칸_값으로_가린다() {
    // CGEvent.post(tap: .cghidEventTap), 소스 hidSystemState: 넣은 프로세스가 남는다
    #expect(!KeySourceRule.isKeyboard(stateID: 1, pid: 99845))
    // CGEvent.postToPid, 소스 combinedSessionState
    #expect(!KeySourceRule.isKeyboard(stateID: 0, pid: 99845))
    // osascript System Events keystroke: 실제 키보드와 같은 값으로 와서 가려지지 않는다(못 가리는 것)
    #expect(KeySourceRule.isKeyboard(stateID: 1, pid: 0))
    // 따로 둔 소스(privateState)
    #expect(!KeySourceRule.isKeyboard(stateID: -1, pid: 0))
  }
}
