import Testing

@testable import CubieCore

/// 키 배치 편집기를 다시 만든 뒤 키보드 포커스를 돌려줄 칩(`FocusKeep.pick`)
struct FocusKeepTests {
  private let fallback = ["unbind:R": "assign:R", "conflict-yes": "assign:R"]

  @Test func sameNamedChipGetsFocusBack() {
    #expect(FocusKeep.pick(saved: "group:face", fallback: fallback, available: ["group:face", "assign:R"]) == "group:face")
  }

  @Test func removedKeyChipHandsFocusToItsAssignChip() {
    #expect(FocusKeep.pick(saved: "unbind:R", fallback: fallback, available: ["assign:R", "assign:U"]) == "assign:R")
  }

  @Test func nothingToReturnToLeavesFocusOnTheWindow() {
    #expect(FocusKeep.pick(saved: "unbind:R", fallback: fallback, available: ["assign:U"]) == nil)
    #expect(FocusKeep.pick(saved: "port-copy", fallback: fallback, available: []) == nil)
    #expect(FocusKeep.pick(saved: nil, fallback: fallback, available: ["assign:R"]) == nil)
  }
}
