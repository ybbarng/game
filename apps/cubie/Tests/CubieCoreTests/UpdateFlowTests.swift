import Testing

@testable import CubieCore

/// 새 판 확인 흐름(docs/52 5-24): 정해진 확인이 찾은 옛 항목을 들고 있다가 사용자가 누를 때 설치하지 않는다
struct UpdateFlowTests {
  @Test func 정해진_확인이_찾은_항목은_이어_가지_않고_세션을_끝낸다() {
    #expect(UpdateFlow.proceeds(.background, prompt: false) == false)
  }

  @Test func 사용자가_누른_확인은_찾은_항목으로_이어_간다() {
    #expect(UpdateFlow.proceeds(.user, prompt: false) == true)
    #expect(UpdateFlow.proceeds(.user, prompt: true) == true)
  }

  @Test func 켜다_꺼진_뒤에는_정해진_확인도_창으로_이어_간다() {
    #expect(UpdateFlow.proceeds(.background, prompt: true) == true)
  }

  @Test func 자동으로_받아_설치를_고른_사용자는_정해진_확인도_이어_가_받아_둔다() {
    #expect(UpdateFlow.proceeds(.background, prompt: false, autoDownload: true) == true)
  }

  @Test func 정해진_확인이_찾은_판을_메뉴로_알린다() {
    #expect(UpdateFlow.pending(nil, after: .found("0.11.6")) == "0.11.6")
  }

  @Test func 하루_뒤_사용자가_누른_확인이_더_새_판을_찾으면_그_판으로_바뀐다() {
    // 11-25 정해진 확인이 0.11.6, 11-26 사용자가 누를 때 appcast 맨 위는 0.12.3
    let held = UpdateFlow.pending(nil, after: .found("0.11.6"))
    #expect(UpdateFlow.pending(held, after: .found("0.12.3")) == "0.12.3")
  }

  @Test func 정해진_확인을_일부러_끝낸_오류는_알릴_판을_지우지_않는다() {
    #expect(UpdateFlow.pending("0.12.3", after: .failed) == "0.12.3")
  }

  @Test func 나중에로_닫으면_계속_알리고_건너뛰기를_고르면_지운다() {
    #expect(UpdateFlow.pending("0.12.3", after: .dismissed) == "0.12.3")
    #expect(UpdateFlow.pending("0.12.3", after: .skipped) == nil)
  }

  @Test func 새_판이_없으면_알릴_판을_지운다() {
    #expect(UpdateFlow.pending("0.12.3", after: .notFound) == nil)
  }
}
