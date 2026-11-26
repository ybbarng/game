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
    let s = CubeSettings.parse(#"{"heroMethod":"3-cfop"}"#)
    #expect(s.heroMethodId(n: 3) == "3-cfop")
    #expect(s.heroMethodId(n: 4) == "4-beginner")
  }

  @Test func removedHeroSizeIsIgnored() {
    // 사이트가 없앤 첫 화면 연출 크기(heroSize)는 읽지 않는다: 남은 옛 값이 해법을 「번갈아」로 바꾸지 않는다
    #expect(CubeSettings.parse(#"{"heroMethod":"4-cfop"}"#).heroMethod == "4-cfop")
    #expect(CubeSettings.parse(#"{"heroSize":3,"heroMethod":"4-cfop"}"#).heroMethodId(n: 4) == "4-cfop")
    #expect(CubeSettings.parse(#"{"heroSize":9,"heroMethod":"3-zz"}"#).heroMethodId(n: 3) == "3-zz")
    // 4×4 야우도 고를 수 있다(사이트 해법 표 `4-yau`)
    #expect(CubeSettings.parse(#"{"heroMethod":"4-yau"}"#).heroMethodId(n: 4) == "4-yau")
  }

  @Test func unknownMethodReadsAsAlternate() {
    #expect(CubeSettings.parse(#"{"heroMethod":"없는 해법"}"#).heroMethod == "alternate")
    #expect(CubeSettings.parse(#"{"heroMethod":3}"#).heroMethod == "alternate")
  }
}
