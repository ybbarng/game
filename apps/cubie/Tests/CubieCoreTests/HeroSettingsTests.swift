import Foundation
import Testing

@testable import CubieCore

/// 떠 있을 때 홈 시연이 쓸 해법(사이트 미니 `heroRotation(n, settings.heroMethod)`의 첫 해법, `settings.ts` 읽기 규칙)
struct HeroSettingsTests {
  @Test func alternateUsesFirstMethodOfSize() {
    let s = CubeSettings.parse(nil)
    #expect(s.heroMethod == "alternate")
    #expect(s.heroMethodId(n: 3) == "3-beginner")
    #expect(s.heroMethodId(n: 2) == "2-beginner")
    #expect(s.heroMethodId(n: 8) == nil)
  }

  @Test func chosenMethodOnlyForItsSize() {
    let s = CubeSettings.parse(#"{"heroSize":3,"heroMethod":"3-cfop"}"#)
    #expect(s.heroMethodId(n: 3) == "3-cfop")
    #expect(s.heroMethodId(n: 4) == "4-beginner")
  }

  @Test func methodOfOtherSizeReadsAsAlternate() {
    // 사이트처럼 첫 화면 크기의 해법이 아니면 「번갈아」
    #expect(CubeSettings.parse(#"{"heroMethod":"4-cfop"}"#).heroMethod == "alternate")
    #expect(CubeSettings.parse(#"{"heroSize":4,"heroMethod":"4-cfop"}"#).heroMethodId(n: 4) == "4-cfop")
    #expect(CubeSettings.parse(#"{"heroSize":3.5,"heroMethod":"3-cfop"}"#).heroMethod == "3-cfop")
    #expect(CubeSettings.parse(#"{"heroSize":9,"heroMethod":"3-zz"}"#).heroMethodId(n: 3) == "3-zz")
  }
}
