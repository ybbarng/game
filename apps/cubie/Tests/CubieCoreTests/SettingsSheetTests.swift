import Foundation
import Testing

@testable import CubieCore

/// 네이티브 설정 창(docs/52 5-7)이 쓰는 저장 글: 사이트 `withScheme`·`withFaceColor`·`saveKeymap`·`toCustom`과 같은 꼴이고,
/// 바꾼 글을 큐브 창이 읽는 규칙(`CubeSettings.parse`·`StoredKeymap.parse`)으로 다시 읽으면 바꾼 값이 나온다
struct SettingsSheetTests {
  @Test func colorsRoundTripThroughCubeSettings() {
    let before = #"{"colorScheme":"standard","moveMs":120,"flowStrip":"small"}"#
    let hc = SettingsSheet.withScheme(before, "highContrast")
    #expect(CubeSettings.parse(hc).colors == CubeSettings.schemes["highContrast"])
    #expect(SettingsSheet.scheme(hc) == "highContrast")
    // 모르는 칸(Cubie가 쓰지 않는 사이트 설정)은 그대로
    #expect(hc.contains(#""flowStrip":"small""#) && CubeSettings.parse(hc).moveMs == 120)
    let custom = SettingsSheet.withFaceColor(hc, face: 2, color: 0x123456)
    #expect(SettingsSheet.scheme(custom) == "custom")
    var want = CubeSettings.schemes["highContrast"]!
    want[2] = 0x123456
    #expect(CubeSettings.parse(custom).colors == want)
    #expect(SettingsSheet.scheme(#"{"colorScheme":"rainbow"}"#) == "standard")
    #expect(SettingsSheet.hex(0xc8102e) == "#c8102e")
  }

  @Test func otherFieldsUpdate() {
    let s = SettingsSheet.updated(nil) {
      $0["moveMs"] = 150
      $0["scrambleShow"] = "spin"
      $0["stickerless"] = true
      $0["sound"] = false
    }
    let p = CubeSettings.parse(s)
    #expect(p.moveMs == 150 && p.scrambleShow == .spin && p.stickerless && !p.sound)
  }

  @Test func keymapPresetAndCustom() {
    let notation = SettingsSheet.presetKeymap("notation")
    #expect(StoredKeymap.parse(notation) == StoredKeymap(preset: "notation"))
    let table = "KeyI\t0\tR\nKeyI\t1\tRw\nKeyZ\t4\tundo\n"
    let custom = SettingsSheet.toCustom(SettingsSheet.presetKeymap("twoHand")) { p in p == "twoHand" ? table : "" }
    let parsed = StoredKeymap.parse(custom)
    #expect(parsed.preset == "custom")
    #expect(
      parsed.bindings == [
        .init(code: "KeyI", action: "R"), .init(code: "KeyI", shift: true, action: "Rw"),
        .init(code: "KeyZ", ctrl: true, action: "undo"),
      ])
    // 이미 사용자면 그대로
    #expect(SettingsSheet.toCustom(custom) { _ in "" } == custom)
  }
}
