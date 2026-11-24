import Foundation
import Testing

@testable import CubieCore

/// 메뉴 프로필 칸: 저장된 이름 읽기·새 이름 짓기·티어 글
struct ProfileTests {
  @Test func 저장된_이름을_읽는다() {
    #expect(Profile.storedName(#"{"version":1,"name":"큐브왕"}"#) == "큐브왕")
  }

  @Test func 저장이_없거나_이름이_비거나_모양이_틀리면_새로_짓는다() {
    #expect(Profile.storedName(nil) == nil)
    #expect(Profile.storedName(#"{"version":1,"name":"   "}"#) == nil)
    #expect(Profile.storedName(#"{"version":1,"name":3}"#) == nil)
    #expect(Profile.storedName("not json") == nil)
  }

  @Test func 새_이름은_네_자리_번호와_사이트와_같은_저장_글() {
    let made = Profile.madeName(0)
    #expect(made.name == "익명 큐버 #1000")
    #expect(made.stored == #"{"version":1,"name":"익명 큐버 #1000"}"#)
    #expect(Profile.madeName(8999).name == "익명 큐버 #9999")
    #expect(Profile.storedName(made.stored) == made.name)
  }

  @Test func 티어_글은_크기와_티어_이름_없으면_5판_뒤에() {
    #expect(Profile.tierText(n: 3, tierName: "골드 II") == "3×3 골드 II")
    #expect(Profile.tierText(n: 7, tierName: nil) == "7×7 5판 뒤에")
  }

  @Test func 읽기_전에는_번호_없는_익명_이름() {
    #expect(Profile.placeholder.name == "익명 큐버")
    #expect(Profile.placeholder.emblem == nil)
  }
}
