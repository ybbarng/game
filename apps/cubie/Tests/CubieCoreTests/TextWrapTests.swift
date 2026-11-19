import Testing

@testable import CubieCore

/// 숫자와 단위를 갈라 줄을 바꾸지 않게 하는 도우미(docs/52 5-8 「숫자와 단위」)
struct TextWrapTests {
  /// 줄바꿈 막는 글자를 「+」로 보이게 바꾼다(실패 메시지에서 어디에 들었는지 읽히게)
  func shown(_ s: String) -> String {
    String(TextWrap.keepNumberUnits(s).map { $0 == TextWrap.joiner ? "+" : $0 })
  }

  @Test func numberStaysWithItsHangulUnit() {
    #expect(shown("힌트를 쓴 판이 든 5판은") == "힌트를 쓴 판이 든 5+판은")
    #expect(shown("12판") == "12+판")
    #expect(shown("3초") == "3+초")
  }

  @Test func rangesAndTimesStayInOnePiece() {
    #expect(shown("7~11번") == "7+~+11+번")
    #expect(shown("12.34초") == "12+.+34+초")
    #expect(shown("1:05.20") == "1+:+05+.+20")
    #expect(shown("3×3 기록") == "3+×+3 기록")
    #expect(shown("상위 0.42% · 1,209명") == "상위 0+.+42+% · 1+,+209+명")
  }

  @Test func spacedWordsCanStillBreak() {
    // 띄어 쓴 자리, 글자끼리, 숫자 없는 글은 그대로
    #expect(shown("5 판") == "5 판")
    #expect(shown("최고 5판 평균") == "최고 5+판 평균")
    #expect(shown("큐브에 키 입력이 있는 동안만 재요.") == "큐브에 키 입력이 있는 동안만 재요.")
    #expect(shown("R U R'") == "R U R'")
  }

  @Test func joinerHasNoWidthAndIsNotDoubled() {
    let once = TextWrap.keepNumberUnits("5판")
    #expect(TextWrap.keepNumberUnits(once) == once)
    #expect(once.replacingOccurrences(of: String(TextWrap.joiner), with: "") == "5판")
  }
}
