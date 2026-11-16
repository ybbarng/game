import Foundation
import Testing

@testable import CubieCore

/// 사용자 키 배치 편집기 화면 자료(코어 `cubie_keymap_view`·`cubie_keymap_edit` 줄) 읽기
struct KeymapEditorModelTests {
  @Test func parsesGroupsActionsAndKeys() {
    let text = [
      "preset\tcustom", "mouse\t1", "keyless\t키가 없는 동작: U. 「키 지정」으로 놓아 주세요.", "conflicts\t",
      "group\tface\t면 돌리기\t18\t1", "action\tR\tR\t0\tKeyI\u{1f}I\u{1e}KeyJ\u{1f}J", "action\tU\tU\t1\t",
      "group\tcommand\t명령\t7\t0", "action\tundo\t되돌리기\t0\tCtrl+KeyZ\u{1f}Ctrl+Z",
    ].joined(separator: "\n")
    let m = KeymapEditorModel.parse(text)
    #expect(m.preset == "custom" && m.mouseRotate)
    #expect(m.keylessText.hasPrefix("키가 없는 동작: U."))
    #expect(m.conflictsText.isEmpty)
    #expect(m.groups.map(\.id) == ["face", "command"])
    #expect(m.groups[0].missing == 1 && m.groups[0].count == 18)
    #expect(m.groups[0].actions[0].keys.map(\.label) == ["I", "J"])
    #expect(m.groups[0].actions[0].keys.map(\.id) == ["KeyI", "KeyJ"])
    #expect(m.groups[0].actions[1].keyless && m.groups[0].actions[1].keys.isEmpty)
    #expect(m.groups[1].actions[0].label == "되돌리기")
  }

  @Test func parsesEditResult() {
    let ok = KeymapEditorModel.parseEdit("{\"version\":1}\nmsg\t배치를 가져왔어요.")
    #expect(ok.stored == "{\"version\":1}" && ok.message == "배치를 가져왔어요." && ok.error == nil)
    let bad = KeymapEditorModel.parseEdit("{}\nerr\tJSON 글이 아니에요.")
    #expect(bad.error == "JSON 글이 아니에요." && bad.message == nil)
    let quiet = KeymapEditorModel.parseEdit("{}")
    #expect(quiet.message == nil && quiet.error == nil)
  }
}
