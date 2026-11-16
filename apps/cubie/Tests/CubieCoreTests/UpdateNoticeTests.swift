import Foundation
import Testing

@testable import CubieCore

struct UpdateNoticeTests {
  let t0 = Date(timeIntervalSince1970: 1_800_000_000)
  let day = UpdateNotice.repeatInterval

  @Test func 새_판이_없으면_알리지_않는다() {
    #expect(!UpdateNotice.shouldShow(pending: nil, last: nil, now: t0, solving: false))
    #expect(!UpdateNotice.shouldShow(pending: "", last: nil, now: t0, solving: false))
  }

  @Test func 처음_찾은_판은_바로_알린다() {
    #expect(UpdateNotice.shouldShow(pending: "0.3.1", last: nil, now: t0, solving: false))
  }

  @Test func 맞추는_중이면_미룬다() {
    #expect(!UpdateNotice.shouldShow(pending: "0.3.1", last: nil, now: t0, solving: true))
  }

  @Test func 같은_판은_하루에_한_번만() {
    let last = UpdateNotice.Shown(version: "0.3.1", at: t0)
    #expect(!UpdateNotice.shouldShow(pending: "0.3.1", last: last, now: t0, solving: false))
    #expect(!UpdateNotice.shouldShow(pending: "0.3.1", last: last, now: t0 + day - 1, solving: false))
    #expect(UpdateNotice.shouldShow(pending: "0.3.1", last: last, now: t0 + day, solving: false))
    // 하루가 지나도 맞추는 중이면 미룬다
    #expect(!UpdateNotice.shouldShow(pending: "0.3.1", last: last, now: t0 + day, solving: true))
  }

  @Test func 다른_판이면_하루가_안_지나도_알린다() {
    let last = UpdateNotice.Shown(version: "0.3.1", at: t0)
    #expect(UpdateNotice.shouldShow(pending: "0.3.2", last: last, now: t0 + 60, solving: false))
  }

  @Test func 시계를_뒤로_돌렸으면_다시_알린다() {
    let last = UpdateNotice.Shown(version: "0.3.1", at: t0)
    #expect(UpdateNotice.shouldShow(pending: "0.3.1", last: last, now: t0 - 60, solving: false))
  }

  @Test func 글은_판_번호와_설치만() {
    #expect(UpdateNotice.text(version: "0.3.1") == "새 판 0.3.1 설치")
  }
}
