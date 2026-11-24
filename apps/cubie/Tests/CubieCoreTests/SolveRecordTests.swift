import Foundation
import Testing

@testable import CubieCore

/// 다 맞춘 한 판의 기록 꾸미기(`SolveRecord.compose`)
struct SolveRecordTests {
  private let partial: [String: Any] = ["ms": 12345, "moves": 40, "scramble": "R U"]

  @Test func addsAppFieldsAndKeepsCoreFields() {
    let r = SolveRecord.compose(
      partial: partial, n: 3, atMs: 1_700_000_000_000, inputs: ["keyboard"], origins: ["hardware"], hints: 2)
    #expect(r["ms"] as? Int == 12345)
    #expect(r["scramble"] as? String == "R U")
    #expect(r["at"] as? Int == 1_700_000_000_000)
    #expect(r["n"] as? Int == 3)
    #expect(r["mode"] as? String == "solo")
    #expect(r["inspection"] as? Bool == false)
    #expect(r["inputs"] as? [String] == ["keyboard"])
    #expect(r["keyOrigin"] as? String == "hardware")
    #expect(r["hints"] as? Int == 2)
  }

  @Test func worstKeyOriginWins() {
    let mixed = SolveRecord.compose(
      partial: partial, n: 3, atMs: 0, inputs: [], origins: ["hardware", "synthetic", "unknown"], hints: 0)
    #expect(mixed["keyOrigin"] as? String == "synthetic")
    let soft = SolveRecord.compose(partial: partial, n: 3, atMs: 0, inputs: [], origins: ["hardware", "unknown"], hints: 0)
    #expect(soft["keyOrigin"] as? String == "unknown")
  }

  @Test func emptyInputsOriginsAndZeroHintsLeaveNoField() {
    let r = SolveRecord.compose(partial: partial, n: 2, atMs: 0, inputs: [], origins: [], hints: 0)
    #expect(r["inputs"] == nil)
    #expect(r["keyOrigin"] == nil)
    #expect(r["hints"] == nil)
  }
}

/// 거울 판을 보일지(`MirrorRule`)
struct MirrorRuleTests {
  private func shows(
    on: Bool = true, side: Double = 96, n: Int = 3, focused: Bool = true, solving: Bool = true, idle: Bool = false
  ) -> Bool {
    MirrorRule.shows(on: on, width: side, height: side, n: n, focused: focused, solving: solving, idleShowing: idle)
  }

  @Test func showsWhileSolvingWithFocus() {
    #expect(shows() == true)
  }

  @Test func hiddenWhenAnyConditionFails() {
    #expect(shows(on: false) == false)
    #expect(shows(focused: false) == false)
    #expect(shows(solving: false) == false)
    #expect(shows(idle: true) == false)
  }

  @Test func shortSideMustFitTenPointsPerLayer() {
    #expect(shows(side: 70, n: 7) == true)
    #expect(shows(side: 69, n: 7) == false)
    #expect(MirrorRule.shows(on: true, width: 200, height: 29, n: 3, focused: true, solving: true, idleShowing: false) == false)
  }
}

/// 코어 글 → 말풍선 줄(`BubbleLines`)
struct BubbleLinesTests {
  @Test func hintBecomesTitleNoteAlgAndKeys() {
    let raw = ["hint", "OLL", "물고기", "U", "R U R' U'", "", "key:J\u{1f}plain: \u{1f}key:F", "key:K"].joined(
      separator: "\n")
    let (kind, lines) = BubbleLines.hint(raw)
    #expect(kind == "hint")
    #expect(lines.map { $0["style"] as? String } == ["title", "note", "alg", "keys"])
    #expect(lines[0]["text"] as? String == "OLL · 물고기")
    #expect(lines[1]["text"] as? String == "U 뒤  K")
    #expect(lines[2]["text"] as? String == "R U R' U'")
    #expect(lines[3]["text"] as? String == "J F")
    #expect((lines[3]["spans"] as? [[String: Any]])?.map { $0["style"] as? String } == ["key", "plain", "key"])
  }

  @Test func hintWithoutCaseNameOrBeforeMoveIsShorter() {
    let (kind, lines) = BubbleLines.hint(["", "십자", "", "", "F R"].joined(separator: "\n"))
    #expect(kind == "none")
    #expect(lines.map { $0["text"] as? String } == ["십자", "F R"])
  }

  @Test func practiceLineCarriesStyleTextAndSpans() {
    let l = BubbleLines.line("keys\t다시 R\tplain:다시 \u{1f}key:R")
    #expect(l["style"] as? String == "keys")
    #expect(l["text"] as? String == "다시 R")
    #expect((l["spans"] as? [[String: Any]])?.count == 2)
    let plain = BubbleLines.line("title\t잘했어요.")
    #expect(plain["text"] as? String == "잘했어요.")
    #expect(plain["spans"] == nil)
  }

  @Test func keyLabelDropsKeyAndDigitPrefix() {
    #expect(BubbleLines.keyLabel("KeyR") == "R")
    #expect(BubbleLines.keyLabel("Digit3") == "3")
    #expect(BubbleLines.keyLabel("Enter") == "Enter")
  }
}
